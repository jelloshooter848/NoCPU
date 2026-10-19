// SPDX-License-Identifier: GPL-3.0-or-later
#ifndef NOCPU_H
#define NOCPU_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
// ABI 5: one live original DICE circuit per module. Earlier IDs/exports remain.
// IDs 6..9 are the 0.2.0 batch, 10..12 the 0.3.0 batch and 13..16 the 0.5.0
// batch (ROM-backed), reserved in advance;
// an ID is usable only once its game registers a definition
// (core/games/<id>.cpp, docs/PORT_GAME.md).
enum NoCPUGame { NOCPU_PONG=0, NOCPU_PONG_DOUBLES=1, NOCPU_SPACE_RACE=2, NOCPU_BREAKOUT=3,
                 NOCPU_STUNT_CYCLE=4, NOCPU_INDY_4=5, NOCPU_REBOUND=6, NOCPU_GOTCHA=7,
                 NOCPU_QUADRAPONG=8, NOCPU_CROSSFIRE=9,

                 NOCPU_TVBASKETBALL=10,

                 NOCPU_PINPONG=11,

                 NOCPU_HIWAY=12,

                 NOCPU_ANTIAIRCRAFT=13,

                 NOCPU_SHARKJAWS=14,

                 NOCPU_JETFIGHTER=15,

                 NOCPU_ATTACK=16,

                 NOCPU_GAME_LIMIT=32 };
// Event IDs of registered games: HIT stays NOCPU_HIT (0); a game's other
// declared source pins are NOCPU_GAME_EVENT_BASE + their declared index.
enum { NOCPU_GAME_EVENT_BASE=200, NOCPU_GAME_EVENT_LIMIT=8 };
enum NoCPUEvent { NOCPU_HIT=0, NOCPU_CRASH1_N=1, NOCPU_CRASH2_N=2,
                  NOCPU_SCORE1_PULSE=3, NOCPU_SCORE2_PULSE=4,
                  NOCPU_BRICK_HIT=5, NOCPU_BP_HIT_N=6, NOCPU_VB_HIT_N=7,
                  NOCPU_SERVE_WAIT=8, NOCPU_PLAYER_2=9, NOCPU_ATTRACT_N=10,
                  NOCPU_STUNT_ATTRACT_N=11, NOCPU_STUNT_PLAYER_CONTROL=12,
                  NOCPU_STUNT_JUMP=13, NOCPU_STUNT_FLIP=14,
                  NOCPU_STUNT_GOOD_JUMP=15, NOCPU_STUNT_BAD_JUMP=16,
                  NOCPU_INDY_PLAY=17, NOCPU_INDY_ATTRACT_GREEN=18,
                  NOCPU_INDY_ATTRACT_CYAN=19, NOCPU_INDY_ATTRACT_VIOLET=20,
                  NOCPU_INDY_ATTRACT_RED=21, NOCPU_INDY_COLLISION_GREEN=22,
                  NOCPU_INDY_COLLISION_CYAN=23, NOCPU_INDY_COLLISION_VIOLET=24,
                  NOCPU_INDY_COLLISION_RED=25, NOCPU_INDY_CHECKPOINT_GREEN_N=26,
                  NOCPU_INDY_CHECKPOINT_CYAN_N=27, NOCPU_INDY_CHECKPOINT_VIOLET_N=28,
                  NOCPU_INDY_CHECKPOINT_RED_N=29, NOCPU_EVENT_TYPES=30 };
enum NoCPURomError { NOCPU_ROM_OK=0, NOCPU_ROM_BUSY=1, NOCPU_ROM_GAME=2,
    NOCPU_ROM_SLOT=3, NOCPU_ROM_SIZE=4, NOCPU_ROM_MISSING=5, NOCPU_ROM_CRC=6,
    NOCPU_ROM_MEMORY=7 };
