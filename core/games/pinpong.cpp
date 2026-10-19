// SPDX-License-Identifier: GPL-3.0-or-later
// Pin Pong (Atari, 1974): the original access contract of games/pinpong.cpp.
#include "nocpu.h"
#include "game_registry.h"
#include "port_hooks.h"
#include "games/pinpong_sound.h"

extern const CircuitDesc* circuit_pinpong();
// Derived layout (tools/prepare-core.py): the original netlist with the
// free-game jumpers wired to B5.4 instead of VCC.
extern const CircuitDesc* circuit_pinpong_free_game();
extern unsigned nocpu_pinpong_free_game_jumpers;
extern void nocpu_reset_pinpong_descriptors();

namespace {
// Free-game options (schematic table "FREE GAME OPTIONS"): jumper terminals
// 1 and 2 of the C5 NAND (pins 9, 10) to the C6 10,000s decade outputs M
// (QA), N (QB), O (QC), P (QD). Index 0 is "no free game" (3, ground, to 1
// and 2), which is DICE's hard-wired VCC on B5.4: the original layout.
// Packed as terminal1 | terminal2 << 4, with 0..3 = M..P and 4 = ground.
const unsigned free_game_jumpers[9]={4|4<<4, 0|0<<4, 1|1<<4, 0|1<<4, 2|2<<4, 0|2<<4, 2|1<<4, 3|3<<4, 0|3<<4};
const CircuitDesc* pinpong_circuit(uint32_t dip) {
    const uint32_t option=(dip>>3)&15;
    if(option==0)return circuit_pinpong();
    nocpu_pinpong_free_game_jumpers=free_game_jumpers[option];
    return circuit_pinpong_free_game();
}
struct PinPongSound final:NoCPUSound {
    nocpu_pinpong::SoundBoard board;
    explicit PinPongSound(uint32_t tone):board(tone) {}
    static void sink(uint64_t time,int16_t sample){nocpu_capture_audio(time,sample);}
    void start(const int* levels) override {board.start(levels);}
    void pin(unsigned index,int value,uint64_t time) override {board.pin(index,value,time,sink);}
    void emit_before(uint64_t time) override {board.emit_before(time,sink);}
};
NoCPUSound* pinpong_sound(uint32_t,uint32_t tone){return new PinPongSound(tone);}
}

NOCPU_REGISTER_GAME(pinpong) {
    g.id=NOCPU_PINPONG; g.name="pinpong";
    g.circuit=circuit_pinpong; g.reset_descriptors=nocpu_reset_pinpong_descriptors;
    // S1 coinage in bit 0, S2 free ball in bit 1, S3 ball count in bit 2.
    // NoCPU addition from Atari's schematic (DICE: "TODO: FREE GAME SELECT"):
    // the free-game score in bits 3-6, 0 = no free game (DICE's behaviour),
    // 1..8 = 10,000, 20,000, 30,000, 40,000, 50,000, 60,000, 80,000, 90,000.
    g.dips={{"coinage",1,2,0},{"free_ball",1,2,0},{"ball_count",1,2,0},{"free_game",4,9,0,true}};
    g.circuit_for=pinpong_circuit;
    // FLIPPERS is BUTTONS1_INPUT: button 1 the left flipper, 2 the right one.
    // One Start switch ("Start Game / Serve Ball").
    g.button_slots=1; g.buttons=2; g.starts=1;
    // VIDEO_ORIENTATION(ROTATE_90): the portrait 324x432 raster.
    g.portrait=true;
    // Score: the C7, D7, D6, C6 7490 decades (QA..QD = 12,9,8,11), cleared
    // by START (the display shows it times ten); balls served: the N10 74164
    // shift register, cleared by START and filled with ones by each counted serve.
    g.scores={{{"C7.12",1},{"C7.9",2},{"C7.8",4},{"C7.11",8},{"D7.12",10},{"D7.9",20},{"D7.8",40},{"D7.11",80},
               {"D6.12",100},{"D6.9",200},{"D6.8",400},{"D6.11",800},{"C6.12",1000},{"C6.9",2000},{"C6.8",4000},{"C6.11",8000}},
              {{"N10.3",1},{"N10.4",1},{"N10.5",1},{"N10.6",1},{"N10.10",1}}};
    g.active="J9.6";     // ATTRACT_n: high while a game is in play
    g.attract_n="J9.6";
    // Events: MISS_n (F4.3, a ball lost), SERVE (H10.6), the free-ball
    // indicator (K10.6) and START (J9.9); from 0.4.0 also the hit pulse F1.Q
    // (F1.9) and the object latches the sound and score read: D9-2.9
    // (slingshots, 10 points), D9-2.5 (100-point objects), D9-1.5 (cross
    // centre, 1000 points).
    g.events={"F4.3","H10.6","K10.6","J9.9","F1.9","D9-2.9","D9-2.5","D9-1.5"};
    // NoCPU sound reconstruction from the schematic (DICE: "TODO: Finish
    // Sound"); the potentiometer is the board's TONE trimmer R41, in ohms.
    g.sound=pinpong_sound;
    g.sound_pins={"F1.9","D9-2.9","D9-2.5","D9-1.5","C8.3","D8.8"};
    g.pot="tone";g.pot_nocpu=true;
    g.pot_min=nocpu_pinpong::TONE_MIN_OHMS;g.pot_max=nocpu_pinpong::TONE_MAX_OHMS;
    g.pot_default=nocpu_pinpong::TONE_DEFAULT_OHMS;
}
