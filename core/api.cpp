// SPDX-License-Identifier: GPL-3.0-or-later
#include "nocpu.h"
#include "port_hooks.h"
#include "circuit.h"
#include "circuit_desc.h"
#include <algorithm>
#include <cstdlib>
#include <map>
#include <memory>
#include <string>
#include <vector>

extern const CircuitDesc* circuit_pong();
extern void nocpu_reset_pong_descriptors();
namespace {
constexpr size_t AUDIO_LIMIT=96000; // two seconds; consumers normally drain every tick.
constexpr size_t COLLISION_LIMIT=4096;
struct Engine {
    Settings settings;
    Input input;
    Video video;
    std::unique_ptr<Circuit> circuit;
    std::map<std::string,Chip*> chips;
    Chip* hit=nullptr;
    uint64_t deadline=0,frame_time=0;
    uint32_t frames=0,hits=0,audio_overruns=0;
    std::vector<int16_t> pcm;
    std::vector<uint32_t> collisions;
};
std::unique_ptr<Engine> engine;
NoCPUFrameHook frame_hook=nullptr;
NoCPUHitHook hit_hook=nullptr;
int pin(const std::string& name) {
    if(!engine) return 0;
    auto it=engine->chips.find(name);
    return it==engine->chips.end()?0:it->second->output;
}
uint64_t now() {return engine&&engine->circuit?engine->circuit->global_time:0;}
}
void nocpu_set_hooks(NoCPUFrameHook frame,NoCPUHitHook hit){frame_hook=frame;hit_hook=hit;}
void nocpu_register_chip(const char* name,unsigned output_pin,Chip* chip) {
    if(!engine) return;
    auto key=std::string(name)+"."+std::to_string(output_pin);
    engine->chips[key]=chip;
    if(key=="B2.8")engine->hit=chip;
}
NoCPUOutputObservation::NoCPUOutputObservation(Chip* value):chip(value),previous(value->output){}
NoCPUOutputObservation::~NoCPUOutputObservation(){
    if(!engine||chip!=engine->hit||chip->output==previous)return;
    uint64_t time=chip->circuit->global_time;
    if(chip->output)++engine->hits;
    if(engine->collisions.size()/3<COLLISION_LIMIT) {
        engine->collisions.push_back(uint32_t(time));
        engine->collisions.push_back(uint32_t(time>>32));
        engine->collisions.push_back(uint32_t(chip->output));
    }
    if(hit_hook)hit_hook(time,chip->output);
}
void nocpu_capture_frame(uint64_t time){
    if(!engine)return;
    engine->frame_time=time;
    ++engine->frames;
    if(frame_hook)frame_hook(time);
}
void nocpu_capture_audio(uint64_t,int16_t sample){
    if(!engine)return;
    if(engine->pcm.size()==AUDIO_LIMIT) {
        // Fail visibly rather than retaining unlimited audio in a forgotten drain.
        ++engine->audio_overruns;
        return;
    }
    engine->pcm.push_back(sample);
}
extern "C" {
uint32_t nocpu_abi_version(){return 1;}
uint32_t nocpu_create(uint32_t seed){
    if(engine)return 0;
    try {
        std::srand(seed);
        nocpu_reset_pong_descriptors();
        engine.reset(new Engine);
        engine->pcm.reserve(8192);
        engine->circuit.reset(new Circuit(engine->settings,engine->input,engine->video,circuit_pong(),"pong"));
        engine->video.video_init(Video::WIDTH,Video::HEIGHT,engine->settings.video);
        return 1;
    } catch(...) {engine.reset();return 0;}
}
void nocpu_destroy(){engine.reset();}
uint32_t nocpu_reset(uint32_t seed){nocpu_destroy();return nocpu_create(seed);}
void nocpu_coin(uint32_t held){if(engine)engine->input.coin=held!=0;}
void nocpu_paddle(uint32_t slot,int32_t axis){if(engine&&slot<2)engine->input.axes[slot]=int16_t(std::max(-32768,std::min(32767,axis)));}
uint32_t nocpu_advance(uint32_t microseconds){
    if(!engine||microseconds>100000)return 0;
    const uint64_t duration=uint64_t(microseconds)*1000000ULL;
    if(duration>UINT64_MAX-engine->deadline)return 0;
    uint64_t target=engine->deadline+duration;
    while(engine->deadline<target){
        uint64_t next=std::min<uint64_t>(target,engine->deadline+1000000000ULL);
        engine->circuit->run(next>now()?int64_t(next-now()):1);
        engine->deadline=next;
    }
    return 1;
}
const uint8_t* nocpu_frame(){return engine?engine->video.pixels():nullptr;}
uint32_t nocpu_width(){return Video::WIDTH;}
uint32_t nocpu_height(){return Video::HEIGHT;}
uint32_t nocpu_frame_number(){return engine?engine->frames:0;}
uint32_t nocpu_frame_time_lo(){return engine?uint32_t(engine->frame_time):0;}
uint32_t nocpu_frame_time_hi(){return engine?uint32_t(engine->frame_time>>32):0;}
const int16_t* nocpu_audio(){return engine&&!engine->pcm.empty()?engine->pcm.data():nullptr;}
uint32_t nocpu_audio_count(){return engine?uint32_t(engine->pcm.size()):0;}
void nocpu_audio_clear(){if(engine)engine->pcm.clear();}
uint32_t nocpu_sample_rate(){return 48000;}
uint32_t nocpu_audio_overruns(){return engine?engine->audio_overruns:0;}
uint32_t nocpu_score(uint32_t slot){
    if(slot>1)return 0;
    const std::string name=slot==0?"C7":"D7";
    return pin(name+".12")+2*pin(name+".9")+4*pin(name+".8")+8*pin(name+".11")+10*pin(slot==0?"C8.3":"C8.5");
}
uint32_t nocpu_hits(){return engine?engine->hits:0;}
uint32_t nocpu_run_n(){return pin("LATCH.3");}
uint32_t nocpu_attract_n(){return pin("D2.1");}
uint32_t nocpu_time_lo(){return uint32_t(now());}
uint32_t nocpu_time_hi(){return uint32_t(now()>>32);}
const uint32_t* nocpu_collisions(){return engine&&!engine->collisions.empty()?engine->collisions.data():nullptr;}
uint32_t nocpu_collision_count(){return engine?uint32_t(engine->collisions.size()/3):0;}
void nocpu_collisions_clear(){if(engine)engine->collisions.clear();}
}
