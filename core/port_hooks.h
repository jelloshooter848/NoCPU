// SPDX-License-Identifier: GPL-3.0-or-later
#ifndef NOCPU_PORT_HOOKS_H
#define NOCPU_PORT_HOOKS_H
#include <stdint.h>
class Chip;
void nocpu_register_chip(const char* name, unsigned pin, Chip* chip);
void nocpu_capture_frame(uint64_t time);
void nocpu_capture_audio(uint64_t time, int16_t sample);
struct NoCPUOutputObservation {
    Chip* chip;
    int previous;
    explicit NoCPUOutputObservation(Chip* value);
    ~NoCPUOutputObservation();
};
// Native replay only; optional callbacks, never called across the Wasm boundary.
typedef void (*NoCPUFrameHook)(uint64_t);
typedef void (*NoCPUHitHook)(uint64_t, int);
void nocpu_set_hooks(NoCPUFrameHook frame, NoCPUHitHook hit);
#endif
