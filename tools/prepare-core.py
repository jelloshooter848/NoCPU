#!/usr/bin/env python3
"""Prepare an auditable, disposable six-game portable copy of DICE 0.9.

Original scheduler/netlist/chip logic remain unchanged. Exact replacements fail
closed if upstream differs. Complete changed-file diffs accompany the build.
"""
import argparse
import difflib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
out = args.output.resolve()
build = (ROOT / "build").resolve()
if build not in out.parents or out == build:
    raise SystemExit("Core copy must be a dedicated directory under ignored build/")
if out.exists():
    shutil.rmtree(out)
shutil.copytree(ROOT / "upstream/dice-0.9", out)
diff = []

def write(name, contents):
    path = out / name
    before = path.read_bytes().decode("utf-8").replace("\r\n", "\n") if path.exists() else ""
    path.write_text(contents, encoding="utf-8")
    diff.extend(difflib.unified_diff(before.splitlines(True), contents.splitlines(True),
                                   fromfile="upstream/"+name, tofile="portable/"+name))

def edit(name, replacements):
    contents = (out / name).read_bytes().decode("utf-8").replace("\r\n", "\n")
    for old,new in replacements:
        if contents.count(old) != 1:
            raise SystemExit("Expected exactly one source match in "+name+": "+repr(old))
        contents = contents.replace(old,new)
    write(name,contents)

def replace_function(contents, signature, replacement):
    if contents.count(signature) != 1:
        raise SystemExit("Expected one function: "+signature)
    start=contents.index(signature)
    brace=contents.index("{",start)
    depth=1;end=brace+1
    while depth:
        depth += (contents[end]=="{")-(contents[end]=="}")
        end+=1
    return contents[:start]+replacement+contents[end:]

for name in ("settings.h","game_config.h","realtime.h"):
    write(name,(ROOT/"core/platform"/name).read_text())
write("port_hooks.h",(ROOT/"core/port_hooks.h").read_text())
edit("circuit.cpp",[( '#include "circuit_desc.h"','#include "circuit_desc.h"\n#include "port_hooks.h"\n#include <algorithm>'),
    ('        ChipDescPair cd(chips.back(), d);','        nocpu_register_chip(name.c_str(), d->output_pin, chips.back());\n        ChipDescPair cd(chips.back(), d);'),
    ('                delete *it;', '                nocpu_unregister_chip(*it);\n                delete *it;')])
edit("chip.cpp",[('#include "chip.h"','#include "chip.h"\n#include "port_hooks.h"'),
    # Supply chips have no logic function. Their custom-update union member is
    # still inspected by Chip::connect to identify the deoptimizer. Initialize
    # it so allocator reuse during reset cannot disconnect VCC/GND inputs.
    ('        type = CUSTOM_CHIP;\n        return;',
     '        type = CUSTOM_CHIP;\n        custom_update = nullptr;\n        return;'),
    ('void Chip::update_output()\n{','void Chip::update_output()\n{\n    NoCPUOutputObservation observation(this);')])
# Historical iterators inspected the one-past-end entry before testing bounds.
# Reorder the guard without changing the set of valid netlist entries.
edit("circuit_desc.h",[
    ('while(c->type != GetType<T>() && c != end) c++;',
     'while(c != end && c->type != GetType<T>()) c++;'),
    ('while(c->type != GetType<T>() && c != end); }',
     'while(c != end && c->type != GetType<T>()); }')])
# Drop hardware acquisition methods while retaining every original conversion,
# poll clock and INPUT chip definition byte-for-byte apart from newline encoding.
contents=(out/"chips/input.cpp").read_text()
start=contents.index("Input::Input()")
contents=contents[:start]
contents=contents.replace('#include "../manymouse/manymouse.h"\n#include <SDL/SDL.h>','')
write("chips/input.cpp",contents)
edit("chips/input.h",[('#include <SDL/SDL_joystick.h>',''),
    ('    std::vector<SDL_Joystick*> joysticks;',''),
    ('    Input();','    bool coin, start, start2, serve;\n    int16_t axes[4];\n    bool up[2],down[2];\n    bool coin_extra[4],throttle_held,buttons[4][4];\n    Input();')])

