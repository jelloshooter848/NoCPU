// SPDX-License-Identifier: GPL-3.0-or-later
// Observation and input adapter. Included only in the ignored reference build.
#ifndef NOCPU_REFERENCE_API_H
#define NOCPU_REFERENCE_API_H
#include <stdint.h>
class Chip;
struct CircuitDesc;
void reference_register_chip(const char* name, unsigned pin, Chip* chip);
void reference_configure(const CircuitDesc* desc, const char* name);
void reference_sample(uint64_t time, int16_t sample);
void reference_video_client(int width, int height);
void reference_frame(uint64_t time, uint64_t scanline_time, uint32_t v_size, int orientation, double contrast);
bool reference_key(unsigned scancode);
int16_t reference_axis(unsigned joystick, unsigned axis);
struct ReferenceObserver {
    Chip* chip;
    int previous;
    int signal;
    explicit ReferenceObserver(Chip* c);
    ~ReferenceObserver();
};
#endif
