// SPDX-License-Identifier: GPL-3.0-or-later
#ifndef NOCPU_PORT_HOOKS_H
#define NOCPU_PORT_HOOKS_H
#include <stdint.h>
class Chip;
void nocpu_register_chip(const char* name, unsigned pin, Chip* chip);
void nocpu_unregister_chip(Chip* chip);
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
typedef void (*NoCPUEventHook)(uint64_t, unsigned, int);
void nocpu_set_hooks(NoCPUFrameHook frame, NoCPUHitHook hit);
void nocpu_set_event_hook(NoCPUEventHook event);
// The C library rand() of the original reference: glibc's additive-feedback
// generator (random_r TYPE_3, the srand/rand default), reproduced exactly so
// that native and Wasm builds (whose musl rand() is a different generator)
// draw the same numbers as original DICE on glibc. Seeded where the core
// calls srand (nocpu_create_game). Used by circuits that call rand()
// (Anti-Aircraft's random clock; docs/UPSTREAM_PATCHES.md).
enum { NOCPU_GLIBC_RAND_MAX = 2147483647 };
void nocpu_glibc_srand(unsigned seed);
int nocpu_glibc_rand();
#endif
