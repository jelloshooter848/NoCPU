// SPDX-License-Identifier: GPL-3.0-or-later
// Included by the native main.cpp only in an ignored reference build.
#include "reference_api.h"
#include <fstream>
#include <algorithm>
#include <map>
#include <string>
#include <vector>
#include <cstdlib>
#include <sstream>
#include <stdexcept>
#include <functional>
#include <chrono>
#include <sys/resource.h>
#include <sys/stat.h>
#include "chips/dipswitch.h"
#include <zlib.h>

// Games observed from NoCPU 0.2.0 on describe their original inputs, settings
// and observed pins as data, one file per game in tools/reference/games/<id>.inc
// (docs/PORT_GAME.md). apply_adapter.py copies them next to this file and lists
// them in reference_games.inc. This is the reference's own, independently
// written description; it is never shared with the portable core.
struct ReferenceTerm { std::string pin; unsigned weight; };
struct ReferenceDip { std::string name; unsigned bits, values, default_index; };
struct ReferenceGame {
    std::string name;
    std::vector<ReferenceDip> dips;
    std::string pot;
    unsigned pot_min = 0, pot_max = 0, pot_default = 0;
    unsigned paddles = 0, joysticks = 0, joystick_directions = 0, button_slots = 0, buttons = 0, starts = 0;
    std::vector<std::vector<ReferenceTerm>> scores;
    std::string active, attract_n, hit;
    std::vector<std::string> events;
};
static std::vector<ReferenceGame>& reference_games() { static std::vector<ReferenceGame> games; return games; }
static bool reference_add_game(const ReferenceGame& game) { reference_games().push_back(game); return true; }
#define REFERENCE_GAME(ident) \
    static void reference_define_##ident(ReferenceGame& g); \
    static const bool reference_registered_##ident = [] { ReferenceGame g; reference_define_##ident(g); return reference_add_game(g); }(); \
    static void reference_define_##ident(ReferenceGame& g)
#include "reference_games.inc"
static const ReferenceGame* ref_registered = nullptr;
static bool ref_left_right[2][2] = {}, ref_buttons[4][3] = {};
static unsigned reference_dip_mask(const ReferenceGame& game) {
    unsigned mask = 0, shift = 0;
    for(const auto& dip : game.dips) { mask |= ((1u << dip.bits) - 1) << shift; shift += dip.bits; }
    return mask;
}

struct ReferenceEvent { uint64_t time; std::string action; int value; };
static std::vector<ReferenceEvent> ref_events;
static std::map<std::string, Chip*> ref_chips;
static Chip* ref_hit = nullptr;
static unsigned ref_epoch = 0, ref_next_event = 0, ref_snapshot = 0;
static uint64_t ref_deadline = 0, ref_hits = 0;
static bool ref_coin = false, ref_started = false;
static bool ref_start2 = false, ref_serve = false;
static bool ref_coins[5] = {}, ref_gas[4] = {}, ref_brake[4] = {}, ref_wheel_keys[4][2] = {}, ref_throttle_key = false;
static gzFile ref_rgb = nullptr;
static std::ofstream ref_audio_events, ref_diagnostic_state, ref_diagnostic_events;
static bool ref_diagnostics = false;
static std::map<Chip*,const char*> ref_diagnostic_chips;
static const char* ref_diagnostic_keys[] = {"A5.8","J7.5","J7.6","M7.3","E4.12","N9.3","N3.10","L7.10","M8.2","M8.6","D9.9","STUNT_THROTTLE.12","STUNT_THROTTLE.10","N9.11","N7.5","K7.6","K7.9"};
static void reference_diagnostic_row(std::ostream&,uint64_t,const char*,int);
// Opt-in finite-case observations. Every key is a real consumed OUTPUT node;
// these streams neither synthesize signals nor change the circuit inputs.
static std::vector<const char*> ref_scope_keys;
static std::map<Chip*,const char*> ref_scope_chips;
static std::map<Chip*,const ChipDesc*> ref_declared_outputs;
static std::ofstream ref_scope_state, ref_scope_events;
static void reference_scope_row(std::ostream&,uint64_t,const char*,int);

static unsigned ref_breakout_dip[4] = {3, 0, 0, 0};
static bool ref_start = false, ref_directions[2][2] = {{false, false}, {false, false}};
static int16_t ref_axes[4] = {0, 0, 0, 0};
static std::string ref_game = "pong";
static unsigned ref_epochs = 2;
static int ref_dip = -1;
static unsigned ref_pot = 0;
static std::map<Chip*, unsigned> ref_event_chips;
static std::string ref_output;
static std::ofstream ref_pcm, ref_frames, ref_video, ref_telemetry, ref_inputs, ref_collisions, ref_gl_errors, ref_transition_events, ref_hardware, ref_geometry;
static uint64_t ref_frame_number = 0;
static uint64_t ref_run_nanoseconds = 0, ref_run_calls = 0;
static int ref_client_width = 0, ref_client_height = 0;
void reference_video_client(int width, int height) { ref_client_width = width; ref_client_height = height; }

// Epoch zero keeps the established root proof paths. Later New Game proofs
// belong to their epoch and must never overwrite the cold construction evidence.
static std::string reference_proof_path(const char* name) {
    return ref_output + (ref_epoch ? "/epoch" + std::to_string(ref_epoch) : "") + "/" + name;
}

static void reference_clear_registries() {
    ref_chips.clear(); ref_event_chips.clear(); ref_hit = nullptr;
    ref_diagnostic_chips.clear(); ref_scope_chips.clear(); ref_declared_outputs.clear();
}

static void reference_open_epoch() {
    std::string path = ref_output + "/epoch" + std::to_string(ref_epoch);
    mkdir(path.c_str(), 0755);
    ref_pcm.open(path + "/audio.s16le", std::ios::binary);
    ref_frames.open(path + "/frames.csv");
    ref_video.open(path + "/frames.gray", std::ios::binary);
    ref_telemetry.open(path + "/telemetry.csv");
    ref_inputs.open(path + "/inputs.csv");
    ref_collisions.open(path + "/collisions.csv");
    ref_gl_errors.open(path + "/renderer-errors.csv");
    ref_transition_events.open(path + "/events.csv");
    ref_hardware.open(path + "/hardware.csv");
    ref_geometry.open(path + "/frame-geometry.csv");
    if(!ref_pcm || !ref_frames || !ref_video || !ref_telemetry || !ref_inputs || !ref_collisions || !ref_gl_errors || !ref_transition_events || !ref_hardware || !ref_geometry)
        throw std::runtime_error("Cannot open reference artifacts");
    ref_frames << "frame,time_ps,fnv1a64\n";
    if(ref_registered) {
        ref_telemetry << "time_ps";
        for(unsigned slot = 1; slot <= std::max<size_t>(2, ref_registered->scores.size()); ++slot) ref_telemetry << ",score" << slot;
        ref_telemetry << ",run_n,attract_n,hits,active\n";
    } else ref_telemetry << "time_ps,score1,score2,run_n,attract_n,hits" << (ref_game == "pong" ? "\n" : ",active\n");
    ref_inputs << "requested_ps,applied_ps,action,value\n";
    ref_collisions << "time_ps,hit_output\n";
    ref_gl_errors << "time_ps,preexisting_gl_error\n";
    ref_transition_events << "time_ps,signal,value\n";
    if(ref_game == "pongdoubles") ref_hardware << "time_ps,paddle1_r,paddle2_r,paddle3_r,paddle4_r,C3_9,H10_5,H10_6,B2_5,J1_9,F1_12,F1_8\n";
    else if(ref_game == "spacerace") ref_hardware << "time_ps,stick1_up_n,stick1_down_n,stick2_up_n,stick2_down_n,game_on,latch,C9_r,rocket1_counter,rocket2_counter\n";
    else if(ref_game == "breakout") ref_hardware << "time_ps,paddle_r,coin1_n,start1_n,start2_n,serve_n,attract,attract_n,q,q_n,serve_wait,player2,balls,brick_hit,bp_hit_n,vb_hit_n\n";
    else if(ref_game != "stuntcycle" && ref_game != "indy4") ref_hardware << "time_ps\n";
    if(ref_game == "stuntcycle") ref_hardware << "time_ps,attract_n,player_control,jump,flip,good_jump,bad_jump,miss_counter,credit,throttle_milli,score1,score2\n";
    if(ref_game == "indy4") {
        ref_hardware << "time_ps,play,endgame_n,credit_n";
        for(unsigned p = 1; p <= 4; ++p) ref_hardware << ",car" << p << "_attract,car" << p << "_collision,car" << p << "_heading,car" << p << "_speed,car" << p << "_lap,car" << p << "_score_code,car" << p << "_displayed_score";
        ref_hardware << '\n';
    }
    if(ref_game == "stuntcycle" || ref_game == "indy4") {
        ref_audio_events.open(path + "/audio-events.csv");
        if(!ref_audio_events)throw std::runtime_error("Cannot open selected audio timestamp evidence");
        ref_audio_events << "time_ps,phase,sample\n";
        ref_rgb = gzopen((path + "/frames.rgb.gz").c_str(), "wb1");
        if(!ref_rgb) throw std::runtime_error("Cannot open complete RGB evidence");
    }
    if(ref_diagnostics) {
        ref_diagnostic_state.open(path+"/stunt-diagnostic-state.csv");ref_diagnostic_events.open(path+"/stunt-diagnostic-events.csv");
        if(!ref_diagnostic_state||!ref_diagnostic_events)throw std::runtime_error("Cannot open diagnostic evidence");
        for(auto* stream:{&ref_diagnostic_state,&ref_diagnostic_events}) {
            stream->precision(17);*stream<<"time_ps,trigger,trigger_output";
            for(const char* key:ref_diagnostic_keys)*stream<<','<<key;
            *stream<<",throttle_milli,cap_voltage,last_event_time_ps\n";
        }
    }
    if(!ref_scope_keys.empty()) {
        ref_scope_state.open(path+"/scope-diagnostic-state.csv");ref_scope_events.open(path+"/scope-diagnostic-events.csv");
        if(!ref_scope_state||!ref_scope_events)throw std::runtime_error("Cannot open finite scope observations");
        for(auto* stream:{&ref_scope_state,&ref_scope_events}) {
            *stream<<"time_ps,trigger,trigger_output";
            for(const char* key:ref_scope_keys)*stream<<','<<key;
            *stream<<'\n';
        }
    }
    ref_geometry << "frame,time_ps,x,y,width,height,client_width,client_height,scanline_time,v_size,orientation,contrast,p0,p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12,p13,p14,p15\n";
    ref_next_event = ref_snapshot = 0;
    ref_frame_number = ref_hits = 0;
    ref_deadline = 0;
    ref_started = false;
    ref_run_nanoseconds = ref_run_calls = 0;
    ref_coin = ref_start = ref_start2 = ref_serve = ref_throttle_key = false;
    for(auto& coin : ref_coins) coin = false;
    for(unsigned p = 0; p < 4; ++p) { ref_gas[p] = ref_brake[p] = false; ref_wheel_keys[p][0] = ref_wheel_keys[p][1] = false; }
    for(unsigned p = 0; p < 4; ++p) ref_axes[p] = 0;
    for(unsigned p = 0; p < 2; ++p) ref_directions[p][0] = ref_directions[p][1] = false;
    for(auto& stick : ref_left_right) stick[0] = stick[1] = false;
    for(auto& slot : ref_buttons) slot[0] = slot[1] = slot[2] = false;
}

