// SPDX-License-Identifier: GPL-3.0-or-later
// Data-only access contracts for games ported from NoCPU 0.2.0 on.
//
// Each such game has one file, core/games/<id>.cpp, that fills a NoCPUGameDef
// and registers it with NOCPU_REGISTER_GAME; core/api.cpp serves every
// registered game through the same generic paths. The circuit itself is the
// unchanged original netlist; this file only says which original switches and
// settings the host may touch and which original pins are observed.
// See docs/PORT_GAME.md for the checklist.
#ifndef NOCPU_GAME_REGISTRY_H
#define NOCPU_GAME_REGISTRY_H
#include <stdint.h>
#include <string>
#include <vector>

struct CircuitDesc;

// One original pin, named "CHIP.pin" as the netlist registers it, weighted.
// `inverted` reads an active-low output (1 - pin), for a counter stage whose
// true output the original netlist prunes because only its complement is used.
struct NoCPUPinTerm { std::string pin; uint32_t weight; bool inverted; }; // omitted: false

// One original setting chip (DIPSWITCH and its variants), found by its
// original descriptor name. Packed DIP values hold the settings in declared
// order from bit 0, each `bits` wide; `values` is the number of named
// original choices (indices 0..values-1).
struct NoCPUDipField { std::string name; uint32_t bits, values, default_index; };

struct NoCPUGameDef {
    uint32_t id=0;
    std::string name;                         // DICE command-line ID
    const CircuitDesc* (*circuit)()=nullptr;  // original circuit_<id>()
    void (*reset_descriptors)()=nullptr;      // core/games/<id>.inc
    std::vector<NoCPUDipField> dips;
    // Original potentiometer descriptor name (POT_555_MONO/ASTABLE), or empty.
    std::string pot;
    uint32_t pot_min=0, pot_max=0, pot_default=0;
    // Original inputs. Paddle slots use input axes 0..paddles-1 whatever their
    // orientation; joysticks are digital switches; buttons are BUTTONSn_INPUT.
    uint32_t paddles=0, joysticks=0, joystick_directions=0;
    uint32_t button_slots=0, buttons=0, starts=0;
    // WHEELn_INPUT slots (original quadrature wheels, as Indy 4's), reached
    // through nocpu_wheel and nocpu_wheel_keys.
    uint32_t wheels=0;
    // The circuit's VIDEO_ORIENTATION rotates the monitor 90 or 270 degrees:
    // the raster is the 324x432 portrait crop. Creation checks it.
    bool portrait=false;
    // Observations, read from original output pins. They never feed the circuit.
    std::vector<std::vector<NoCPUPinTerm>> scores;  // one sum per player slot
    std::string active;                    // high while a game is in play
    std::string attract_n;                 // optional raw ATTRACT_n pin
    std::string hit;                       // optional pin whose rises are hits
    std::vector<std::string> events;       // up to NOCPU_GAME_EVENT_LIMIT pins
};

const NoCPUGameDef* nocpu_registered_game(uint32_t id);
bool nocpu_register_game(const NoCPUGameDef& def);

// Usage, at namespace scope in core/games/<id>.cpp:
//   NOCPU_REGISTER_GAME(rebound) { g.id=NOCPU_REBOUND; g.name="rebound"; ... }
#define NOCPU_REGISTER_GAME(ident) \
    static void nocpu_define_##ident(NoCPUGameDef& g); \
    static const bool nocpu_registered_##ident = [] { \
        NoCPUGameDef g; nocpu_define_##ident(g); return nocpu_register_game(g); }(); \
    static void nocpu_define_##ident(NoCPUGameDef& g)

#endif