# Original RomDesc lookup is a host ZIP/Qt cache, not PROM logic. The portable
# lookup reads validated session-owned descriptor bytes, retaining 0xff reads.
write('chips/rom.cpp',(ROOT/'core/platform/portable_rom.cpp').read_text())
write('rom_session.h',(ROOT/'core/platform/rom_session.h').read_text())

# SDL only transported already-synthesized samples. The graph and all sample
# arithmetic are preserved; the queue now drains explicitly through the C ABI.
contents=(out/"chips/audio.cpp").read_text()
contents=contents.replace('#include <SDL/SDL.h>','#include "../port_hooks.h"')
contents=contents.replace('    SDL_LockAudio();\n    audio->audio_buffer.push_back(sample);\n    SDL_UnlockAudio();',
                         '    nocpu_capture_audio(chip->circuit->global_time, sample);')
contents=replace_function(contents,'void Audio::audio_init(Circuit* circuit)',
    'void Audio::audio_init(Circuit* circuit) {\n    settings=&circuit->settings.audio;\n    if(desc) gain=desc->gain;\n    sample_period=1.0/double(Settings::Audio::FREQUENCIES[settings->frequency]);\n}')
contents=replace_function(contents,'void Audio::toggle_mute()','void Audio::toggle_mute() {}')
contents=replace_function(contents,'Audio::~Audio()','Audio::~Audio() {}')
contents=replace_function(contents,'void Audio::callback(void* userdata, uint8_t* str, int len)',
                          'void Audio::callback(void*, uint8_t*, int) {}')
write("chips/audio.cpp",contents)

# Retain Video::video timing and VIDEO_Buf delays; replace GL presentation only.
contents=(out/"chips/video.cpp").read_text()
start=contents.index('#include <phoenix.hpp>');end=contents.index('/*',start)
contents=contents[:start]+'#include "../port_hooks.h"\n#include <algorithm>\n#include <cmath>\n\n'+contents[end:]
start=contents.index('void Video::video_init(');end=contents.index('void Video::init_color_lut(',start)
contents=contents[:start]+contents[end:]
for signature in ('void Video::draw(Chip* chip)','void Video::draw_overlays()'):
    contents=replace_function(contents,signature,'')
contents=contents[:contents.index('\n#ifdef _WIN32')]
contents=contents.replace('color(3 << 8)','color(3 << 8), back(WIDTH*HEIGHT*4,0), front(WIDTH*HEIGHT*4,0)')
contents=contents.replace('        video->swap_buffers();\n        if(video->desc->scan_mode == PROGRESSIVE)',
    '        video->swap_buffers();\n        nocpu_capture_frame(global_time);\n        if(video->desc->scan_mode == PROGRESSIVE)')
contents=contents.replace('            glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);',
    '            for(size_t i=0;i<video->back.size();++i) video->back[i]=(i%4==3)?255:0;')
throttle='''        // Make sure real time is caught up
        if(chip->circuit->settings.throttle)
            while(chip->circuit->rtc.get_usecs() < uint64_t(global_time * 1000000.0 * Circuit::timescale));'''
if contents.count(throttle)!=1: raise SystemExit('Missing original video wall-clock block')
contents=contents.replace(throttle,'        // Presentation pacing belongs to the host; never busy-wait here.')
contents+='\n'+(ROOT/'core/platform/portable_video.inc').read_text()
write('chips/video.cpp',contents)
edit('chips/video.h',[
    ('    std::vector<float> color;','    std::vector<float> color;\n    std::vector<uint8_t> back,front;\n    unsigned pixels_width=576,pixels_height=432,viewport_x=0,viewport_y=0;\n    float projection[6]={};\n    void draw_quad(float x0,float y0,float x1,float y1,const uint8_t rgb[3],bool blend);'),
    ('    virtual void swap_buffers() = 0;','    virtual void swap_buffers();'),
    ('    virtual void show_cursor(bool show) = 0;','    virtual void show_cursor(bool show);'),
    ('    static Video* createDefault(phoenix::VerticalLayout& layout, phoenix::Viewport*& viewport);',
     '    enum { WIDTH=576, HEIGHT=432 };\n    unsigned pixel_width() const { return pixels_width; }\n    unsigned pixel_height() const { return pixels_height; }\n    const uint8_t* pixels() const { return front.data(); }')])