static void reference_close_epoch() {
    if(!ref_pcm || !ref_frames || !ref_video || !ref_telemetry || !ref_inputs || !ref_collisions || !ref_gl_errors || !ref_transition_events || !ref_hardware || !ref_geometry)
        throw std::runtime_error("Original reference evidence write failed");
    ref_pcm.close(); ref_frames.close(); ref_video.close();
    ref_telemetry.close(); ref_inputs.close(); ref_collisions.close();
    ref_gl_errors.close();
    ref_transition_events.close();
    ref_hardware.close(); ref_geometry.close();
    if(ref_rgb && gzclose(ref_rgb) != Z_OK) throw std::runtime_error("Complete RGB stream write failed");
    ref_rgb = nullptr;
    if(ref_game == "stuntcycle" || ref_game == "indy4") { if(!ref_audio_events)throw std::runtime_error("Selected audio event write failed");ref_audio_events.close(); if(ref_audio_events.fail())throw std::runtime_error("Selected audio event close failed"); }
    if(ref_diagnostics) {
        if(!ref_diagnostic_state||!ref_diagnostic_events)throw std::runtime_error("Diagnostic evidence write failed");
        ref_diagnostic_state.close();ref_diagnostic_events.close();
        if(ref_diagnostic_state.fail()||ref_diagnostic_events.fail())throw std::runtime_error("Diagnostic evidence close failed");
    }
    if(!ref_scope_keys.empty()) {
        if(!ref_scope_state||!ref_scope_events)throw std::runtime_error("Finite scope observation write failed");
        ref_scope_state.close();ref_scope_events.close();
        if(ref_scope_state.fail()||ref_scope_events.fail())throw std::runtime_error("Finite scope observation close failed");
    }
    std::ofstream performance(reference_proof_path("step-observation.json"));
    performance << "{\"circuit_run_wall_nanoseconds\":" << ref_run_nanoseconds
                << ",\"calls\":" << ref_run_calls
                << ",\"scope\":\"Circuit::run wall time including native circuit hooks; excludes Qt/Xvfb startup and readback outside run\"}\n";
    if(!performance) throw std::runtime_error("Cannot retain stepping observation");
}

