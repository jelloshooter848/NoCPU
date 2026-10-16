// SPDX-License-Identifier: GPL-3.0-or-later
// Quadrapong (Atari, 1974): the original access contract of games/quadrapong.cpp.
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_quadrapong();
extern void nocpu_reset_quadrapong_descriptors();

NOCPU_REGISTER_GAME(quadrapong) {
    g.id=NOCPU_QUADRAPONG; g.name="quadrapong";
    g.circuit=circuit_quadrapong; g.reset_descriptors=nocpu_reset_quadrapong_descriptors;
    // DSW1 coinage in bit 0.
    g.dips={{"coinage",1,2,0}};
    // PAD1/PAD2 are PADDLE1/2_VERTICAL_INPUT (left, right), PAD3/PAD4 are
    // PADDLE3/4_HORIZONTAL_INPUT (top, bottom); one Start switch.
    g.paddles=4; g.starts=1;
    // Miss counters. Left/right: L9 74107 (A), K9, J9, H9 7474 (B, C, D);
    // top/bottom: L10 74107 (B), K10, J10 7474 (C, D). Start loads them so that
    // the D stage marks a player out. The netlist uses (and keeps) only J10's
    // complement outputs _3D_n (pin 6) and _4D_n (pin 8), read inverted.
    g.scores={{{"L9.3",1},{"K9.5",2},{"J9.5",4},{"H9.5",8}},
              {{"L9.5",1},{"K9.9",2},{"J9.9",4},{"H9.9",8}},
              {{"L10.3",1},{"K10.5",2},{"J10.6",4,true}},
              {{"L10.5",1},{"K10.9",2},{"J10.8",4,true}}};
    g.active="F9.6";     // ATTRAC_n: high while a game is in play
    g.attract_n="F9.6";
    // E3.3 is low while the ball overlaps any paddle (A5.8 left/right, A5.6
    // top/bottom; it clocks the hit sound flip-flop C2).
    g.hit="E3.3";
    // Paddle hits (left/right, top/bottom; the raster time of a hit tells
    // which paddle), the buffered MISS that clocks the counters, and SERVE.
    g.events={"A5.8","A5.6","MISS_BUF.2","A1.5"};
}
