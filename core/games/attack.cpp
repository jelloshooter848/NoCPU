// SPDX-License-Identifier: GPL-3.0-or-later
// Attack (Exidy, 1977): the original access contract of games/attack.cpp. The
// player supplies its six PROMs, in either accepted dump set.
#include "nocpu.h"
#include "game_registry.h"

extern const CircuitDesc* circuit_attack();
extern void nocpu_reset_attack_descriptors();

NOCPU_REGISTER_GAME(attack) {
    g.id=NOCPU_ATTACK; g.name="attack";
    g.circuit=circuit_attack; g.reset_descriptors=nocpu_reset_attack_descriptors;
    // No DIP switch. POT1 "playtime" sets the E13 astable that times the game.
    g.pot="playtime"; g.pot_min=1000000; g.pot_max=3000000; g.pot_default=2500000;
    // JOYSTICK1_INPUT (ship: left/right move, up/down turn the gun),
    // BUTTONS1_INPUT button 1 (ship fire); JOYSTICK2_INPUT left/right (rotate
    // the plane), BUTTONS2_INPUT buttons 1 (plane fire) and 2 (faster). The
    // coin starts the game: no Start switch.
    g.joysticks=2; g.joystick_directions=15; g.button_slots=2; g.buttons=2; g.starts=0;
    // Score counters (74192 QA..QD = pins 3, 2, 6, 7), cleared by CLK_SCR:
    // the ship's L11/M11 count planes shot down, the plane's L12/M12 ships sunk.
    g.scores={{{"L11.3",1},{"L11.2",2},{"L11.6",4},{"L11.7",8},{"M11.3",10},{"M11.2",20},{"M11.6",40},{"M11.7",80}},
              {{"L12.3",1},{"L12.2",2},{"L12.6",4},{"L12.7",8},{"M12.3",10},{"M12.2",20},{"M12.6",40},{"M12.7",80}}};
    g.active="F12.8";    // CON_LTH: high while a game is in play
    // Events: PLN_FAL (C4.5: the plane falls), SNK_SHP (J4.4: the ship
    // sinks), SHP_BF_n (M2.12) and PLN_BF_n (A9.8: bullets), E13 (the play
    // timer) and CLK_SCR (E12.11: the score clear).
    g.events={"C4.5","J4.4","M2.12","A9.8","E13.3","E12.11"};
    g.rom_file="attack";
    // DICE accepts the 256-byte dumps or their 512-byte alternatives (the
    // source names the 256-byte set as likely correct; the others are
    // zero-filled overdumps).
    g.roms={{"attack.a1",{{0xD9B116B8,256},{0x5AFD5AFF,512}}},{"attack.b1",{{0x2317197F,256},{0x92D0FBF4,512}}},
            {"attack.c1",{{0x7391E44C,256},{0x25625D6E,512}}},{"attack.d1",{{0xD4A06439,256},{0x2FF8DD6B,512}}},
            {"attack.j6",{{0x1CE2921C,256},{0x21F87C1A,512}}},{"attack.k6",{{0xE120839F,256},{0xBA5115B3,512}}}};
}
