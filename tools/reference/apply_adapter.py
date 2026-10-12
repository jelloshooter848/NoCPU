#!/usr/bin/env python3
"""Apply the narrowly scoped reference adapter to an ignored build copy.

Each insertion requires one exact upstream match. The source archive stays intact.
The generated adapter.diff is the complete reviewable record of build changes.
"""
import argparse
import difflib
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("adapter", type=Path)
args = parser.parse_args()
changes = []

def edit(name, substitutions):
    path = args.source / name
    before = path.read_bytes().decode("utf-8").replace("\r\n", "\n")
    after = before
    for old, new in substitutions:
        if after.count(old) != 1:
            raise SystemExit("Expected exactly one match in %s: %r" % (name, old))
        after = after.replace(old, new)
    path.write_text(after, encoding="utf-8")
    changes.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                      fromfile="upstream/" + name, tofile="reference/" + name))

edit("Makefile", [("LIBS := -s", "LIBS := -s -lz")])

# Read-only observation of the original private static descriptor, no input override.
edit("games/stuntcycle.cpp", [("static Throttle1Desc throttle_desc(&stunt_cycle_throttle_desc.throttle_pos);",
    "static Throttle1Desc throttle_desc(&stunt_cycle_throttle_desc.throttle_pos);\nunsigned reference_stuntcycle_throttle() { return unsigned(stunt_cycle_throttle_desc.throttle_pos * 1000.0 + 0.5); }\ndouble reference_stuntcycle_cap_voltage() { return stunt_cycle_throttle_desc.cap_voltage; }\nuint64_t reference_stuntcycle_last_event_time() { return stunt_cycle_throttle_desc.last_event_time; }")])

# Typed, read-only snapshots of the original public wheel state. Queue values
# are copied through const iterators; no encoder cursor or descriptor is changed.
edit("games/indy4.cpp", [("static Wheel4Desc wheel4_desc;", """static Wheel4Desc wheel4_desc;
template<unsigned W> static void reference_copy_wheel(const WheelDesc<W>& wheel, double& angle, std::vector<double>& a, std::vector<double>& b) {
    angle=wheel.angle;
    const cirque<double>* queues[]={&wheel.wheel_events[0],&wheel.wheel_events[1]};
    std::vector<double>* copies[]={&a,&b};
    for(unsigned channel=0;channel<2;++channel) {
        copies[channel]->clear(); copies[channel]->reserve(queues[channel]->size());
        for(auto i=queues[channel]->begin();i!=queues[channel]->end();++i) copies[channel]->push_back((*queues[channel])[i]);
    }
}
bool reference_indy4_wheel(unsigned slot, double& angle, std::vector<double>& a, std::vector<double>& b) {
    switch(slot) {
    case 0: reference_copy_wheel(wheel1_desc,angle,a,b); break;
    case 1: reference_copy_wheel(wheel2_desc,angle,a,b); break;
    case 2: reference_copy_wheel(wheel3_desc,angle,a,b); break;
    case 3: reference_copy_wheel(wheel4_desc,angle,a,b); break;
    default: return false;
    }
    return true;
}""")])

edit("main.cpp", [
    ('static const char VERSION_STRING[] = "DICE 0.9";',
     '#include "reference_driver.cpp"\n\nstatic const char VERSION_STRING[] = "DICE 0.9";'),
    ('        input->poll_input();\n\n        if(circuit && !settings.pause)',
     '        input->poll_input();\n        if(!reference_step(circuit, settings, *input, *video, [&]{ onSize(); })) return;\n\n        if(circuit && !settings.pause)'),
    ('circuit->run(2.5e-3 / Circuit::timescale); // Run 2.5 ms',
     'reference_timed_run(circuit, reference_run_time(circuit)); // Advance to replay deadline, in integer picoseconds'),
    ('circuit = new Circuit(settings, *input, *video, g.desc, g.command_line);',
     'circuit = reference_construct(settings, *input, *video, g.desc, g.command_line);'),
    ('main_window.circuit = new Circuit(main_window.settings, *main_window.input, *main_window.video, g.desc, g.command_line);',
     'main_window.circuit = reference_construct(main_window.settings, *main_window.input, *main_window.video, g.desc, g.command_line);'),
    ('    srand(time(NULL));', '    srand(reference_initialize(main_window.settings));'),
])
edit("circuit.cpp", [
    ('#include "circuit_desc.h"', '#include "circuit_desc.h"\n#include "reference_api.h"'),
    ('    } while(removed);\n\n    // Make all connections', '    } while(removed);\n\n    reference_prune(chips);\n    // Make all connections'),
    ('        ChipDescPair cd(chips.back(), d);',
     '        reference_register_chip(name.c_str(), d->output_pin, chips.back(), d);\n        ChipDescPair cd(chips.back(), d);'),
])
edit("game_config.cpp", [
    ('#include "game_config.h"', '#include "game_config.h"\n#include "reference_api.h"'),
    ('    if(has_config) load();', '    if(has_config) load();\n    reference_configure(desc, name);'),
])
edit("chip.cpp", [
    ('void Chip::update_output()\n{', 'void Chip::update_output()\n{\n    ReferenceObserver observation(this);'),
    ('#include "chip.h"', '#include "chip.h"\n#include "reference_api.h"'),
])
edit("chips/input.cpp", [
    ('#include "input.h"', '#include "input.h"\n#include "../reference_api.h"'),
    ('    return Keyboard::pressed((Keyboard::Scancode)scancode);', '    return reference_key(scancode);'),
    ('    if(joystick >= joysticks.size()) return 0;\n    return SDL_JoystickGetAxis(joysticks[joystick], axis);',
     '    return reference_axis(joystick, axis);'),
])
edit("chips/audio.cpp", [
    ('#include "audio.h"', '#include "audio.h"\n#include "../reference_api.h"'),
    ('    SDL_LockAudio();\n    audio->audio_buffer.push_back(sample);',
     '    reference_sample(chip->circuit->global_time, sample);\n    SDL_LockAudio();\n    audio->audio_buffer.push_back(sample);'),
])
edit("chips/video.cpp", [
    ('#include "video.h"', '#include "video.h"\n#include "../reference_api.h"'),
    ('    // Keep aspect ratio', '    reference_video_client(width, height);\n    // Keep aspect ratio'),
    ('        video->draw_overlays();\n        video->swap_buffers();',
     '        video->draw_overlays();\n        reference_frame(global_time, video->scanline_time, video->v_size, video->desc->orientation, video->desc->contrast);\n        video->swap_buffers();'),
])
for name in ("reference_api.h", "reference_driver.cpp"):
    contents = (args.adapter / name).read_bytes()
    (args.source / name).write_bytes(contents)
    changes.extend(difflib.unified_diff([], contents.decode("utf-8").splitlines(True),
                                      fromfile="/dev/null", tofile="reference/" + name))
(args.source.parent / "adapter.diff").write_text("".join(changes), encoding="utf-8")
