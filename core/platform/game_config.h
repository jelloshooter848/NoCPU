// SPDX-License-Identifier: GPL-3.0-or-later
#ifndef GAME_CONFIG_H
#define GAME_CONFIG_H
// Keep the original game_config.h -> circuit_desc.h include chain: chip
// implementations such as MIXER use its original OHM/K_OHM unit macros.
#include "circuit_desc.h"
// Browser/native hosts provide audited descriptor values at fresh-machine
// construction. The circuit must not open original desktop configuration files.
struct GameConfig { GameConfig(const CircuitDesc*,const char*) {} };
#endif
