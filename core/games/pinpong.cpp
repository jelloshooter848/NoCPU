// SPDX-License-Identifier: GPL-3.0-or-later
// Pin Pong (Atari, 1974): the original access contract of games/pinpong.cpp.
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_pinpong();
extern void nocpu_reset_pinpong_descriptors();

NOCPU_REGISTER_GAME(pinpong) {
    g.id=NOCPU_PINPONG; g.name="pinpong";
    g.circuit=circuit_pinpong; g.reset_descriptors=nocpu_reset_pinpong_descriptors;
    // S1 coinage in bit 0, S2 free ball in bit 1, S3 ball count in bit 2.
    g.dips={{"coinage",1,2,0},{"free_ball",1,2,0},{"ball_count",1,2,0}};
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
    // indicator (K10.6) and START (J9.9).
    g.events={"F4.3","H10.6","K10.6","J9.9"};
}