# DICE stores mutable hardware descriptors statically. A portable reset creates
# a fresh machine, so restore custom descriptor objects before construction.
reset='''
void nocpu_reset_pong_descriptors() {
    a9_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    b9_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    f4_555_desc=Mono555Desc(K_OHM(330.0),U_FARAD(4.7));
    g4_555_desc=Mono555Desc(K_OHM(220.0),U_FARAD(1.0));
    pad1_desc=Paddle1VerticalDesc(17000.0,145000.0,&b9_555_desc);
    pad2_desc=Paddle2VerticalDesc(17000.0,145000.0,&a9_555_desc);
    dipswitch1_desc=DipswitchDesc("winning_score","Winning Score",0,"11","15");
}
void nocpu_configure_pong(unsigned dip) {
    ((DipswitchBase*)&dipswitch1_desc)->state=dip;
}
'''
write('games/pong.cpp',(out/'games/pong.cpp').read_text()+reset)

reset_doubles='''
void nocpu_reset_pongdoubles_descriptors() {
    a3_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(0.1));
    a10_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    b10_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    b9a_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    b9b_555_desc=Mono555Desc(K_OHM(70.0),U_FARAD(0.1));
    f5_555_desc=Mono555Desc(K_OHM(330.0),U_FARAD(4.7));
    g5_555_desc=Mono555Desc(K_OHM(220.0),U_FARAD(1.0));
    c33_desc=SeriesRCDesc(K_OHM(1.0),U_FARAD(0.1));
    pad1_desc=Paddle1VerticalDesc(17000.0,145000.0,&b10_555_desc);
    pad2_desc=Paddle2VerticalDesc(17000.0,145000.0,&a10_555_desc);
    pad3_desc=Paddle3VerticalDesc(17000.0,145000.0,&b9a_555_desc);
    pad4_desc=Paddle4VerticalDesc(17000.0,145000.0,&b9b_555_desc);
    dipswitch1_desc=DipswitchDesc("winning_score","Winning Score",0,"11","15");
}
void nocpu_configure_pongdoubles(unsigned dip) {
    ((DipswitchBase*)&dipswitch1_desc)->state=dip;
}
'''
write('games/pongdoubles.cpp',(out/'games/pongdoubles.cpp').read_text()+reset_doubles)

# Static cold templates receive C++ zero-initialization before constructors.
# In particular PWM555Desc leaves two scalar fields uninitialized in automatic
# temporaries; copying a static cold template preserves the original cold zero
# values without introducing indeterminate values. The templates never run.
reset_space='''
static const PWM555Desc nocpu_cold_d9(K_OHM(151.0),U_FARAD(0.1));
static const RCFilterDesc nocpu_cold_c25(K_OHM(470.0),K_OHM(470.0),U_FARAD(0.1));
static const RCFilterDesc nocpu_cold_c19(K_OHM(470.0),K_OHM(470.0),U_FARAD(0.1));
static const RCFilterDesc nocpu_cold_c32(K_OHM(25.2),K_OHM(25.2),U_FARAD(4.7));
static const NE566Desc nocpu_cold_a4(K_OHM(6.8),U_FARAD(0.1));
static const NE566Desc nocpu_cold_b4(K_OHM(10.0),U_FARAD(0.1));
static const NE566Desc nocpu_cold_c4(K_OHM(10.0),U_FARAD(0.1));
static const MixerDesc nocpu_cold_mixer({K_OHM(10.0),K_OHM(10.0),K_OHM(4.7)},0.0,U_FARAD(0.1));
void nocpu_reset_spacerace_descriptors() {
    a3_555_desc=Mono555Desc(K_OHM(6.8)+K_OHM(6.8),U_FARAD(4.7));
    a6_555_desc=Mono555Desc(K_OHM(330.0),U_FARAD(4.7));
    a9_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(0.1));
    b6_555_desc=Mono555Desc(K_OHM(330.0),U_FARAD(4.7));
    c9_555_desc=Mono555Desc(K_OHM(1000.0),U_FARAD(100.0));
    d9_555_desc=nocpu_cold_d9;
    l4_desc=Mono9602Desc(K_OHM(10.0),P_FARAD(100.0),K_OHM(10.0),P_FARAD(100.0));
    dipswitch1_desc=DipswitchDesc("coinage","Coinage",0,"1 Coin / 1 Credit","1 Coin / 2 Credits");
    // Preserve the original reference binding. The original potentiometer
    // chip updates C9.r at initialization and on its subsequent 250 ms polls.
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(970.0);
    coin_cap_desc=SeriesRCDesc(K_OHM(1.0),U_FARAD(0.1));
    c25_filter_desc=nocpu_cold_c25;c19_filter_desc=nocpu_cold_c19;c32_filter_desc=nocpu_cold_c32;
    a4_566_desc=nocpu_cold_a4;b4_566_desc=nocpu_cold_b4;c4_566_desc=nocpu_cold_c4;
    mixer_desc=nocpu_cold_mixer;
}
void nocpu_configure_spacerace(unsigned dip,unsigned pot_ohms) {
    ((DipswitchBase*)&dipswitch1_desc)->state=dip;
    ((PotentiometerBase*)&pot1_desc)->current_val=double(pot_ohms);
}
'''
write('games/spacerace.cpp',(out/'games/spacerace.cpp').read_text()+reset_space)

