// SPDX-License-Identifier: GPL-3.0-or-later
// Observation and input adapter. Included only in the ignored reference build.
#ifndef NOCPU_REFERENCE_API_H
#define NOCPU_REFERENCE_API_H
#include <stdint.h>
#include <vector>
class Chip;
struct CircuitDesc;
struct ChipDesc;
void reference_register_chip(const char* name, unsigned pin, Chip* chip, const ChipDesc* descriptor);
void reference_configure(const CircuitDesc* desc, const char* name);
void reference_sample(uint64_t time, int16_t sample);
void reference_video_client(int width, int height);
void reference_frame(uint64_t time, uint64_t scanline_time, uint32_t v_size, int orientation, double contrast);
bool reference_key(unsigned scancode);
int16_t reference_axis(unsigned joystick, unsigned axis);
unsigned reference_stuntcycle_throttle();
double reference_stuntcycle_cap_voltage();
uint64_t reference_stuntcycle_last_event_time();
void reference_prune(const std::vector<Chip*>& live);
struct ReferenceObserver {
    Chip* chip;
    int previous;
    int signal;
    const char* diagnostic_name;
    const char* scope_diagnostic_name;
    explicit ReferenceObserver(Chip* c);
    ~ReferenceObserver();
};
#endif
