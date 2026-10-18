#!/usr/bin/env python3
"""Prepare an auditable, disposable portable copy of DICE 0.9 for the compiled games.

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
    ('    Input();','    bool coin, start, start2, serve;\n    int16_t axes[4];\n    bool up[2],down[2],left[2],right[2];\n    bool coin_extra[4],throttle_held,buttons[4][4];\n    Input();')])

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

# Gotcha's PROXIMITY chip keeps its capacitor voltage in a function-local
# `static double v_cap`, which survives in-process machine re-creation and so
# cannot be restored by core/games/gotcha.inc. Move that one variable to file
# scope under a NoCPU name (same type, same constant initializer, same uses) so
# the cold reset can zero it; the chip logic and its arithmetic are unchanged.
edit('games/gotcha.cpp',[
    ('static CUSTOM_LOGIC( proximity )\n{',
     '// NoCPU: was a function-local static of proximity(); file scope so that a\n'
     '// portable reset can restore it (docs/UPSTREAM_PATCHES.md).\n'
     'static double nocpu_gotcha_proximity_v_cap = 0.0;\n\n'
     'static CUSTOM_LOGIC( proximity )\n{'),
    ('    static double v_cap = 0.0;\n',
     '    double& v_cap = nocpu_gotcha_proximity_v_cap;\n')])

# DICE stores mutable hardware descriptors statically. A portable reset creates
# a fresh machine, so each compiled game appends a function restoring its custom
# descriptor objects before construction. The appended code is kept per game in
# core/games/<id>.inc (see docs/PORT_GAME.md); its first SPDX line is dropped.
# The six legacy circuits keep their established order; later games follow in
# name order, so adding a game never reorders the earlier sources.
LEGACY_GAMES=['pong','pongdoubles','spacerace','breakout','stuntcycle','indy4']
# A registered game is named by its DICE command-line ID; Hi-Way's circuit
# lives in games/highway.cpp.
SOURCE_FILES={'hiway':'highway'}
added=sorted(path.stem for path in (ROOT/'core/games').glob('*.inc') if path.stem not in LEGACY_GAMES)
GAMES=LEGACY_GAMES+added
for game in GAMES:
    source=SOURCE_FILES.get(game,game)
    if not (out/'games'/(source+'.cpp')).is_file():
        raise SystemExit('No original DICE circuit for core/games/'+game+'.inc')
    lines=(ROOT/'core/games'/(game+'.inc')).read_text().splitlines(True)
    if not lines or not lines[0].startswith('// SPDX-License-Identifier:'):
        raise SystemExit('core/games/'+game+'.inc must start with its SPDX line')
    write('games/'+source+'.cpp',(out/'games'/(source+'.cpp')).read_text()+'\n'+''.join(lines[1:]))

sources=['chip.cpp','circuit.cpp']+['games/'+SOURCE_FILES.get(game,game)+'.cpp' for game in GAMES]
chips=['7400','7402','7404','7410','7420','7425','7427','7430','7448','7450','7474','7483','7486','7490','7493','74107','74153','9316','555mono','clock','latch','clk_gate','input','audio','video','dipswitch',
       'capacitor','555pwm','566','9602','diode_matrix','mixer','9311','9312','9322',
       '555astable','7408','7411','74175','74192','74193','74279','7432','7437','82S16','9310',
       'rom','82S123','82S115','74S287','74194','7485','74165','74164','74174','7475','9301',
       # Chips first needed by the 0.2.0 batch (Crossfire); 74157 is an alias of 9322.
       '7492','9321',
       # Chips first needed by the 0.3.0 batch (TV Basketball, Pin Pong).
       '74151','74155','7454','9314',
       # Hi-Way: 2533 RAM, 7442 (74145 is its alias) and the wired-AND chip.
       '2533','7442','wired_logic']
sources += ['chips/'+name+'.cpp' for name in chips]
(out.parent/'sources.txt').write_text('\n'.join(str(out/name) for name in sources)+'\n')
(out.parent/'adapter.diff').write_text(''.join(diff))
(out.parent/'adapter-files.json').write_text(json.dumps({'sources':sources,'upstream':'dice-0.9','abi':5,
    'games':GAMES},indent=2)+'\n')
print('Prepared portable core (%d games):'%len(GAMES),out)