unsigned reference_initialize(Settings& settings) {
    const char* out = getenv("NOCPU_REFERENCE_OUTPUT");
    const char* replay = getenv("NOCPU_REFERENCE_REPLAY");
    const char* seed = getenv("NOCPU_REFERENCE_SEED");
    if(!out || !replay || !seed) throw std::runtime_error("Reference environment missing");
    ref_output = out;
    if(const char* game = getenv("NOCPU_REFERENCE_GAME")) ref_game = game;
    for(const ReferenceGame& game : reference_games()) if(game.name == ref_game) ref_registered = &game;
    if(!ref_registered && ref_game != "pong" && ref_game != "pongdoubles" && ref_game != "spacerace" && ref_game != "breakout" && ref_game != "stuntcycle" && ref_game != "indy4")
        throw std::runtime_error("Unsupported reference game");
    if(const char* epochs = getenv("NOCPU_REFERENCE_EPOCHS")) ref_epochs = std::stoul(epochs);
    if(!ref_epochs || ref_epochs > 2) throw std::runtime_error("Unsupported reference epoch count");
    if(const char* dip = getenv("NOCPU_REFERENCE_DIP")) ref_dip = std::stoi(dip);
    if(const char* pot = getenv("NOCPU_REFERENCE_POT_OHMS")) ref_pot = std::stoul(pot);
    if(ref_registered) {
        if(ref_dip == -1) { ref_dip = 0; unsigned shift = 0; for(const auto& dip : ref_registered->dips) { ref_dip |= dip.default_index << shift; shift += dip.bits; } }
        if(!ref_pot) ref_pot = ref_registered->pot_default;
        if(ref_dip < 0 || (unsigned(ref_dip) & ~reference_dip_mask(*ref_registered)))
            throw std::runtime_error("Invalid original game setting");
        unsigned shift = 0;
        for(const auto& dip : ref_registered->dips) {
            if(((unsigned(ref_dip) >> shift) & ((1u << dip.bits) - 1)) >= dip.values) throw std::runtime_error("Invalid original game setting");
            shift += dip.bits;
        }
        if(ref_registered->pot.empty() ? ref_pot != 0 : (ref_pot < ref_registered->pot_min || ref_pot > ref_registered->pot_max))
            throw std::runtime_error("Invalid original game setting");
    } else if(ref_game == "breakout") {
        if(ref_epochs != 1) throw std::runtime_error("Original Breakout reference requires a fresh process for each epoch");
        if(ref_dip == -1) ref_dip = 3;
        if(ref_dip < 0 || ref_dip >= 128 || (ref_dip & 15) > 8 || ref_pot)
            throw std::runtime_error("Invalid original Breakout settings");
        // Decode the public configuration into the four independently named
        // original descriptors; the recorded packed value is derived from readback.
        ref_breakout_dip[0] = ref_dip & 15;
        ref_breakout_dip[1] = (ref_dip >> 4) & 1;
        ref_breakout_dip[2] = (ref_dip >> 5) & 1;
        ref_breakout_dip[3] = (ref_dip >> 6) & 1;
    } else if(ref_game == "stuntcycle") {
        // Multiple epochs characterize original New Game, not cold reset equality.
        if(ref_dip == -1) ref_dip = 76;
        if(ref_dip < 0 || ref_dip >= 512 || ref_pot) throw std::runtime_error("Invalid Stunt Cycle settings");
    } else if(ref_game == "indy4") {
        // Original wheel queues and analog descriptor state intentionally survive.
        if(ref_dip == -1) ref_dip = 0;
        if(!ref_pot) ref_pot = 720000;
        if(ref_dip || ref_pot < 220000 || ref_pot > 1220000) throw std::runtime_error("Invalid Indy4 settings");
    } else if(ref_dip < -1 || ref_dip > 1 || (ref_game == "spacerace" && ref_pot && (ref_pot < 470000 || ref_pot > 1470000)))
        throw std::runtime_error("Invalid original game setting");
    std::ifstream input(replay);
    if(!input) throw std::runtime_error("Cannot open replay");
    std::string line;
    while(std::getline(input, line)) {
        if(line.empty() || line[0] == '#') continue;
        std::istringstream row(line);
        uint64_t ms; ReferenceEvent event; std::string extra;
        if(!(row >> ms >> event.action >> event.value) || row >> extra || ms > 1000000)
            throw std::runtime_error("Invalid replay row");
        if(ref_registered) {
            // Generic vocabulary: coin, start/start2, paddleN, upN/downN/leftN/rightN
            // for the declared joystick directions, buttonSB, and the final recreate.
            const ReferenceGame& g = *ref_registered;
            const std::string& a = event.action;
            auto numbered = [&](const std::string& prefix, unsigned limit) {
                return a.size() == prefix.size() + 1 && a.compare(0, prefix.size(), prefix) == 0 && a.back() >= '1' && unsigned(a.back() - '0') <= limit;
            };
            const bool analog = numbered("paddle", g.paddles);
            const bool known = a == "coin" || a == "recreate" || (a == "start" && g.starts >= 1) || (a == "start2" && g.starts >= 2) || analog
                || (numbered("up", g.joysticks) && (g.joystick_directions & 1)) || (numbered("down", g.joysticks) && (g.joystick_directions & 2))
                || (numbered("left", g.joysticks) && (g.joystick_directions & 4)) || (numbered("right", g.joysticks) && (g.joystick_directions & 8))
                || (a.size() == 8 && a.compare(0, 6, "button") == 0 && a[6] >= '1' && unsigned(a[6] - '0') <= g.button_slots && a[7] >= '1' && unsigned(a[7] - '0') <= g.buttons);
            if(!known) throw std::runtime_error("Replay action is not a physical input of the selected game");
            if(analog ? (event.value < -32768 || event.value > 32767) : (event.value != 0 && event.value != 1))
                throw std::runtime_error("Replay input outside physical range");
            event.time = ms * 1000000000ull;
            if(!ref_events.empty() && event.time < ref_events.back().time) throw std::runtime_error("Replay times are not sorted");
            ref_events.push_back(event);
            continue;
        }
        const bool paddle = event.action.size() == 7 && event.action.substr(0, 6) == "paddle"
            && event.action[6] >= '1' && event.action[6] <= (ref_game == "pongdoubles" ? '4' : ref_game == "breakout" ? '1' : '2') && (ref_game == "pong" || ref_game == "pongdoubles" || ref_game == "breakout");
        const bool digital = ref_game == "spacerace" && (event.action == "up1" || event.action == "down1" || event.action == "up2" || event.action == "down2");
        const bool throttle = ref_game == "stuntcycle" && event.action == "throttle";
        const bool wheel = ref_game == "indy4" && event.action.size() == 6 && event.action.substr(0, 5) == "wheel" && event.action[5] >= '1' && event.action[5] <= '4';
        const bool new_switch = (ref_game == "stuntcycle" && (event.action == "start2" || event.action == "throttlekey"))
            || (ref_game == "indy4" && (event.action == "dollar" || (event.action.size() == 5 && event.action.substr(0, 4) == "coin" && event.action[4] >= '1' && event.action[4] <= '4')
                || (event.action.size() == 4 && event.action.substr(0, 3) == "gas" && event.action[3] >= '1' && event.action[3] <= '4')
                || (event.action.size() == 6 && event.action.substr(0, 5) == "brake" && event.action[5] >= '1' && event.action[5] <= '4')
                || (event.action.size() == 5 && event.action.substr(0, 4) == "left" && event.action[4] >= '1' && event.action[4] <= '4')
                || (event.action.size() == 6 && event.action.substr(0, 5) == "right" && event.action[5] >= '1' && event.action[5] <= '4')));
        if(!throttle && !wheel && !new_switch && !paddle && !digital && event.action != "coin" && event.action != "recreate" && !(event.action == "start" && ref_game != "pong" && ref_game != "indy4") && !(ref_game == "breakout" && (event.action == "start2" || event.action == "serve")))
            throw std::runtime_error("Replay action is not a physical input of the selected game");
        if(((paddle || wheel) && (event.value < -32768 || event.value > 32767)) || (throttle && (event.value < 0 || event.value > 32767)) || (!paddle && !wheel && !throttle && event.value != 0 && event.value != 1))
            throw std::runtime_error("Replay input outside physical range");
        event.time = ms * 1000000000ull;
        if(!ref_events.empty() && event.time < ref_events.back().time)
            throw std::runtime_error("Replay times are not sorted");
        ref_events.push_back(event);
    }
    if(ref_events.empty() || ref_events.back().action != "recreate" || !ref_events.back().time || ref_events.back().value != 1)
        throw std::runtime_error("Replay must finish at a positive recreation boundary");
    for(unsigned i = 0; i + 1 < ref_events.size(); ++i) if(ref_events[i].action == "recreate")
        throw std::runtime_error("Only the final recreation boundary is supported");
    settings.throttle = false;
    settings.pause = false;
    settings.audio.frequency = Settings::Audio::FREQ_48000;
    settings.audio.volume = 500; // Historical Settings default, avoiding forced clipping.
    settings.audio.mute = false;
    settings.video.vsync = false;
    settings.video.multisampling = Settings::Video::NONE;
    settings.input.coin_start.coin1 = KeyAssignment(KeyAssignment::KEYBOARD, 200, 0);
    settings.input.coin_start.start1 = KeyAssignment(KeyAssignment::KEYBOARD, 201, 0);
    settings.input.coin_start.start2 = KeyAssignment(KeyAssignment::KEYBOARD, 207, 0);
    settings.input.buttons[0].button1 = KeyAssignment(KeyAssignment::KEYBOARD, 208, 0);
    for(unsigned p = 0; p < 4; ++p) {
        auto& paddle = settings.input.paddle[p];
        paddle.use_mouse = paddle.use_keyboard = false;
        paddle.use_joystick = true;
        paddle.joystick_mode = Settings::Input::JOYSTICK_ABSOLUTE;
        paddle.joystick_sensitivity = 0;
        paddle.joy_y_axis = {p, 1};
        paddle.joy_x_axis = {p, 0};
    }
    for(unsigned p = 0; p < 2; ++p) {
        settings.input.joystick[p].up = KeyAssignment(KeyAssignment::KEYBOARD, 202 + p * 2, 0);
        settings.input.joystick[p].down = KeyAssignment(KeyAssignment::KEYBOARD, 203 + p * 2, 0);
        settings.input.joystick[p].left = settings.input.joystick[p].right = KeyAssignment(KeyAssignment::KEYBOARD, 206, 0);
        if(ref_registered && (ref_registered->joystick_directions & 12)) {
            settings.input.joystick[p].left = KeyAssignment(KeyAssignment::KEYBOARD, 280 + p * 2, 0);
            settings.input.joystick[p].right = KeyAssignment(KeyAssignment::KEYBOARD, 281 + p * 2, 0);
        }
    }
    if(ref_registered) for(unsigned p = 0; p < ref_registered->button_slots; ++p) {
        settings.input.buttons[p].button1 = KeyAssignment(KeyAssignment::KEYBOARD, 290 + p * 3, 0);
        settings.input.buttons[p].button2 = KeyAssignment(KeyAssignment::KEYBOARD, 291 + p * 3, 0);
        settings.input.buttons[p].button3 = KeyAssignment(KeyAssignment::KEYBOARD, 292 + p * 3, 0);
    }
    settings.input.coin_start.coin2 = KeyAssignment(KeyAssignment::KEYBOARD, 221, 0);
    settings.input.coin_start.coin3 = KeyAssignment(KeyAssignment::KEYBOARD, 222, 0);
    settings.input.coin_start.coin4 = KeyAssignment(KeyAssignment::KEYBOARD, 223, 0);
    settings.input.coin_start.dollar = KeyAssignment(KeyAssignment::KEYBOARD, 224, 0);
    settings.input.throttle[0].key = KeyAssignment(KeyAssignment::JOYSTICK_AXIS, 1, 0);
    settings.input.throttle[0].keyboard_sensitivity = 250;
    if(ref_game == "indy4") for(unsigned p = 0; p < 4; ++p) {
        auto& wheel = settings.input.wheel[p]; wheel.use_mouse = false; wheel.use_keyboard = true; wheel.keyboard_sensitivity = 500;
        wheel.left = KeyAssignment(KeyAssignment::JOYSTICK_AXIS, 0, p);
        wheel.right = KeyAssignment(KeyAssignment::JOYSTICK_AXIS, 1, p);
        settings.input.buttons[p].button1 = KeyAssignment(KeyAssignment::KEYBOARD, 260 + p * 2, 0);
        settings.input.buttons[p].button2 = KeyAssignment(KeyAssignment::KEYBOARD, 261 + p * 2, 0);
    }
    if(const char* enabled=getenv("NOCPU_REFERENCE_STUNT_DIAGNOSTICS")) {
        if(std::string(enabled)!="1" || ref_game!="stuntcycle")throw std::runtime_error("Invalid diagnostic selection");
        ref_diagnostics=true;
    }
    if(const char* scope=getenv("NOCPU_REFERENCE_SCOPE_DIAGNOSTICS")) {
        if(ref_diagnostics)throw std::runtime_error("Conflicting diagnostic selections");
        const std::string mode(scope);
        if(mode=="stunt-turn" && ref_game=="stuntcycle") {
            ref_scope_keys={"H8.5","E8.3","E8.2","E8.6","E8.7"};
        } else if(mode=="indy-timer" && ref_game=="indy4") {
            ref_scope_keys={"COIN.L1.3","COIN.E1.6","COIN.K1.12","COIN.K1.9","COIN.K1.8","COIN.K1.11","COIN.J1.12","COIN.J1.9","COIN.J1.8","COIN.J1.11","COIN.H1.1","COIN.H1.4","COIN.H1.10","COIN.H1.13","COIN.CAP35.2"};
        } else throw std::runtime_error("Invalid finite scope diagnostic selection");
    }
    reference_open_epoch();
    return static_cast<unsigned>(std::stoul(seed));
}

