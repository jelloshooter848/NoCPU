// SPDX-License-Identifier: GPL-3.0-or-later
// Pin Pong (Atari, 1974): NoCPU's reconstruction of the sound board that DICE
// 0.9 leaves unfinished ("TODO: Finish Sound" in games/pinpong.cpp).
//
// Source: Atari TM-007 "Pin Pong Operation and Maintenance Manual", Rev G
// schematic, drawing 001660 sheet 3, "SOUND" (https://archive.org/details/
// ArcadeGameManualPinpong); MC3340P data sheet (Motorola rev 6) for the
// MFC6040 attenuator; NE566 data sheet for the VCO. docs/PINPONG_SOUND.md has
// the derivations and tolerances. No recording of a real cabinet was used.
//
// The model only listens: core/api.cpp feeds it the output transitions of
// original pins through the read-only observation hook and it writes PCM. It
// never drives the circuit and adds nothing to DICE's event queue, so the
// original video and logic are unchanged. Arithmetic is IEEE-754 double
// precision with + - * / and floor only (no libm), so native and Wasm agree
// bit for bit, and the samples depend only on the transition history, never
// on how the host splits time into steps.
#ifndef NOCPU_PINPONG_SOUND_H
#define NOCPU_PINPONG_SOUND_H
#include <stdint.h>

namespace nocpu_pinpong {

// Observed original pins, in this order (core/games/pinpong.cpp sound_pins).
enum Pin { F1_Q=0,       // F1.9: the hit pulse (A5 9602 edge until VRESET)
           LATCH_SLING,  // D9-2.9: slingshots (10 points), D19 + R47 15K
           LATCH_100,    // D9-2.5: 100-point objects, D20 + R48 12K
           LATCH_1000,   // D9-1.5: cross centre (1000 points), D18 + R46 4.7K
           FLIPPER_PRE_N,// C8.3: preset of the flipper latch D9-1 (pins 8-13)
           ANY_HIT,      // D8.8: clock of every D9 latch
           PIN_COUNT };

// The TONE trimmer R41 (10K on the board), in ohms. Its factory setting is
// not documented; the range is limited to settings that keep every latch
// state inside the NE566's specified control range (0.75 V+ <= Vc <= V+).
// The lower limit is 100 ohms, not 0: NoCPU's replay tools read a potentiometer
// of 0 as "the default".
enum { TONE_MIN_OHMS=100, TONE_MAX_OHMS=1500, TONE_DEFAULT_OHMS=1500 };

// DICE's AUDIO timer period at 48 kHz: uint64(1/48000 s / 1 ps).
constexpr uint64_t SAMPLE_PERIOD_PS=20833333;

typedef void (*SampleSink)(uint64_t time_ps,int16_t sample);

struct SoundBoard {
    // Component values (schematic) and data-sheet constants; see the .cpp.
    explicit SoundBoard(uint32_t tone_ohms);
    // Initial pin levels after the machine is built (time 0).
    void start(const int levels[PIN_COUNT]);
    // An observed pin changed at circuit time `time_ps` (non-decreasing).
    void pin(unsigned index,int value,uint64_t time_ps,SampleSink sink);
    // Emit every sample whose instant is strictly before `time_ps`.
    void emit_before(uint64_t time_ps,SampleSink sink);

    // State, readable by tests.
    double v_c33;        // C33 / MFC6040 control pin voltage
    double phase;        // VCO triangle phase in cycles, [0,1)
    double frequency;    // current VCO frequency in Hz (0: stopped)
    double v_control;    // NE566 pin 5 voltage
    bool latch[4];       // D9 Q outputs: sling, 100, 1000, flipper
    bool q8_on;
private:
    void retune();
    void integrate(uint64_t dt_ps);
    int16_t sample() const;
    double r_top;
    double decay_per_sample;
    uint64_t time_ps,next_sample_ps;
    int levels[PIN_COUNT];
};

// Deterministic exponential (no libm): exp(x) for |x| <= 700.
double exp_det(double x);
// Attenuation in dB of the MFC6040 at control voltage v (V+ = 14 V).
double attenuation_db(double v);

}
#endif
