// SPDX-License-Identifier: GPL-3.0-or-later
// Included by the native main.cpp only in an ignored reference build.
#include "reference_api.h"
#include <fstream>
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

struct ReferenceEvent { uint64_t time; std::string action; int value; };
static std::vector<ReferenceEvent> ref_events;
static std::map<std::string, Chip*> ref_chips;
static Chip* ref_hit = nullptr;
static unsigned ref_epoch = 0, ref_next_event = 0, ref_snapshot = 0;
static uint64_t ref_deadline = 0, ref_hits = 0;
static bool ref_coin = false, ref_started = false;
static bool ref_start2 = false, ref_serve = false;
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
    ref_telemetry << "time_ps,score1,score2,run_n,attract_n,hits" << (ref_game == "pong" ? "\n" : ",active\n");
    ref_inputs << "requested_ps,applied_ps,action,value\n";
    ref_collisions << "time_ps,hit_output\n";
    ref_gl_errors << "time_ps,preexisting_gl_error\n";
    ref_transition_events << "time_ps,signal,value\n";
    if(ref_game == "pongdoubles") ref_hardware << "time_ps,paddle1_r,paddle2_r,paddle3_r,paddle4_r,C3_9,H10_5,H10_6,B2_5,J1_9,F1_12,F1_8\n";
    else if(ref_game == "spacerace") ref_hardware << "time_ps,stick1_up_n,stick1_down_n,stick2_up_n,stick2_down_n,game_on,latch,C9_r,rocket1_counter,rocket2_counter\n";
    else if(ref_game == "breakout") ref_hardware << "time_ps,paddle_r,coin1_n,start1_n,start2_n,serve_n,attract,attract_n,q,q_n,serve_wait,player2,balls,brick_hit,bp_hit_n,vb_hit_n\n";
    else ref_hardware << "time_ps\n";
    ref_geometry << "frame,time_ps,x,y,width,height,client_width,client_height,scanline_time,v_size,orientation,contrast,p0,p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12,p13,p14,p15\n";
    ref_next_event = ref_snapshot = 0;
    ref_frame_number = ref_hits = 0;
    ref_deadline = 0;
    ref_coin = ref_start = ref_start2 = ref_serve = false;
    for(unsigned p = 0; p < 4; ++p) ref_axes[p] = 0;
    for(unsigned p = 0; p < 2; ++p) ref_directions[p][0] = ref_directions[p][1] = false;
}

static void reference_close_epoch() {
    if(!ref_pcm || !ref_frames || !ref_video || !ref_telemetry || !ref_inputs || !ref_collisions || !ref_gl_errors || !ref_transition_events || !ref_hardware || !ref_geometry)
        throw std::runtime_error("Original reference evidence write failed");
    ref_pcm.close(); ref_frames.close(); ref_video.close();
    ref_telemetry.close(); ref_inputs.close(); ref_collisions.close();
    ref_gl_errors.close();
    ref_transition_events.close();
    ref_hardware.close(); ref_geometry.close();
    std::ofstream performance(ref_output + "/step-observation.json");
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
    if(ref_game != "pong" && ref_game != "pongdoubles" && ref_game != "spacerace" && ref_game != "breakout")
        throw std::runtime_error("Unsupported reference game");
    if(const char* epochs = getenv("NOCPU_REFERENCE_EPOCHS")) ref_epochs = std::stoul(epochs);
    if(!ref_epochs || ref_epochs > 2) throw std::runtime_error("Unsupported reference epoch count");
    if(const char* dip = getenv("NOCPU_REFERENCE_DIP")) ref_dip = std::stoi(dip);
    if(const char* pot = getenv("NOCPU_REFERENCE_POT_OHMS")) ref_pot = std::stoul(pot);
    if(ref_game == "breakout") {
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
        const bool paddle = event.action.size() == 7 && event.action.substr(0, 6) == "paddle"
            && event.action[6] >= '1' && event.action[6] <= (ref_game == "pongdoubles" ? '4' : ref_game == "breakout" ? '1' : '2') && ref_game != "spacerace";
        const bool digital = ref_game == "spacerace" && (event.action == "up1" || event.action == "down1" || event.action == "up2" || event.action == "down2");
        if(!paddle && !digital && event.action != "coin" && event.action != "recreate" && !(event.action == "start" && ref_game != "pong") && !(ref_game == "breakout" && (event.action == "start2" || event.action == "serve")))
            throw std::runtime_error("Replay action is not a physical input of the selected game");
        if((paddle && (event.value < -32768 || event.value > 32767)) || (!paddle && event.value != 0 && event.value != 1))
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
    }
    reference_open_epoch();
    return static_cast<unsigned>(std::stoul(seed));
}

void reference_configure(const CircuitDesc* desc, const char* name) {
    // The original UI may inspect configuration for other library entries.
    if(ref_game != name) return;
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
        std::ofstream config(ref_output + "/configuration.json");
        config << "{\"game\":\"breakout\",\"dip\":" << packed << ",\"pot_ohms\":0}\n";
        std::ofstream switches(ref_output + "/breakout-switches.json");
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
        std::ofstream config(ref_output + "/configuration.json");
        config << "{\"game\":\"" << ref_game << "\",\"dip\":" << ref_dip << ",\"pot_ohms\":" << ref_pot << "}\n";
        if(!config) throw std::runtime_error("Cannot record original configuration");
    }
}