void reference_configure(const CircuitDesc* desc, const char* name) {
    // The original UI may inspect configuration for other library entries.
    if(ref_game != name) return;
    if(ref_registered) {
        // Decode the packed configuration into the independently named original
        // descriptors, exactly as GameConfig finds them; record the readback.
        std::vector<unsigned> found(ref_registered->dips.size(), 0);
        unsigned pots = 0, packed = 0, pot_readback = 0;
        for(const ChipInstance& instance : desc->get_chips()) {
            if(GameConfig::isDipswitch(instance.chip)) {
                auto* d = reinterpret_cast<DipswitchBase*>(instance.custom_data);
                unsigned shift = 0;
                for(size_t i = 0; i < ref_registered->dips.size(); ++i) {
                    const ReferenceDip& dip = ref_registered->dips[i];
                    if(dip.name == d->name) { d->state = (unsigned(ref_dip) >> shift) & ((1u << dip.bits) - 1); packed |= d->state << shift; ++found[i]; }
                    shift += dip.bits;
                }
            } else if(GameConfig::isPotentiometer(instance.chip)) {
                auto* d = reinterpret_cast<PotentiometerBase*>(instance.custom_data);
                if(!ref_registered->pot.empty() && ref_registered->pot == d->name) { d->current_val = ref_pot; pot_readback = unsigned(d->current_val); ++pots; }
            }
        }
        for(unsigned n : found) if(n != 1) throw std::runtime_error("Missing/duplicate original setting");
        if(pots != (ref_registered->pot.empty() ? 0u : 1u)) throw std::runtime_error("Missing/duplicate original potentiometer");
        std::ofstream config(reference_proof_path("configuration.json"));
        config << "{\"game\":\"" << ref_game << "\",\"dip\":" << packed << ",\"pot_ohms\":" << pot_readback << "}\n";
        if(!config) throw std::runtime_error("Cannot record original configuration");
        return;
    }
    if(ref_game == "stuntcycle") {
        const char* keys[] = {"misses", "free_game_control", "coinage", "free_game_en"};
        const unsigned values[] = {unsigned(ref_dip & 7), unsigned((ref_dip >> 3) & 15), unsigned((ref_dip >> 7) & 1), unsigned((ref_dip >> 8) & 1)};
        unsigned found[4] = {}, readback[4] = {};
        for(const ChipInstance& instance : desc->get_chips()) {
            if(instance.chip != chip_DIPSWITCH && instance.chip != chip_53137) continue;
            auto* d = reinterpret_cast<DipswitchBase*>(instance.custom_data);
            for(unsigned i = 0; i < 4; ++i) if(std::string(d->name) == keys[i]) { d->state = values[i]; readback[i] = d->state; ++found[i]; }
        }
        for(unsigned n : found) if(n != 1) throw std::runtime_error("Missing/duplicate Stunt setting");
        const unsigned packed = readback[0] | (readback[1] << 3) | (readback[2] << 7) | (readback[3] << 8);
        std::ofstream config(reference_proof_path("configuration.json")); config << "{\"game\":\"stuntcycle\",\"dip\":" << packed << ",\"pot_ohms\":0}\n";
        if(!config) throw std::runtime_error("Cannot record Stunt settings");
        return;
    }
    if(ref_game == "indy4") {
        unsigned found = 0, readback = 0;
        for(const ChipInstance& instance : desc->get_chips()) if(instance.chip == chip_POT_555_ASTABLE) {
            auto* d = reinterpret_cast<PotentiometerBase*>(instance.custom_data);
            if(std::string(d->name) == "playtime") { d->current_val = ref_pot; readback = d->current_val; ++found; }
        }
        if(found != 1) throw std::runtime_error("Missing/duplicate Indy playtime");
        std::ofstream config(reference_proof_path("configuration.json")); config << "{\"game\":\"indy4\",\"dip\":0,\"pot_ohms\":" << readback << "}\n";
        if(!config) throw std::runtime_error("Cannot record Indy settings");
        return;
    }
    if(ref_game == "breakout") {
        const char* keys[] = {"bonus_credit", "cabinet_type", "coinage", "ball_count"};
        unsigned observed[4] = {0, 0, 0, 0}, readback[4] = {0, 0, 0, 0};
        for(const ChipInstance& instance : desc->get_chips()) {
            if(instance.chip != chip_DIPSWITCH && instance.chip != chip_53137) continue;
            auto* setting = reinterpret_cast<DipswitchBase*>(instance.custom_data);
            for(unsigned index = 0; index < 4; ++index) if(std::string(setting->name) == keys[index]) {
                setting->state = ref_breakout_dip[index]; readback[index] = setting->state; observed[index]++;
            }
        }
        for(unsigned count : observed) if(count != 1) throw std::runtime_error("Missing/duplicate original Breakout setting");
        const unsigned packed = readback[0] | (readback[1] << 4) | (readback[2] << 5) | (readback[3] << 6);
        std::ofstream config(reference_proof_path("configuration.json"));
        config << "{\"game\":\"breakout\",\"dip\":" << packed << ",\"pot_ohms\":0}\n";
        std::ofstream switches(reference_proof_path("breakout-switches.json"));
        switches << "{\"bonus_credit\":" << readback[0] << ",\"cabinet_type\":" << readback[1]
                 << ",\"coinage\":" << readback[2] << ",\"ball_count\":" << readback[3] << "}\n";
        if(!config || !switches) throw std::runtime_error("Cannot record original Breakout configuration");
        return;
    }
    for(const ChipInstance& instance : desc->get_chips()) {
        if(instance.chip == chip_DIPSWITCH && ref_dip >= 0)
            reinterpret_cast<DipswitchBase*>(instance.custom_data)->state = ref_dip;
        else if(instance.chip == chip_POT_555_MONO && ref_pot)
            reinterpret_cast<PotentiometerBase*>(instance.custom_data)->current_val = ref_pot;
    }
    if(ref_game != "pong") {
        std::ofstream config(reference_proof_path("configuration.json"));
        config << "{\"game\":\"" << ref_game << "\",\"dip\":" << ref_dip << ",\"pot_ohms\":" << ref_pot << "}\n";
        if(!config) throw std::runtime_error("Cannot record original configuration");
    }
}