reset_breakout='''
// Copy the original cold static mixer, including its private capacitor state.
// RAM82S16 is an original static array, not a ROM or per-Chip allocation.
static const MixerDesc nocpu_cold_breakout_mixer=mixer_desc;
void nocpu_reset_breakout_descriptors() {
    b2_555_desc=Astable555Desc(OHM(560.0),M_OHM(1.8),U_FARAD(0.1));
    c9_555_desc=Mono555Desc(OHM(47.0),U_FARAD(1.0));
    for(auto& bit:l3_desc) bit=0;
    mixer_desc=nocpu_cold_breakout_mixer;
    pad1_desc=Paddle1HorizontalDesc(15047.0,47.0,&c9_555_desc);
    c32_desc=CapacitorDesc(U_FARAD(0.1));
    c36_desc=CapacitorDesc(N_FARAD(1.0));
    c37_desc=CapacitorDesc(P_FARAD(330.0));
    pad_en_buf_desc=BufferDesc(DELAY_NS(15.0),DELAY_NS(15.0));
    // Original 9602 descriptors hold fixed RC values; their callbacks update
    // newly allocated Chip delays, rather than accumulating descriptor state.
    n8_desc=Mono9602Desc(K_OHM(33.0),U_FARAD(100.0),K_OHM(5.6),P_FARAD(0.0));
    f3_desc=Mono9602Desc(K_OHM(47.0),U_FARAD(1.0),K_OHM(47.0),U_FARAD(1.0));
    a7_desc=Mono9602Desc(K_OHM(68.0),U_FARAD(1.0),K_OHM(22.0),U_FARAD(10.0));
    a8_desc=Mono9602Desc(K_OHM(27.0),U_FARAD(1.0),K_OHM(27.0),U_FARAD(1.0));
    ((DipswitchBase*)&dipswitch1_desc)->state=3;
    ((DipswitchBase*)&dipswitch2_desc)->state=0;
    ((DipswitchBase*)&dipswitch3_desc)->state=0;
    ((DipswitchBase*)&dipswitch4_desc)->state=0;
}
void nocpu_configure_breakout(unsigned packed_dips) {
    ((DipswitchBase*)&dipswitch1_desc)->state=packed_dips&15;
    ((DipswitchBase*)&dipswitch2_desc)->state=(packed_dips>>4)&1;
    ((DipswitchBase*)&dipswitch3_desc)->state=(packed_dips>>5)&1;
    ((DipswitchBase*)&dipswitch4_desc)->state=(packed_dips>>6)&1;
}
'''
write('games/breakout.cpp',(out/'games/breakout.cpp').read_text()+reset_breakout)

