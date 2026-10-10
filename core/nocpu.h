// SPDX-License-Identifier: GPL-3.0-or-later
#ifndef NOCPU_H
#define NOCPU_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
// ABI 1: one live Pong circuit per module. Inputs are held until changed.
uint32_t nocpu_abi_version(void);
uint32_t nocpu_create(uint32_t seed);
void nocpu_destroy(void);
uint32_t nocpu_reset(uint32_t seed);
void nocpu_coin(uint32_t held);
void nocpu_paddle(uint32_t slot, int32_t axis);
// Bounded integer microseconds. Zero is a no-op; >100000 or clock overflow
// is rejected. Returns 0 without changing state for an invalid advance.
uint32_t nocpu_advance(uint32_t microseconds);
const uint8_t* nocpu_frame(void); // top-down RGBA, alpha 255; owned until reset/destroy.
uint32_t nocpu_width(void);
uint32_t nocpu_height(void);
uint32_t nocpu_frame_number(void);
uint32_t nocpu_frame_time_lo(void);
uint32_t nocpu_frame_time_hi(void);
const int16_t* nocpu_audio(void); // mono signed PCM; copy before advance/clear/reset.
uint32_t nocpu_audio_count(void);
void nocpu_audio_clear(void);
uint32_t nocpu_sample_rate(void);
uint32_t nocpu_audio_overruns(void);
// Validation observability. Game output remains the circuit-rendered frame.
uint32_t nocpu_score(uint32_t slot);
uint32_t nocpu_hits(void);
uint32_t nocpu_run_n(void);
uint32_t nocpu_attract_n(void);
uint32_t nocpu_time_lo(void);
uint32_t nocpu_time_hi(void);
// Transition triples [time_lo,time_hi,new_hit_value], exact ps; drain each tick.
const uint32_t* nocpu_collisions(void);
uint32_t nocpu_collision_count(void);
void nocpu_collisions_clear(void);
#ifdef __cplusplus
}
#endif
#endif