void reference_register_chip(const char* name, unsigned pin, Chip* chip, const ChipDesc* descriptor) {
    std::string key = std::string(name) + "." + std::to_string(pin);
    ref_chips[key] = chip;
    if(!descriptor || descriptor->output_pin!=pin || (!descriptor->logic_func && !descriptor->custom_logic))
        throw std::runtime_error("Invalid declared reference output");
    ref_declared_outputs[chip]=descriptor;
    for(const char* observed:ref_scope_keys)if(key==observed)ref_scope_chips[chip]=observed;

    if(ref_diagnostics)for(const char* observed:ref_diagnostic_keys)if(key==observed)ref_diagnostic_chips[chip]=observed;
    if(ref_registered) {
        if(!ref_registered->hit.empty() && key == ref_registered->hit) { ref_hit = chip; ref_event_chips[chip] = 0; }
        for(unsigned index = 0; index < ref_registered->events.size(); ++index)
            if(key == ref_registered->events[index]) ref_event_chips[chip] = 200 + index;
    } else if((ref_game == "pong" && key == "B2.8") || (ref_game == "pongdoubles" && key == "B3.8")) {
        ref_hit = chip; ref_event_chips[chip] = 0;
    } else if(ref_game == "breakout") {
        static const char* keys[] = {"E6.5", "A5.8", "A5.6", "A3.9", "B4.14", "E6.9"};
        for(unsigned signal = 0; signal < 6; ++signal) if(key == keys[signal]) ref_event_chips[chip] = signal + 100;
    } else if(ref_game == "stuntcycle") {
        static const char* keys[] = {"D9.9", "H6.8", "N9.11", "N7.5", "K7.6", "K7.9"};
        for(unsigned signal = 0; signal < 6; ++signal) if(key == keys[signal]) ref_event_chips[chip] = signal + 11;
    } else if(ref_game == "indy4") {
        static const char* keys[] = {"COIN.H1.10", "COIN.F4.6", "COIN.F4.3", "COIN.F4.8", "COIN.F4.11", "GREEN.L1.3", "CYAN.L1.3", "VIOLET.L1.3", "RED.L1.3", "SCORE.B5.15", "SCORE.A5.15", "SCORE.F5.15", "SCORE.E5.15"};
        for(unsigned signal = 0; signal < 13; ++signal) if(key == keys[signal]) ref_event_chips[chip] = signal + 17;
    } else if(ref_game == "spacerace") {
        static const char* keys[] = {"D5.8", "D5.10", "H2.8", "K2.8"};
        for(unsigned signal = 0; signal < 4; ++signal) if(key == keys[signal]) ref_event_chips[chip] = signal + 1;
    }
}

void reference_prune(const std::vector<Chip*>& live) {
    if(ref_hit && std::find(live.begin(),live.end(),ref_hit)==live.end())ref_hit=nullptr;
    for(auto it=ref_chips.begin();it!=ref_chips.end();) {
        if(std::find(live.begin(),live.end(),it->second)==live.end())it=ref_chips.erase(it);else ++it;
    }
    for(auto it=ref_diagnostic_chips.begin();it!=ref_diagnostic_chips.end();) {
        if(std::find(live.begin(),live.end(),it->first)==live.end())it=ref_diagnostic_chips.erase(it);else ++it;
    }
    for(auto it=ref_scope_chips.begin();it!=ref_scope_chips.end();) {
        if(std::find(live.begin(),live.end(),it->first)==live.end())it=ref_scope_chips.erase(it);else ++it;
    }
    for(auto it=ref_declared_outputs.begin();it!=ref_declared_outputs.end();) {
        if(std::find(live.begin(),live.end(),it->first)==live.end())it=ref_declared_outputs.erase(it);else ++it;
    }
    for(auto it=ref_event_chips.begin();it!=ref_event_chips.end();) {
        if(std::find(live.begin(),live.end(),it->first)==live.end())it=ref_event_chips.erase(it);else ++it;
    }
}

bool reference_key(unsigned scancode) {
    if(scancode == 200) return ref_coin || ref_coins[0];
    if(scancode >= 221 && scancode <= 224) return ref_coins[scancode - 220];
    if(scancode == 250) return ref_throttle_key;
    if(scancode >= 260 && scancode < 268) return (scancode & 1) ? ref_brake[(scancode - 260) / 2] : ref_gas[(scancode - 260) / 2];
    if(scancode >= 270 && scancode < 278) return ref_wheel_keys[(scancode - 270) / 2][scancode & 1];
    if(scancode == 201) return ref_start;
    if(scancode == 207) return ref_start2;
    if(scancode == 208) return ref_serve;
    if(scancode >= 202 && scancode <= 205) return ref_directions[(scancode - 202) / 2][(scancode - 202) % 2];
    if(scancode >= 280 && scancode < 284) return ref_left_right[(scancode - 280) / 2][scancode & 1];
    if(scancode >= 290 && scancode < 302) return ref_buttons[(scancode - 290) / 3][(scancode - 290) % 3];
    return false;
}
int16_t reference_axis(unsigned joystick, unsigned axis) {
    // A registered game's paddle N reads joystick N, through its X axis when
    // horizontal and its Y axis when vertical; each stick drives one paddle.
    if(ref_registered) return joystick < 4 && axis < 2 ? ref_axes[joystick] : 0;
    return joystick < 4 && axis == (ref_game == "breakout" || ref_game == "stuntcycle" || ref_game == "indy4" ? 0u : 1u) ? ref_axes[joystick] : 0;
}

ReferenceObserver::ReferenceObserver(Chip* c) : chip(ref_event_chips.count(c)||(ref_diagnostics&&ref_diagnostic_chips.count(c))||ref_scope_chips.count(c)?c:nullptr), previous(chip?chip->output:0), signal(ref_event_chips.count(c)?ref_event_chips.at(c):-1), diagnostic_name(ref_diagnostics&&ref_diagnostic_chips.count(c)?ref_diagnostic_chips.at(c):nullptr), scope_diagnostic_name(ref_scope_chips.count(c)?ref_scope_chips.at(c):nullptr) {}
ReferenceObserver::~ReferenceObserver() {
    if(chip && chip->output!=previous && ref_started) {
        if(signal>=0)ref_transition_events<<chip->circuit->global_time<<','<<signal<<','<<(signal==15?!chip->output:chip->output)<<'\n';
        if(signal==0){ref_collisions<<chip->circuit->global_time<<','<<chip->output<<'\n';if(chip->output)++ref_hits;}
        if(diagnostic_name)reference_diagnostic_row(ref_diagnostic_events,chip->circuit->global_time,diagnostic_name,chip->output);
        if(scope_diagnostic_name)reference_scope_row(ref_scope_events,chip->circuit->global_time,scope_diagnostic_name,chip->output);
    }
}

static int reference_pin(const char* name) {
    auto found = ref_chips.find(name);
    if(found == ref_chips.end()) throw std::runtime_error(std::string("Missing signal ") + name);
    return found->second->output;
}

static void reference_scope_row(std::ostream& stream,uint64_t time,const char* trigger,int value) {
    stream<<time<<','<<trigger<<','<<value;
    for(const char* key:ref_scope_keys) {
        int output=reference_pin(key);
        if(output!=0 && output!=1)throw std::runtime_error("Nonbinary finite scope output");
        stream<<','<<output;
    }
    stream<<'\n';if(!stream)throw std::runtime_error("Finite scope event write failed");
}

static void reference_diagnostic_row(std::ostream& stream,uint64_t time,const char* trigger,int value) {
    stream<<time<<','<<trigger<<','<<value;
    for(const char* key:ref_diagnostic_keys)stream<<','<<reference_pin(key);
    stream<<','<<reference_stuntcycle_throttle()<<','<<reference_stuntcycle_cap_voltage()<<','<<reference_stuntcycle_last_event_time()<<'\n';
    if(!stream)throw std::runtime_error("Diagnostic event write failed");
}

static int reference_score(const char* name, const char* tens) {
    std::string chip(name);
    return reference_pin((chip + ".12").c_str()) + 2 * reference_pin((chip + ".9").c_str())
        + 4 * reference_pin((chip + ".8").c_str()) + 8 * reference_pin((chip + ".11").c_str())
        + 10 * reference_pin(tens);
}

static int breakout_bcd(const char* name) {
    std::string chip(name);
    return reference_pin((chip + ".14").c_str()) + 2 * reference_pin((chip + ".13").c_str())
        + 4 * reference_pin((chip + ".12").c_str()) + 8 * reference_pin((chip + ".11").c_str());
}