reset_stunt='''
void nocpu_reset_stuntcycle_descriptors() {
    stunt_cycle_throttle_desc={0.0,0.0,0};
    c57_desc=CapacitorDesc(P_FARAD(220.0),OHM(330.0));
    c58_desc=CapacitorDesc(P_FARAD(220.0));
    n6_desc=Mono9602Desc(K_OHM(47.0),U_FARAD(100.0),K_OHM(47.0),U_FARAD(1.0));
    c13_desc=SeriesRCDesc(K_OHM(2.2),P_FARAD(470.0));
    ((DipswitchBase*)&f5_desc)->state=4;
    ((DipswitchBase*)&f7_desc)->state=9;
    ((DipswitchBase*)&dipswitch1_desc)->state=0;
    ((DipswitchBase*)&dipswitch2_desc)->state=0;
}
void nocpu_configure_stuntcycle(unsigned dip) {
    ((DipswitchBase*)&f5_desc)->state=dip&7;
    ((DipswitchBase*)&f7_desc)->state=(dip>>3)&15;
    ((DipswitchBase*)&dipswitch1_desc)->state=(dip>>7)&1;
    ((DipswitchBase*)&dipswitch2_desc)->state=(dip>>8)&1;
}
unsigned nocpu_stuntcycle_throttle_value() {
    return unsigned(stunt_cycle_throttle_desc.throttle_pos*1000.0+0.5);
}
'''
write('games/stuntcycle.cpp',(out/'games/stuntcycle.cpp').read_text()+reset_stunt)

reset_indy='''
void nocpu_reset_indy4_descriptors() {
    carl1_555_desc=Mono555Desc(K_OHM(82),U_FARAD(5));
    coinl1_555_desc=Astable555Desc(K_OHM(720.0),K_OHM(220.0),U_FARAD(1.0));
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(720.0);
    // cirque has no safe assignment operator. Clear each owned queue in place.
    wheel1_desc.angle=wheel2_desc.angle=wheel3_desc.angle=wheel4_desc.angle=0.0;
    for(unsigned i=0;i<2;++i) {
        wheel1_desc.wheel_events[i].clear();wheel2_desc.wheel_events[i].clear();
        wheel3_desc.wheel_events[i].clear();wheel4_desc.wheel_events[i].clear();
    }
    carcap27_desc=CapacitorDesc(P_FARAD(100));
    carcap31_desc=CapacitorDesc(P_FARAD(100));
    carcap32_desc=CapacitorDesc(P_FARAD(100));
    coincap35_desc=CapacitorDesc(U_FARAD(0.1));
    scorecap08_desc=CapacitorDesc(P_FARAD(33));
    scorecap10_desc=CapacitorDesc(U_FARAD(0.001));
    scorecap11_desc=CapacitorDesc(U_FARAD(0.001));
    scorecap12_desc=CapacitorDesc(U_FARAD(0.001));
    scorecap13_desc=CapacitorDesc(U_FARAD(0.001));
    scorecap14_desc=CapacitorDesc(U_FARAD(0.001));
    synccap01_desc=CapacitorDesc(P_FARAD(330));
}
void nocpu_configure_indy4(unsigned pot_ohms) {
    ((PotentiometerBase*)&pot1_desc)->current_val=double(pot_ohms);
}
'''
write('games/indy4.cpp',(out/'games/indy4.cpp').read_text()+reset_indy)

sources=['chip.cpp','circuit.cpp','games/pong.cpp','games/pongdoubles.cpp','games/spacerace.cpp','games/breakout.cpp','games/stuntcycle.cpp','games/indy4.cpp']
chips=['7400','7402','7404','7410','7420','7425','7427','7430','7448','7450','7474','7483','7486','7490','7493','74107','74153','9316','555mono','clock','latch','clk_gate','input','audio','video','dipswitch',
       'capacitor','555pwm','566','9602','diode_matrix','mixer','9311','9312','9322',
       '555astable','7408','7411','74175','74192','74193','74279','7432','7437','82S16','9310',
       'rom','82S123','82S115','74S287','74194','7485','74165','74164','74174','7475','9301']
sources += ['chips/'+name+'.cpp' for name in chips]
(out.parent/'sources.txt').write_text('\n'.join(str(out/name) for name in sources)+'\n')
(out.parent/'adapter.diff').write_text(''.join(diff))
(out.parent/'adapter-files.json').write_text(json.dumps({'sources':sources,'upstream':'dice-0.9','abi':4,
    'games':['pong','pongdoubles','spacerace','breakout','stuntcycle','indy4']},indent=2)+'\n')
print('Prepared portable six-game core:',out)
