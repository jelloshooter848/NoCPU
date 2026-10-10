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
#include <sys/stat.h>

struct ReferenceEvent { uint64_t time; std::string action; int value; };
static std::vector<ReferenceEvent> ref_events;
static std::map<std::string, Chip*> ref_chips;
static Chip* ref_hit = nullptr;
static unsigned ref_epoch = 0, ref_next_event = 0, ref_snapshot = 0;
static uint64_t ref_deadline = 0, ref_hits = 0;
static bool ref_coin = false, ref_started = false;
static int16_t ref_axes[2] = {0, 0};
static std::string ref_output;
static std::ofstream ref_pcm, ref_frames, ref_video, ref_telemetry, ref_inputs, ref_collisions, ref_gl_errors;
static uint64_t ref_frame_number = 0;

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
    if(!ref_pcm || !ref_frames || !ref_video || !ref_telemetry || !ref_inputs || !ref_collisions || !ref_gl_errors)
        throw std::runtime_error("Cannot open reference artifacts");
    ref_frames << "frame,time_ps,fnv1a64\n";
    ref_telemetry << "time_ps,score1,score2,run_n,attract_n,hits\n";
    ref_inputs << "requested_ps,applied_ps,action,value\n";
    ref_collisions << "time_ps,hit_output\n";
    ref_gl_errors << "time_ps,preexisting_gl_error\n";
    ref_next_event = ref_snapshot = 0;
    ref_frame_number = ref_hits = 0;
    ref_deadline = 0;
    ref_coin = false;
    ref_axes[0] = ref_axes[1] = 0;
}

static void reference_close_epoch() {
    ref_pcm.close(); ref_frames.close(); ref_video.close();
    ref_telemetry.close(); ref_inputs.close(); ref_collisions.close();
    ref_gl_errors.close();
}

unsigned reference_initialize(Settings& settings) {
    const char* out = getenv("NOCPU_REFERENCE_OUTPUT");
    const char* replay = getenv("NOCPU_REFERENCE_REPLAY");
    const char* seed = getenv("NOCPU_REFERENCE_SEED");
    if(!out || !replay || !seed) throw std::runtime_error("Reference environment missing");
    ref_output = out;
    std::ifstream input(replay);
    if(!input) throw std::runtime_error("Cannot open replay");
    std::string line;
    while(std::getline(input, line)) {
        if(line.empty() || line[0] == '#') continue;
        std::istringstream row(line);
        uint64_t ms; ReferenceEvent event;
        if(!(row >> ms >> event.action >> event.value)) throw std::runtime_error("Invalid replay row");
        event.time = ms * 1000000000ull;
        if(!ref_events.empty() && event.time < ref_events.back().time)
            throw std::runtime_error("Replay times are not sorted");
        ref_events.push_back(event);
    }
    settings.throttle = false;
    settings.pause = false;
    settings.audio.frequency = Settings::Audio::FREQ_48000;
    settings.audio.volume = 500; // Historical Settings default, avoiding forced clipping.
    settings.audio.mute = false;
    settings.video.vsync = false;
    settings.video.multisampling = Settings::Video::NONE;
    settings.input.coin_start.coin1 = KeyAssignment(KeyAssignment::KEYBOARD, 200, 0);
    for(unsigned p = 0; p < 2; ++p) {
        auto& paddle = settings.input.paddle[p];
        paddle.use_mouse = paddle.use_keyboard = false;
        paddle.use_joystick = true;
        paddle.joystick_mode = Settings::Input::JOYSTICK_ABSOLUTE;
        paddle.joystick_sensitivity = 0;
        paddle.joy_y_axis = {p, 1};
    }
    reference_open_epoch();
    return static_cast<unsigned>(std::stoul(seed));
}

void reference_register_chip(const char* name, unsigned pin, Chip* chip) {
    std::string key = std::string(name) + "." + std::to_string(pin);
    ref_chips[key] = chip;
    if(key == "B2.8") ref_hit = chip; // Pong HIT, games/pong.cpp.
}

bool reference_key(unsigned scancode) { return scancode == 200 && ref_coin; }
int16_t reference_axis(unsigned joystick, unsigned axis) {
    return joystick < 2 && axis == 1 ? ref_axes[joystick] : 0;
}

ReferenceObserver::ReferenceObserver(Chip* c) : chip(c == ref_hit ? c : nullptr), previous(chip ? chip->output : 0) {}
ReferenceObserver::~ReferenceObserver() {
    if(chip && chip->output != previous && ref_started) {
        ref_collisions << chip->circuit->global_time << ',' << chip->output << '\n';
        if(chip->output) ++ref_hits;
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

static void reference_state(Circuit* circuit) {
    ref_telemetry << circuit->global_time << ',' << reference_score("C7", "C8.3") << ','
                  << reference_score("D7", "C8.5") << ',' << reference_pin("LATCH.3") << ','
                  << reference_pin("D2.1") << ',' << ref_hits << '\n';
}

void reference_sample(uint64_t time, int16_t sample) {
    (void)time;
    const unsigned char bytes[] = {static_cast<unsigned char>(sample & 255),
                                   static_cast<unsigned char>((static_cast<uint16_t>(sample) >> 8) & 255)};
    ref_pcm.write(reinterpret_cast<const char*>(bytes), sizeof(bytes));
}

void reference_frame(uint64_t time) {
    // The historical renderer can leave an error while its initial scan bounds
    // are still zero. Attribute failures only to this adapter's read operations.
    for(GLenum error = glGetError(); error != GL_NO_ERROR; error = glGetError())
        ref_gl_errors << time << ',' << error << '\n';
    GLint viewport[4]; glGetIntegerv(GL_VIEWPORT, viewport);
    if(viewport[2] <= 0 || viewport[3] <= 0) return;
    const int width = viewport[2], height = viewport[3];
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
    static const uint64_t snapshots[] = {250, 1000, 2000, 3000, 6000, 13000, 15000};
    if(ref_snapshot < sizeof(snapshots)/sizeof(snapshots[0]) && time >= snapshots[ref_snapshot] * 1000000000ull) {
        std::string path = ref_output + "/epoch" + std::to_string(ref_epoch) + "/" + std::to_string(snapshots[ref_snapshot++]) + "ms.ppm";
        std::ofstream image(path, std::ios::binary);
        image << "P6\n" << width << ' ' << height << "\n255\n";
        for(int y = height - 1; y >= 0; --y)
            image.write(reinterpret_cast<const char*>(&pixels[y * width * 3]), width * 3);
    }
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
        else if(event.action == "paddle1") ref_axes[0] = event.value;
        else if(event.action == "paddle2") ref_axes[1] = event.value;
        else if(event.action == "recreate") {
            if(ref_epoch == 1) {
                reference_close_epoch();
                Application::quit();
                return false;
            }
            reference_close_epoch();
            delete circuit;
            circuit = nullptr;
            ref_chips.clear(); ref_hit = nullptr; ref_started = false;
            ++ref_epoch;
            reference_open_epoch();
            // Same circuit construction operation used by the original New Game action.
            circuit = new Circuit(settings, input, video, circuit_pong(), "pong");
            resize();
            return true;
        } else throw std::runtime_error("Unknown replay action");
    }
    return true;
}