static int counter192(const char* name) {
    std::string n(name); return reference_pin((n + ".3").c_str()) + 2 * reference_pin((n + ".2").c_str()) + 4 * reference_pin((n + ".6").c_str()) + 8 * reference_pin((n + ".7").c_str());
}
static int indy_score(unsigned slot) {
    static const char* bits[4][6] = {{"SCORE.B4.9","SCORE.B4.8","SCORE.B4.11","SCORE.B4.12","SCORE.A4.12","SCORE.A3.12"}, {"SCORE.A4.9","SCORE.A4.8","SCORE.A4.11","SCORE.A3.9","SCORE.A3.8","SCORE.A3.11"}, {"SCORE.F4.9","SCORE.F4.8","SCORE.F4.11","SCORE.F4.12","SCORE.E4.12","SCORE.E3.12"}, {"SCORE.E4.9","SCORE.E4.8","SCORE.E4.11","SCORE.E3.9","SCORE.E3.8","SCORE.E3.11"}};
    int result = 0; for(unsigned b = 0; b < 6; ++b) result |= reference_pin(bits[slot][b]) << b; return result;
}
static int indy_displayed_score(unsigned slot) { const int code = indy_score(slot); return 2 * (code & 7) + 10 * (code >> 3); }
static int reference_sum(const std::vector<ReferenceTerm>& terms) {
    int value = 0;
    for(const ReferenceTerm& term : terms) value += int(term.weight) * reference_pin(term.pin.c_str());
    return value;
}
static void reference_state(Circuit* circuit) {
    if(ref_registered) {
        const ReferenceGame& g = *ref_registered;
        ref_telemetry << circuit->global_time;
        for(size_t slot = 0; slot < std::max<size_t>(2, g.scores.size()); ++slot) ref_telemetry << ',' << (slot < g.scores.size() ? reference_sum(g.scores[slot]) : 0);
        const int active = reference_pin(g.active.c_str()) != 0;
        ref_telemetry << ',' << !active << ',';
        if(g.attract_n.empty()) ref_telemetry << "4294967295"; else ref_telemetry << reference_pin(g.attract_n.c_str());
        ref_telemetry << ',' << ref_hits << ',' << active << '\n';
    } else if(ref_game == "pong") {
        ref_telemetry << circuit->global_time << ',' << reference_score("C7", "C8.3") << ','
                      << reference_score("D7", "C8.5") << ',' << reference_pin("LATCH.3") << ','
                      << reference_pin("D2.1") << ',' << ref_hits << '\n';
    } else if(ref_game == "pongdoubles") {
        ref_telemetry << circuit->global_time << ',' << reference_score("C8", "C9.3") << ','
                      << reference_score("D8", "C9.5") << ',' << reference_pin("LATCH.3") << ','
                      << reference_pin("D2.4") << ',' << ref_hits << ',' << reference_pin("D2.4") << '\n';
    } else if(ref_game == "breakout") {
        // Observations use the original named ATTRACT_n gate, not Pong's latch semantics.
        ref_telemetry << circuit->global_time << ',' << breakout_bcd("H6") + 10 * breakout_bcd("J6") + 100 * breakout_bcd("K6") << ','
                      << breakout_bcd("N6") + 10 * breakout_bcd("M6") + 100 * breakout_bcd("L6") << ','
                      << reference_pin("LATCH.3") << ',' << reference_pin("E6.9") << ",0," << reference_pin("E6.9") << '\n';
    } else if(ref_game == "stuntcycle") {
        ref_telemetry << circuit->global_time << ',' << counter192("B8") + 10 * reference_pin("A9.9") << ',' << counter192("B9") + 10 * reference_pin("A9.5") << ',' << !reference_pin("D9.9") << ',' << reference_pin("D9.9") << ",0," << reference_pin("D9.9") << '\n';
    } else if(ref_game == "indy4") {
        ref_telemetry << circuit->global_time << ',' << indy_displayed_score(0) << ',' << indy_displayed_score(1) << ',' << !reference_pin("COIN.H1.10") << ",4294967295,0," << reference_pin("COIN.H1.10") << '\n';
    } else {
        // Both Space Race 7490 decades are full BCD; GAME_ON is active high.
        ref_telemetry << circuit->global_time << ',' << reference_score("J9", "H9.12")
                      + 10 * (2 * reference_pin("H9.9") + 4 * reference_pin("H9.8") + 8 * reference_pin("H9.11")) << ','
                      << reference_score("L9", "K9.12")
                      + 10 * (2 * reference_pin("K9.9") + 4 * reference_pin("K9.8") + 8 * reference_pin("K9.11")) << ','
                      << !reference_pin("C9.3") << ",4294967295,0," << reference_pin("C9.3") << '\n';
    }
    ref_hardware.precision(17);
    ref_hardware << circuit->global_time;
    if(ref_diagnostics)reference_diagnostic_row(ref_diagnostic_state,circuit->global_time,"sample",0);
    if(!ref_scope_keys.empty())reference_scope_row(ref_scope_state,circuit->global_time,"sample",0);
    if(ref_game == "pongdoubles") {
        for(const char* key : {"B10.3", "A10.3", "B9A.3", "B9B.3"})
            ref_hardware << ',' << reinterpret_cast<Mono555Desc*>(ref_chips.at(key)->custom_data)->r;
        for(const char* key : {"C3.9", "H10.5", "H10.6", "B2.5", "J1.9", "F1.12", "F1.8"}) ref_hardware << ',' << reference_pin(key);
    } else if(ref_game == "breakout") {
        ref_hardware << ',' << reinterpret_cast<Mono555Desc*>(ref_chips.at("C9.3")->custom_data)->r;
        for(const char* key : {"COIN1.1", "START.1", "START.2", "SERVE.1", "E6.8", "E6.9", "E9.6", "LATCH.3", "A3.9", "B4.14"}) ref_hardware << ',' << reference_pin(key);
        ref_hardware << ',' << reference_pin("B4.13") + 2 * reference_pin("B4.12") + 4 * reference_pin("B4.11");
        for(const char* key : {"E6.5", "A5.8", "A5.6"}) ref_hardware << ',' << reference_pin(key);
    } else if(ref_game == "spacerace") {
        for(const char* key : {"STICK1.1", "STICK1.2", "STICK2.1", "STICK2.2", "C9.3", "LATCH.3"}) ref_hardware << ',' << reference_pin(key);
        ref_hardware << ',' << reinterpret_cast<Mono555Desc*>(ref_chips.at("C9.3")->custom_data)->r;
        for(const char* counter : {"J3", "L3"}) {
            const std::string name(counter);
            ref_hardware << ',' << reference_pin((name + ".14").c_str()) + 2 * reference_pin((name + ".13").c_str())
                + 4 * reference_pin((name + ".12").c_str()) + 8 * reference_pin((name + ".11").c_str());
        }
    }
    if(ref_game == "stuntcycle") {
        for(const char* key : {"D9.9", "H6.8", "N9.11", "N7.5", "K7.6", "K7.9"}) ref_hardware << ',' << (std::string(key) == "K7.6" ? !reference_pin(key) : reference_pin(key));
        ref_hardware << ',' << counter192("E5") << ',' << reference_pin("LATCH.3") << ',' << reference_stuntcycle_throttle()
            << ',' << counter192("B8") + 10 * reference_pin("A9.9") << ',' << counter192("B9") + 10 * reference_pin("A9.5");
    } else if(ref_game == "indy4") {
        ref_hardware << ',' << reference_pin("COIN.H1.10") << ',' << reference_pin("COIN.H1.1") << ',' << reference_pin("COIN.CAP35.2");
        const char* names[] = {"GREEN", "CYAN", "VIOLET", "RED"}; const char* attract[] = {"COIN.F4.6", "COIN.F4.3", "COIN.F4.8", "COIN.F4.11"};
        for(unsigned p = 0; p < 4; ++p) {
            std::string n(names[p]); ref_hardware << ',' << reference_pin(attract[p]) << ',' << reference_pin((n + ".L1.3").c_str());
            unsigned heading = 0, speed = 0, lap = 0;
            const char* h[] = {".E2.6", ".E2.7", ".F2.3", ".F2.2", ".F2.6"};
            const char* v[] = {".C2.3", ".C2.2", ".C2.6", ".C2.7", ".A1.5"};
            const char* l[] = {".K3.13", ".K3.12", ".K3.11"};
            for(unsigned b = 0; b < 5; ++b) { heading |= reference_pin((n + h[b]).c_str()) << b; speed |= reference_pin((n + v[b]).c_str()) << b; }
            for(unsigned b = 0; b < 3; ++b) lap |= reference_pin((n + l[b]).c_str()) << b;
            ref_hardware << ',' << heading << ',' << speed << ',' << lap << ',' << indy_score(p) << ',' << indy_displayed_score(p);
        }
    }
    ref_hardware << '\n';
}

void reference_sample(uint64_t time, int16_t sample) {
    if(ref_game == "stuntcycle" || ref_game == "indy4")ref_audio_events << time << ',' << (ref_started ? "ongoing" : "construction") << ',' << sample << '\n';
    const unsigned char bytes[] = {static_cast<unsigned char>(sample & 255),
                                   static_cast<unsigned char>((static_cast<uint16_t>(sample) >> 8) & 255)};
    ref_pcm.write(reinterpret_cast<const char*>(bytes), sizeof(bytes));
}