// Stage canonical descriptor slots before create; sizes are exact audited
// identities. Each returned buffer is bounded, private and module-owned.
// finish AND create independently recheck actual CRCs. Names are documentary;
// callers resolve aliases/CRC-shared members to descriptor slots beforehand.
// Rejected calls never alter a live session. Reset keeps loaded bytes; destroy
// discards both live/staged data. No filesystem, ROM fetch or ZIP inside core.
uint32_t nocpu_rom_begin(uint32_t game);
uint8_t* nocpu_rom_buffer(uint32_t slot,uint32_t size);
uint32_t nocpu_rom_finish(void);
uint32_t nocpu_rom_error(void);
enum NoCPUBreakoutSignal { NOCPU_BREAKOUT_ATTRACT=0, NOCPU_BREAKOUT_ATTRACT_N=1,
    NOCPU_BREAKOUT_Q_N=2, NOCPU_BREAKOUT_SERVE_WAIT=3, NOCPU_BREAKOUT_PLAYER_2=4,
    NOCPU_BREAKOUT_BALL_COUNTER=5 };
uint32_t nocpu_abi_version(void);
// Registered games (IDs 6 and above) describe their original access contract
// as data. Name is the DICE command-line ID, or null for an unknown game.
const char* nocpu_game_name(uint32_t game);
// Info fields, UINT32_MAX for an unknown game or field: 0 registered (1),
// 1 paddle slots, 2 joystick slots, 3 joystick direction mask (1 up, 2 down,
// 4 left, 8 right), 4 button slots, 5 buttons per slot, 6 Start switches,
// 7 default packed DIP, 8 valid DIP bit mask, 9 potentiometer minimum ohms,
// 10 maximum, 11 default (all 0 without one), 12 score slots, 13 coin channels,
// 14 portrait raster (1: the circuit rotates its monitor 90 degrees, 324x432),
// 15 wheel slots (WHEELn_INPUT, reached through nocpu_wheel/nocpu_wheel_keys).
enum NoCPUGameInfo { NOCPU_INFO_REGISTERED=0, NOCPU_INFO_PADDLES=1, NOCPU_INFO_JOYSTICKS=2,
    NOCPU_INFO_JOYSTICK_DIRECTIONS=3, NOCPU_INFO_BUTTON_SLOTS=4, NOCPU_INFO_BUTTONS=5,
    NOCPU_INFO_STARTS=6, NOCPU_INFO_DEFAULT_DIP=7, NOCPU_INFO_DIP_MASK=8, NOCPU_INFO_POT_MIN=9,
    NOCPU_INFO_POT_MAX=10, NOCPU_INFO_POT_DEFAULT=11, NOCPU_INFO_SCORES=12, NOCPU_INFO_COINS=13,
    NOCPU_INFO_PORTRAIT=14, NOCPU_INFO_WHEELS=15 };
