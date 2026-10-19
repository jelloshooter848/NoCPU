// SPDX-License-Identifier: GPL-3.0-or-later
// Original Attack observation (upstream games/attack.cpp), written for the
// reference independently of core/games/attack.cpp. Original DICE reads the
// player's attack.zip itself (either accepted dump set).
REFERENCE_GAME(attack) {
    g.name = "attack";
    g.pot = "playtime"; g.pot_min = 1000000; g.pot_max = 3000000; g.pot_default = 2500000; // POT1 -> E13, K_OHM(1000..3000), 2500
    g.joysticks = 2; g.joystick_directions = 15; g.button_slots = 2; g.buttons = 2; g.starts = 0;
    // Ship L11/M11, plane L12/M12: 74192 QA..QD pins 3, 2, 6, 7.
    g.scores = {{{"L11.3", 1}, {"L11.2", 2}, {"L11.6", 4}, {"L11.7", 8}, {"M11.3", 10}, {"M11.2", 20}, {"M11.6", 40}, {"M11.7", 80}},
                {{"L12.3", 1}, {"L12.2", 2}, {"L12.6", 4}, {"L12.7", 8}, {"M12.3", 10}, {"M12.2", 20}, {"M12.6", 40}, {"M12.7", 80}}};
    g.active = "F12.8"; // CON_LTH
    // PLN_FAL, SNK_SHP, SHP_BF_n, PLN_BF_n, E13 timer, CLK_SCR
    g.events = {"C4.5", "J4.4", "M2.12", "A9.8", "E13.3", "E12.11"};
    g.roms = true;
}