void reference_frame(uint64_t time, uint64_t scanline_time, uint32_t v_size, int orientation, double contrast) {
    // The historical renderer can leave an error while its initial scan bounds
    // are still zero. Attribute failures only to this adapter's read operations.
    for(GLenum error = glGetError(); error != GL_NO_ERROR; error = glGetError())
        ref_gl_errors << time << ',' << error << '\n';
    GLint viewport[4]; glGetIntegerv(GL_VIEWPORT, viewport);
    if(viewport[2] <= 0 || viewport[3] <= 0) return;
    const int width = viewport[2], height = viewport[3];
    GLfloat projection[16]; glGetFloatv(GL_PROJECTION_MATRIX, projection);
    if(ref_frame_number == 0) {
        GLint subpixel = 0; glGetIntegerv(GL_SUBPIXEL_BITS, &subpixel);
        std::ofstream renderer(ref_output + "/renderer-identity.txt");
        renderer << "vendor=" << glGetString(GL_VENDOR) << "\nrenderer=" << glGetString(GL_RENDERER)
                 << "\nversion=" << glGetString(GL_VERSION) << "\nreported_subpixel_bits=" << subpixel << '\n';
        if(!renderer) throw std::runtime_error("Cannot retain GL identity");
    }
    ref_geometry.precision(17);
    ref_geometry << ref_frame_number << ',' << time;
    for(int value : viewport) ref_geometry << ',' << value;
    ref_geometry << ',' << ref_client_width << ',' << ref_client_height << ',' << scanline_time << ',' << v_size << ',' << orientation << ',' << contrast;
    for(GLfloat value : projection) ref_geometry << ',' << value;
    ref_geometry << '\n';
    std::vector<unsigned char> pixels(width * height * 3);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glReadBuffer(GL_BACK);
    glReadPixels(viewport[0], viewport[1], width, height, GL_RGB, GL_UNSIGNED_BYTE, pixels.data());
    if(glGetError() != GL_NO_ERROR) throw std::runtime_error("OpenGL frame read failed");
    uint64_t hash = 14695981039346656037ull;
    for(unsigned char value : pixels) { hash ^= value; hash *= 1099511628211ull; }
    if(ref_rgb && gzwrite(ref_rgb, pixels.data(), pixels.size()) != int(pixels.size())) throw std::runtime_error("Complete RGB frame write failed");
    ref_frames << ref_frame_number++ << ',' << time << ',' << hash << '\n';
    // Small observation raster, derived from the unmodified native OpenGL renderer.
    for(int y = 0; y < 120; ++y) for(int x = 0; x < 160; ++x) {
        int px = x * width / 160, py = height - 1 - y * height / 120;
        unsigned char value = pixels[(py * width + px) * 3];
        ref_video.put(value);
    }
    static const uint64_t snapshots[] = {250, 399, 633, 799, 866, 999, 1000, 1132, 1166, 1232, 1316, 1382, 1500, 1800, 2000, 2100, 2200, 2250, 2300, 2400, 2500, 2600, 2700, 2750, 3000, 3200, 3250, 3300, 3400, 3500, 3600, 3700, 3750, 3800, 3900, 4000, 4250, 4500, 4750, 5000, 5250, 5500, 5750, 6000, 6500, 7500, 8000, 8500, 9000, 9500, 10000, 10500, 11000, 11500, 12000, 13000, 15000, 20000, 30000, 45000, 60000, 80000, 110000, 130000, 170000};
    if(ref_snapshot < sizeof(snapshots)/sizeof(snapshots[0]) && time >= snapshots[ref_snapshot] * 1000000000ull) {
        std::string path = ref_output + "/epoch" + std::to_string(ref_epoch) + "/" + std::to_string(snapshots[ref_snapshot++]) + "ms.ppm";
        std::ofstream image(path, std::ios::binary);
        image << "P6\n" << width << ' ' << height << "\n255\n";
        for(int y = height - 1; y >= 0; --y)
            image.write(reinterpret_cast<const char*>(&pixels[y * width * 3]), width * 3);
        if(!image) throw std::runtime_error("Original full-color snapshot write failed");
    }
}

// Implemented beside the original typed static wheel descriptors in the
// disposable adapter copy. This API only copies publicly exposed state.
extern bool reference_indy4_wheel(unsigned, double&, std::vector<double>&, std::vector<double>&);
static void reference_retained_state(const Settings& settings, const char* phase) {
    if(ref_game!="stuntcycle" && ref_game!="indy4") return;
    std::ofstream out(ref_output+"/epoch"+std::to_string(ref_epoch)+"/retained-state-"+phase+".json");
    out.precision(17);
    const auto assignment=[&out](const KeyAssignment& key) {
        out << "{\"type\":" << key.type << ",\"button\":" << key.button << ",\"joystick\":" << key.joystick << '}';
    };
    out << "{\"game\":\"" << ref_game << "\",\"epoch\":" << ref_epoch << ",\"phase\":\"" << phase
        << "\",\"observer\":{\"started\":" << (ref_started?"true":"false") << ",\"next_event\":" << ref_next_event
        << ",\"frame\":" << ref_frame_number << ",\"hits\":" << ref_hits << ",\"deadline_ps\":" << ref_deadline << "},\"hardware\":{";
    if(ref_game=="stuntcycle") {
        out << "\"throttle_milli\":" << reference_stuntcycle_throttle() << ",\"cap_voltage\":" << reference_stuntcycle_cap_voltage()
            << ",\"last_event_time_ps\":" << reference_stuntcycle_last_event_time() << "},\"input_mode\":{\"throttle\":";
        assignment(settings.input.throttle[0].key);
        out << ",\"keyboard_sensitivity\":" << settings.input.throttle[0].keyboard_sensitivity << '}';
    } else {
        out << "\"wheels\":[";
        for(unsigned slot=0;slot<4;++slot) {
            double angle; std::vector<double> a,b;
            if(!reference_indy4_wheel(slot,angle,a,b)) throw std::runtime_error("Cannot observe typed wheel state");
            if(slot)out<<',';
            out << "{\"slot\":" << slot << ",\"angle\":" << angle << ",\"queues\":[";
            unsigned channel=0;
            for(const auto* values:{&a,&b}) {
                if(channel++)out<<',';out<<'[';
                for(unsigned n=0;n<values->size();++n) {if(n)out<<',';out<<(*values)[n];}
                out<<']';
            }
            out << "]}";
        }
        out << "]},\"input_mode\":{\"wheels\":[";
        for(unsigned slot=0;slot<4;++slot) {
            if(slot)out<<',';const auto& wheel=settings.input.wheel[slot];
            out << "{\"use_mouse\":" << (wheel.use_mouse?"true":"false") << ",\"use_keyboard\":" << (wheel.use_keyboard?"true":"false")
                << ",\"keyboard_sensitivity\":" << wheel.keyboard_sensitivity << ",\"left\":";
            assignment(wheel.left);out<<",\"right\":";assignment(wheel.right);out<<'}';
        }
        out << "]}";
    }
    out << "}\n";
    if(!out)throw std::runtime_error("Cannot retain typed original static state");
}