uint32_t nocpu_game_info(uint32_t game, uint32_t field);
// dip is the original 0/1 index. pot_ohms is zero for paddle games;
// Space Race accepts an integer 470000..1470000 (original default 970000).
// Breakout uses packed original DIP indices: bonus_credit0..8 in bits0..3,
// cabinet_type in bit4, coinage in bit5, ball_count in bit6; pot_ohms=0.
// Reserved bits and unnamed bonus indices are invalid. Default packed DIP=3.
// Stunt Cycle: misses0..7 bits0..2, free-game-score index0..15 (12..27)
// bits3..6, coinage index bit7, free-game disabled bit8; pot0, default DIP76.
// Indy4: dip0, playtime pot220000..1220000 (original default720000).
// Registered games pack their declared DIP switches from bit 0 in declared
// order (nocpu_game_info field 8) and take their declared potentiometer range.
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
// channel1 aliases legacy coin; channels2..5 require Indy4. Channel5 is dollar.
uint32_t nocpu_coin_channel(uint32_t channel,uint32_t held);
void nocpu_start(uint32_t held);
// Separate original Start switches. player=1 supports all Start games;
// player=2 is Breakout/StuntCycle and registered games declaring two Starts.
// Invalid calls return0 without mutation.
// nocpu_start(held) remains the retained Start1 alias.
uint32_t nocpu_start_player(uint32_t player, uint32_t held);
// Breakout's original held Serve switch, never an implicit Start or coin.
// Returns0 without mutation on unsupported games.
uint32_t nocpu_serve(uint32_t held);
// Pong slots0..1; Doubles0..3; Breakout shared horizontal slot0; Space has none;
// registered games their declared paddle slots, vertical or horizontal alike.
// Axes are canonical original joystick values, not display coordinates.
void nocpu_paddle(uint32_t slot, int32_t axis);
// Space Race only: two independent digital switches per slot 0..1.
// Both may be held; original circuitry decides the outcome.
void nocpu_joystick(uint32_t slot, uint32_t up_held, uint32_t down_held);
// Registered games: a digital joystick's four held switches. Directions the
// cabinet lacks must be released (0). Returns 0 without mutation otherwise.
uint32_t nocpu_joystick_switches(uint32_t slot, uint32_t up, uint32_t down, uint32_t left, uint32_t right);
// Registered games: one held BUTTONSn_INPUT switch, button 1..buttons per slot.
uint32_t nocpu_button(uint32_t slot, uint32_t button, uint32_t held);
// Original Stunt throttle input conversion/poll: analog0..32767 clips to
// 0..100%; keyboard held ramps up250%/s, unheld ramps down. Calls select mode.
uint32_t nocpu_throttle(int32_t axis);
uint32_t nocpu_throttle_key(uint32_t held);
// Original Indy wheel input: held signed joystick rate, 20% deadzone and
// sensitivity500; or separate held keyboard left/right. Original10ms polling,
// +/-15degree delta clamp and quadrature events remain unchanged. Registered
// games declaring wheel slots (info field 15) use the same two entry points.
uint32_t nocpu_wheel(uint32_t slot,int32_t axis);
uint32_t nocpu_wheel_keys(uint32_t slot,uint32_t left,uint32_t right);
uint32_t nocpu_buttons(uint32_t slot,uint32_t gas,uint32_t brake);
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
// Stunt Cycle returns active-low run: !ATTRACT_n (D9.9); raw credit
// LATCH.3 is separately available via stuntcycle_signal(7).
// Breakout retains raw Q_n=LATCH.3 in this legacy field, separate from native
// active ATTRACT_n and the named raw credit getter; it is not inferred RUN_n.
uint32_t nocpu_run_n(void);
uint32_t nocpu_attract_n(void);
// Actual native game-active signal. Space Race has no attract signal;
// nocpu_attract_n returns UINT32_MAX there. HIT is not a Space Race concept.
uint32_t nocpu_active(void);
uint32_t nocpu_crashes(uint32_t slot);
// Breakout raw source observations; other games/invalid signals return UINT32_MAX.
// ball_counter is the original B4.13/.12/.11 binary output, not inferred lives.
uint32_t nocpu_breakout_signal(uint32_t signal);
// Exact observed BRICK_HIT rising/BP_HIT_n falling/VB_HIT_n falling counts.
// Other games/non-Breakout event IDs return UINT32_MAX.
uint32_t nocpu_breakout_count(uint32_t event);
// Raw original source observations; unsupported getters return UINT32_MAX.
// Stunt0..7: ATTRACT_n,PLAYER_CONTROL,JUMP,FLIP,GOOD_JUMP,BAD_JUMP,
// E5 binary miss counter,LATCH.3 credit. Throttle is milli-percent0..100000.
uint32_t nocpu_stuntcycle_signal(uint32_t signal);
uint32_t nocpu_stuntcycle_throttle(void);
// Indy global0..2: PLAY,ENDGAME_n,CREDIT_n (slot ignored).
// Per-car3..7: ATTRACT,collision,R0..R4 heading,speed1..5,L0..L2 lap.
// Slot order Green,Cyan,Violet,Red; scores0..3 are original displayed scores (twice the checkpoint count).
// Signal8 is the raw six-bit SCORE display code.
uint32_t nocpu_indy4_signal(uint32_t slot,uint32_t signal);
uint32_t nocpu_game_event_count(uint32_t event);
uint32_t nocpu_time_lo(void);
uint32_t nocpu_time_hi(void);
// Transition triples [time_lo,time_hi,new_hit_value], exact ps; drain each tick.
const uint32_t* nocpu_collisions(void);
uint32_t nocpu_collision_count(void);
void nocpu_collisions_clear(void);
// Exact transition quadruples [time_lo,time_hi,NoCPUEvent,new_pin_value].
// HIT on Pong/Doubles; crash_n/score pulses on Space; distinct brick/paddle/wall
// pins and raw ServeWait/Player2/ATTRACT_n transitions on Breakout. No synthetic
// Pong HIT is generated for Breakout. Bounded queue
// of 4096; drain each tick. Overruns remain visible until reset/destroy.
const uint32_t* nocpu_events(void);
uint32_t nocpu_event_count(void);
void nocpu_events_clear(void);
uint32_t nocpu_event_overruns(void);
#ifdef __cplusplus
}
#endif
#endif
