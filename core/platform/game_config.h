// SPDX-License-Identifier: GPL-3.0-or-later
#ifndef GAME_CONFIG_H
#define GAME_CONFIG_H
class CircuitDesc;
// Pong uses its original default DIP state. No host configuration files.
struct GameConfig { GameConfig(const CircuitDesc*,const char*) {} };
#endif