static Circuit* reference_construct(const Settings& settings, Input& input, Video& video, const CircuitDesc* desc, const char* name) {
    rusage before_usage, after_usage;
    if(getrusage(RUSAGE_SELF, &before_usage)) throw std::runtime_error("Cannot observe constructor resource state");
    const auto started = std::chrono::steady_clock::now();
    reference_retained_state(settings, "before-construction");
    Circuit* result = new Circuit(settings, input, video, desc, name);
    reference_retained_state(settings, "after-construction");
    if(ref_diagnostics) {
        std::ofstream live(reference_proof_path("stunt-diagnostic-live-pins.json"));live<<"{\"pins\":[";bool first=true;
        for(const char* key:ref_diagnostic_keys) {
            auto found=ref_chips.find(key);
            if(found==ref_chips.end()||std::find(result->chips.begin(),result->chips.end(),found->second)==result->chips.end())throw std::runtime_error(std::string("Missing live diagnostic output ")+key);
            Chip* chip=found->second;
            if(!first)live<<',';first=false;
            live<<"{\"name\":\""<<key<<"\",\"type\":"<<int(chip->type)<<",\"output_pin\":"<<std::stoul(std::string(key).substr(std::string(key).find_last_of('.')+1))<<",\"fanout_count\":"<<chip->output_links.size()<<"}";
        }
        live<<"]}\n";if(!live)throw std::runtime_error("Cannot record diagnostic liveness");
    }
    if(!ref_scope_keys.empty()) {
        std::ofstream proof(reference_proof_path("scope-diagnostic-live-pins.json"));proof<<"{\"pins\":[";bool first=true;
        for(const char* key:ref_scope_keys) {
            auto found=ref_chips.find(key);
            if(found==ref_chips.end()||std::find(result->chips.begin(),result->chips.end(),found->second)==result->chips.end())throw std::runtime_error(std::string("Missing live finite scope output ")+key);
            Chip* chip=found->second;auto descriptor=ref_declared_outputs.find(chip);
            unsigned pin=std::stoul(std::string(key).substr(std::string(key).find_last_of('.')+1));
            if(descriptor==ref_declared_outputs.end()||descriptor->second->output_pin!=pin||chip->output_links.empty())throw std::runtime_error("Invalid finite scope OUTPUT/fanout proof");
            bool custom=descriptor->second->custom_logic!=nullptr;
            if(custom ? chip->type!=CUSTOM_CHIP : (chip->type!=SIMPLE_CHIP && chip->type!=BASIC_CHIP))throw std::runtime_error("Finite scope descriptor/type mismatch");
            if(chip->output!=0 && chip->output!=1)throw std::runtime_error("Nonbinary finite scope initial output");
            if(!first)proof<<',';first=false;
            proof<<"{\"name\":\""<<key<<"\",\"declared_output_pin\":"<<pin<<",\"type\":"<<int(chip->type)<<",\"descriptor_custom\":"<<(custom?"true":"false")<<",\"fanout_count\":"<<chip->output_links.size()<<"}";
        }
        proof<<"]}\n";if(!proof)throw std::runtime_error("Cannot retain finite scope live OUTPUT proof");
    }
    const auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now() - started).count();
    if(getrusage(RUSAGE_SELF, &after_usage)) throw std::runtime_error("Cannot observe constructor resources");
    const auto microseconds = [](const timeval& value) { return uint64_t(value.tv_sec) * 1000000 + value.tv_usec; };
    std::ofstream observation(reference_proof_path("constructor-observation.json"));
    observation << "{\"wall_nanoseconds\":" << duration << ",\"user_cpu_microseconds\":"
                << microseconds(after_usage.ru_utime) - microseconds(before_usage.ru_utime)
                << ",\"system_cpu_microseconds\":" << microseconds(after_usage.ru_stime) - microseconds(before_usage.ru_stime)
                << ",\"process_maxrss_kib_at_return\":" << after_usage.ru_maxrss
                << ",\"scope\":\"original Circuit constructor; process high-water RSS includes prior Qt startup\"}\n";
    if(!observation) throw std::runtime_error("Cannot retain original constructor observation");
    observation.close();
    if(observation.fail()) throw std::runtime_error("Cannot close constructor observation");
    // Preserve per-epoch proof closure while retaining the established epoch-zero
    // root aliases. No circuit or descriptor state is modified by these copies.
    if(ref_epoch == 0) for(const char* name : {"configuration.json", "constructor-observation.json", "stunt-diagnostic-live-pins.json", "scope-diagnostic-live-pins.json"}) {
        std::ifstream source(reference_proof_path(name), std::ios::binary);
        if(!source) {
            if(std::string(name)=="configuration.json" && ref_game=="pong") continue;
            if(std::string(name)=="stunt-diagnostic-live-pins.json" && !ref_diagnostics) continue;
            if(std::string(name)=="scope-diagnostic-live-pins.json" && ref_scope_keys.empty()) continue;
            throw std::runtime_error("Missing construction proof");
        }
        std::ofstream copy(ref_output+"/epoch0/"+name, std::ios::binary);
        copy << source.rdbuf();
        if(!copy || source.bad()) throw std::runtime_error("Cannot preserve epoch construction proof");
    }
    std::ofstream lifecycle(ref_output+"/epoch"+std::to_string(ref_epoch)+"/lifecycle.json");
    lifecycle << "{\"game\":\"" << ref_game << "\",\"epoch\":" << ref_epoch
              << ",\"construction\":\"" << (ref_epoch ? "original_new_game_retained_static_state" : "fresh_process")
              << "\",\"cold_reset_equivalence_claim\":false}\n";
    if(!lifecycle) throw std::runtime_error("Cannot retain construction lifecycle");
    return result;
}

static void reference_timed_run(Circuit* circuit, int64_t duration) {
    const auto started = std::chrono::steady_clock::now();
    circuit->run(duration);
    ref_run_nanoseconds += std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now() - started).count();
    ++ref_run_calls;
}

static int64_t reference_run_time(Circuit* circuit) {
    uint64_t target = ref_deadline + 1000000000ull; // 1 ms maximum slice.
    if(ref_next_event < ref_events.size()) target = std::min(target, ref_events[ref_next_event].time);
    ref_deadline = target;
    return target > circuit->global_time ? target - circuit->global_time : 1;
}

static bool reference_step(Circuit*& circuit, Settings& settings, Input& input, Video& video, const std::function<void()>& resize) {
    if(!circuit) return true;
    ref_started = true;
    reference_state(circuit);
    while(ref_next_event < ref_events.size() && ref_events[ref_next_event].time <= circuit->global_time) {
        ReferenceEvent event = ref_events[ref_next_event++];
        ref_inputs << event.time << ',' << circuit->global_time << ',' << event.action << ',' << event.value << '\n';
        if(ref_registered && event.action != "recreate") {
            const std::string& a = event.action;
            if(a == "coin") ref_coin = event.value;
            else if(a == "start") ref_start = event.value;
            else if(a == "start2") ref_start2 = event.value;
            else if(a.compare(0, 6, "paddle") == 0) ref_axes[a.back() - '1'] = event.value;
            else if(a.compare(0, 6, "button") == 0) ref_buttons[a[6] - '1'][a[7] - '1'] = event.value;
            else if(a.compare(0, 2, "up") == 0) ref_directions[a.back() - '1'][0] = event.value;
            else if(a.compare(0, 4, "down") == 0) ref_directions[a.back() - '1'][1] = event.value;
            else if(a.compare(0, 4, "left") == 0) ref_left_right[a.back() - '1'][0] = event.value;
            else if(a.compare(0, 5, "right") == 0) ref_left_right[a.back() - '1'][1] = event.value;
            else throw std::runtime_error("Unknown replay action");
            continue;
        }
        if(event.action == "coin") ref_coin = event.value;
        else if(event.action == "start") ref_start = event.value;
        else if(event.action == "start2") ref_start2 = event.value;
        else if(event.action == "serve") ref_serve = event.value;
        else if(event.action.size() == 7 && event.action.substr(0, 6) == "paddle" && event.action[6] >= '1' && event.action[6] <= '4') ref_axes[event.action[6] - '1'] = event.value;
        else if(event.action == "up1") ref_directions[0][0] = event.value;
        else if(event.action == "down1") ref_directions[0][1] = event.value;
        else if(event.action == "up2") ref_directions[1][0] = event.value;
        else if(event.action == "down2") ref_directions[1][1] = event.value;
        else if(event.action == "throttle") { ref_axes[0] = event.value; settings.input.throttle[0].key = KeyAssignment(KeyAssignment::JOYSTICK_AXIS, 1, 0); }
        else if(event.action == "throttlekey") { ref_throttle_key = event.value; settings.input.throttle[0].key = KeyAssignment(KeyAssignment::KEYBOARD, 250, 0); }
        else if(event.action == "dollar") ref_coins[4] = event.value;
        else if(event.action.substr(0, 4) == "coin" && event.action.size() == 5) ref_coins[event.action[4] - '1'] = event.value;
        else if(event.action.substr(0, 3) == "gas" && event.action.size() == 4) ref_gas[event.action[3] - '1'] = event.value;
        else if(event.action.substr(0, 5) == "brake" && event.action.size() == 6) ref_brake[event.action[5] - '1'] = event.value;
        else if(event.action.substr(0, 5) == "wheel" && event.action.size() == 6) {
            const unsigned p = event.action[5] - '1'; ref_axes[p] = event.value;
            settings.input.wheel[p].left = KeyAssignment(KeyAssignment::JOYSTICK_AXIS, 0, p); settings.input.wheel[p].right = KeyAssignment(KeyAssignment::JOYSTICK_AXIS, 1, p);
        }
        else if(event.action.substr(0, 4) == "left" || event.action.substr(0, 5) == "right") {
            const unsigned p = event.action.back() - '1'; ref_wheel_keys[p][event.action[0] == 'l' ? 0 : 1] = event.value;
            settings.input.wheel[p].left = KeyAssignment(KeyAssignment::KEYBOARD, 270 + 2 * p, 0); settings.input.wheel[p].right = KeyAssignment(KeyAssignment::KEYBOARD, 271 + 2 * p, 0);
        }
        else if(event.action == "recreate") {
            if(ref_epoch + 1 == ref_epochs) {
                reference_close_epoch();
                Application::quit();
                return false;
            }
            reference_retained_state(settings, "before-destruction");
            reference_close_epoch();
            reference_clear_registries();
            delete circuit;
            circuit = nullptr;
            ++ref_epoch;
            reference_open_epoch();
            // Same circuit construction operation used by the original New Game action.
            const CircuitDesc* desc = nullptr;
            if(ref_registered) for(const GameDesc& g : game_list) if(ref_game == g.command_line) desc = g.desc;
            if(!desc) desc = ref_game == "pong" ? circuit_pong()
                : ref_game == "pongdoubles" ? circuit_pongdoubles()
                : ref_game == "breakout" ? circuit_breakout()
                : ref_game == "stuntcycle" ? circuit_stuntcycle()
                : ref_game == "indy4" ? circuit_indy4() : circuit_spacerace();
            // Preserve original static analog/wheel descriptors, ROM cache and
            // Settings input assignments, exactly as the original New Game does.
            circuit = reference_construct(settings, input, video, desc, ref_game.c_str());
            resize();
            return true;
        } else throw std::runtime_error("Unknown replay action");
    }
    return true;
}
