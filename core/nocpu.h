// SPDX-License-Identifier: GPL-3.0-or-later
#ifndef NOCPU_H
#define NOCPU_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
// ABI 2: one live original DICE circuit per module. Inputs are held until changed.
enum NoCPUGame { NOCPU_PONG=0, NOCPU_PONG_DOUBLES=1, NOCPU_SPACE_RACE=2 };
enum NoCPUEvent { NOCPU_HIT=0, NOCPU_CRASH1_N=1, NOCPU_CRASH2_N=2,
                  NOCPU_SCORE1_PULSE=3, NOCPU_SCORE2_PULSE=4 };
uint32_t nocpu_abi_version(void);
// dip is the original 0/1 index. pot_ohms is zero for paddle games;
// Space Race accepts an integer 470000..1470000 (original default 970000).
// Invalid IDs/settings fail before changing a live circuit.
uint32_t nocpu_create_game(uint32_t game, uint32_t seed, uint32_t dip, uint32_t pot_ohms);
// Retained convenience entry point: original-default Pong.
uint32_t nocpu_create(uint32_t seed);
void nocpu_destroy(void);
// Reset recreates the selected circuit with its effective chosen settings.
uint32_t nocpu_reset(uint32_t seed);
uint32_t nocpu_reset_config(uint32_t seed, uint32_t dip, uint32_t pot_ohms);
uint32_t nocpu_game(void);
uint32_t nocpu_dip(void);
uint32_t nocpu_pot_ohms(void);
void nocpu_coin(uint32_t held);
void nocpu_start(uint32_t held);
// Pong has slots 0..1; Doubles 0..3; Space Race has no paddle slots.
void nocpu_paddle(uint32_t slot, int32_t axis);
// Space Race only: two independent digital switches per slot 0..1.
// Both may be held; original circuitry decides the outcome.
void nocpu_joystick(uint32_t slot, uint32_t up_held, uint32_t down_held);
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
// Actual native game-active signal. Space Race has no attract signal;
// nocpu_attract_n returns UINT32_MAX there. HIT is not a Space Race concept.
uint32_t nocpu_active(void);
uint32_t nocpu_crashes(uint32_t slot);
uint32_t nocpu_time_lo(void);
uint32_t nocpu_time_hi(void);
// Transition triples [time_lo,time_hi,new_hit_value], exact ps; drain each tick.
const uint32_t* nocpu_collisions(void);
uint32_t nocpu_collision_count(void);
void nocpu_collisions_clear(void);
// Exact transition quadruples [time_lo,time_hi,NoCPUEvent,new_pin_value].
// HIT on paddle games; crash_n and score pulses on Space Race. Bounded queue
// of 4096; drain each tick. Overruns remain visible until reset/destroy.
const uint32_t* nocpu_events(void);
uint32_t nocpu_event_count(void);
void nocpu_events_clear(void);
uint32_t nocpu_event_overruns(void);
#ifdef __cplusplus
}
#endif
#endif