void reference_register_chip(const char* name, unsigned pin, Chip* chip) {
    std::string key = std::string(name) + "." + std::to_string(pin);
    ref_chips[key] = chip;
    if((ref_game == "pong" && key == "B2.8") || (ref_game == "pongdoubles" && key == "B3.8")) {
        ref_hit = chip; ref_event_chips[chip] = 0;
    } else if(ref_game == "breakout") {
        static const char* keys[] = {"E6.5", "A5.8", "A5.6", "A3.9", "B4.14", "E6.9"};
        for(unsigned signal = 0; signal < 6; ++signal) if(key == keys[signal]) ref_event_chips[chip] = signal + 100;
    } else if(ref_game == "spacerace") {
        static const char* keys[] = {"D5.8", "D5.10", "H2.8", "K2.8"};
        for(unsigned signal = 0; signal < 4; ++signal) if(key == keys[signal]) ref_event_chips[chip] = signal + 1;
    }
}

bool reference_key(unsigned scancode) {
    if(scancode == 200) return ref_coin;
    if(scancode == 201) return ref_start;
    if(scancode == 207) return ref_start2;
    if(scancode == 208) return ref_serve;
    if(scancode >= 202 && scancode <= 205) return ref_directions[(scancode - 202) / 2][(scancode - 202) % 2];
    return false;
}
int16_t reference_axis(unsigned joystick, unsigned axis) {
    return joystick < 4 && axis == (ref_game == "breakout" ? 0u : 1u) ? ref_axes[joystick] : 0;
}

ReferenceObserver::ReferenceObserver(Chip* c) : chip(ref_event_chips.count(c) ? c : nullptr), previous(chip ? chip->output : 0), signal(chip ? ref_event_chips.at(chip) : -1) {}
ReferenceObserver::~ReferenceObserver() {
    if(chip && chip->output != previous && ref_started) {
        ref_transition_events << chip->circuit->global_time << ',' << signal << ',' << chip->output << '\n';
        if(signal == 0) {
            ref_collisions << chip->circuit->global_time << ',' << chip->output << '\n';
            if(chip->output) ++ref_hits;
        }
    }
}

static int reference_pin(const char* name) {
    auto found = ref_chips.find(name);
    if(found == ref_chips.end()) throw std::runtime_error(std::string("Missing signal ") + name);
    return found->second->output;
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

static void reference_state(Circuit* circuit) {
    if(ref_game == "pong") {
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
    ref_hardware << '\n';
}

void reference_sample(uint64_t time, int16_t sample) {
    (void)time;
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

static Circuit* reference_construct(const Settings& settings, Input& input, Video& video, const CircuitDesc* desc, const char* name) {
    rusage before_usage, after_usage;
    if(getrusage(RUSAGE_SELF, &before_usage)) throw std::runtime_error("Cannot observe constructor resource state");
    const auto started = std::chrono::steady_clock::now();
    Circuit* result = new Circuit(settings, input, video, desc, name);
    const auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now() - started).count();
    if(getrusage(RUSAGE_SELF, &after_usage)) throw std::runtime_error("Cannot observe constructor resources");
    const auto microseconds = [](const timeval& value) { return uint64_t(value.tv_sec) * 1000000 + value.tv_usec; };
    std::ofstream observation(ref_output + "/constructor-observation.json");
    observation << "{\"wall_nanoseconds\":" << duration << ",\"user_cpu_microseconds\":"
                << microseconds(after_usage.ru_utime) - microseconds(before_usage.ru_utime)
                << ",\"system_cpu_microseconds\":" << microseconds(after_usage.ru_stime) - microseconds(before_usage.ru_stime)
                << ",\"process_maxrss_kib_at_return\":" << after_usage.ru_maxrss
                << ",\"scope\":\"original Circuit constructor; process high-water RSS includes prior Qt startup\"}\n";
    if(!observation) throw std::runtime_error("Cannot retain original constructor observation");
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
        if(event.action == "coin") ref_coin = event.value;
        else if(event.action == "start") ref_start = event.value;
        else if(event.action == "start2") ref_start2 = event.value;
        else if(event.action == "serve") ref_serve = event.value;
        else if(event.action.size() == 7 && event.action.substr(0, 6) == "paddle" && event.action[6] >= '1' && event.action[6] <= '4') ref_axes[event.action[6] - '1'] = event.value;
        else if(event.action == "up1") ref_directions[0][0] = event.value;
        else if(event.action == "down1") ref_directions[0][1] = event.value;
        else if(event.action == "up2") ref_directions[1][0] = event.value;
        else if(event.action == "down2") ref_directions[1][1] = event.value;
        else if(event.action == "recreate") {
            if(ref_epoch + 1 == ref_epochs) {
                reference_close_epoch();
                Application::quit();
                return false;
            }
            reference_close_epoch();
            delete circuit;
            circuit = nullptr;
            ref_chips.clear(); ref_event_chips.clear(); ref_hit = nullptr; ref_started = false;
            ++ref_epoch;
            reference_open_epoch();
            // Same circuit construction operation used by the original New Game action.
            const CircuitDesc* desc = ref_game == "pong" ? circuit_pong() : ref_game == "pongdoubles" ? circuit_pongdoubles() : ref_game == "breakout" ? circuit_breakout() : circuit_spacerace();
            circuit = new Circuit(settings, input, video, desc, ref_game.c_str());
            resize();
            return true;
        } else throw std::runtime_error("Unknown replay action");
    }
    return true;
}
