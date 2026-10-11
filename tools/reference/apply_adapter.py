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

edit("main.cpp", [
    ('static const char VERSION_STRING[] = "DICE 0.9";',
     '#include "reference_driver.cpp"\n\nstatic const char VERSION_STRING[] = "DICE 0.9";'),
    ('        input->poll_input();\n\n        if(circuit && !settings.pause)',
     '        input->poll_input();\n        if(!reference_step(circuit, settings, *input, *video, [&]{ onSize(); })) return;\n\n        if(circuit && !settings.pause)'),
    ('circuit->run(2.5e-3 / Circuit::timescale); // Run 2.5 ms',
     'circuit->run(reference_run_time(circuit)); // Advance to replay deadline, in integer picoseconds'),
    ('    srand(time(NULL));', '    srand(reference_initialize(main_window.settings));'),
])
edit("circuit.cpp", [
    ('#include "circuit_desc.h"', '#include "circuit_desc.h"\n#include "reference_api.h"'),
    ('        ChipDescPair cd(chips.back(), d);',
     '        reference_register_chip(name.c_str(), d->output_pin, chips.back());\n        ChipDescPair cd(chips.back(), d);'),
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
    ('        video->draw_overlays();\n        video->swap_buffers();',
     '        video->draw_overlays();\n        reference_frame(global_time);\n        video->swap_buffers();'),
])
for name in ("reference_api.h", "reference_driver.cpp"):
    contents = (args.adapter / name).read_bytes()
    (args.source / name).write_bytes(contents)
    changes.extend(difflib.unified_diff([], contents.decode("utf-8").splitlines(True),
                                      fromfile="/dev/null", tofile="reference/" + name))
(args.source.parent / "adapter.diff").write_text("".join(changes), encoding="utf-8")
