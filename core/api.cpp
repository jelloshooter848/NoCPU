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
extern const CircuitDesc* circuit_pongdoubles();
extern const CircuitDesc* circuit_spacerace();
extern const CircuitDesc* circuit_breakout();
extern void nocpu_reset_pong_descriptors();
extern void nocpu_reset_pongdoubles_descriptors();
extern void nocpu_reset_spacerace_descriptors();
extern void nocpu_reset_breakout_descriptors();
extern void nocpu_configure_pong(unsigned);
extern void nocpu_configure_pongdoubles(unsigned);
extern void nocpu_configure_spacerace(unsigned,unsigned);
extern void nocpu_configure_breakout(unsigned);
namespace {
constexpr size_t AUDIO_LIMIT=96000; // two seconds; consumers normally drain every tick.
constexpr size_t COLLISION_LIMIT=4096;
constexpr size_t EVENT_LIMIT=4096;
struct Engine {
    Settings settings;
    Input input;
    Video video;
    std::unique_ptr<Circuit> circuit;
    std::map<std::string,Chip*> chips;
    Chip* hit=nullptr;
    Chip* observed[11]={};
    uint32_t game=NOCPU_PONG,dip=0,pot_ohms=0,crashes[2]={0,0};
    uint32_t breakout_counts[3]={0,0,0};
    uint64_t deadline=0,frame_time=0;
    uint32_t frames=0,hits=0,audio_overruns=0,event_overruns=0;
    std::vector<int16_t> pcm;
    std::vector<uint32_t> collisions;
    std::vector<uint32_t> events;
};
std::unique_ptr<Engine> engine;
NoCPUFrameHook frame_hook=nullptr;
NoCPUHitHook hit_hook=nullptr;
NoCPUEventHook event_hook=nullptr;
int pin(const std::string& name) {
    if(!engine) return 0;
    auto it=engine->chips.find(name);
    return it==engine->chips.end()?0:it->second->output;
}
uint64_t now() {return engine&&engine->circuit?engine->circuit->global_time:0;}
bool valid_options(uint32_t game,uint32_t dip,uint32_t pot) {
    if(game==NOCPU_BREAKOUT)return pot==0&&(dip&~127u)==0&&(dip&15u)<=8;
    if(game>NOCPU_SPACE_RACE||dip>1)return false;
    return game==NOCPU_SPACE_RACE?pot>=470000&&pot<=1470000:pot==0;
}
uint32_t bcd(const std::string& name) {
    return pin(name+".12")+2*pin(name+".9")+4*pin(name+".8")+8*pin(name+".11");
}
uint32_t bcd9310(const std::string& name) {
    return pin(name+".14")+2*pin(name+".13")+4*pin(name+".12")+8*pin(name+".11");
}
}
void nocpu_set_hooks(NoCPUFrameHook frame,NoCPUHitHook hit){frame_hook=frame;hit_hook=hit;}
void nocpu_set_event_hook(NoCPUEventHook event){event_hook=event;}
void nocpu_register_chip(const char* name,unsigned output_pin,Chip* chip) {
    if(!engine) return;
    auto key=std::string(name)+"."+std::to_string(output_pin);
    engine->chips[key]=chip;
    if(engine->game==NOCPU_PONG&&key=="B2.8")engine->hit=engine->observed[NOCPU_HIT]=chip;
    else if(engine->game==NOCPU_PONG_DOUBLES&&key=="B3.8")engine->hit=engine->observed[NOCPU_HIT]=chip;
    else if(engine->game==NOCPU_SPACE_RACE) {
        const char* keys[]={"D5.8","D5.10","H2.8","K2.8"};
        for(unsigned i=0;i<4;++i)if(key==keys[i])engine->observed[i+1]=chip;
    } else if(engine->game==NOCPU_BREAKOUT) {
        const char* keys[]={"E6.5","A5.8","A5.6","A3.9","B4.14","E6.9"};
        for(unsigned i=0;i<6;++i)if(key==keys[i])engine->observed[NOCPU_BRICK_HIT+i]=chip;
    }
}
NoCPUOutputObservation::NoCPUOutputObservation(Chip* value):chip(value),previous(value->output){}
NoCPUOutputObservation::~NoCPUOutputObservation(){
    if(!engine||chip->output==previous)return;
    uint64_t time=chip->circuit->global_time;
    if(chip==engine->hit) {
        if(chip->output)++engine->hits;
        if(engine->collisions.size()/3<COLLISION_LIMIT) {
            engine->collisions.push_back(uint32_t(time));
            engine->collisions.push_back(uint32_t(time>>32));
            engine->collisions.push_back(uint32_t(chip->output));
        }
        if(hit_hook)hit_hook(time,chip->output);
    }
    // Generic events begin after circuit construction, matching the original
    // reference observer's active capture boundary. Legacy Pong HIT capture
    // above retains its established behavior exactly.
    if(!engine->circuit)return;
    for(unsigned signal=0;signal<11;++signal)if(chip==engine->observed[signal]) {
        if((signal==NOCPU_CRASH1_N||signal==NOCPU_CRASH2_N)&&!chip->output)
            ++engine->crashes[signal-NOCPU_CRASH1_N];
        if(signal>=NOCPU_BRICK_HIT&&signal<=NOCPU_VB_HIT_N&&((signal==NOCPU_BRICK_HIT&&chip->output)
           ||(signal!=NOCPU_BRICK_HIT&&!chip->output)))
            ++engine->breakout_counts[signal-NOCPU_BRICK_HIT];
        if(engine->events.size()/4<EVENT_LIMIT) {
            engine->events.push_back(uint32_t(time));
            engine->events.push_back(uint32_t(time>>32));
            engine->events.push_back(signal);
            engine->events.push_back(uint32_t(chip->output));
        } else ++engine->event_overruns;
        if(event_hook)event_hook(time,signal,chip->output);
        break;
    }
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
uint32_t nocpu_abi_version(){return 3;}
uint32_t nocpu_create_game(uint32_t game,uint32_t seed,uint32_t dip,uint32_t pot_ohms){
    if(engine||!valid_options(game,dip,pot_ohms))return 0;
    try {
        std::srand(seed);
        // Each selected machine starts with cold original custom descriptors.
        // The original Space Race potentiometer updates C9 in its initial
        // custom-update callback and subsequent 250 ms polls. Configuration
        // changes current_val; the original chip still performs the C9.r write.
        const CircuitDesc* desc=nullptr;const char* name=nullptr;
        if(game==NOCPU_PONG) {
            nocpu_reset_pong_descriptors();nocpu_configure_pong(dip);
            desc=circuit_pong();name="pong";
        } else if(game==NOCPU_PONG_DOUBLES) {
            nocpu_reset_pongdoubles_descriptors();nocpu_configure_pongdoubles(dip);
            desc=circuit_pongdoubles();name="pongdoubles";
        } else if(game==NOCPU_SPACE_RACE) {
            nocpu_reset_spacerace_descriptors();nocpu_configure_spacerace(dip,pot_ohms);
            desc=circuit_spacerace();name="spacerace";
        } else {
            nocpu_reset_breakout_descriptors();nocpu_configure_breakout(dip);
            desc=circuit_breakout();name="breakout";
        }
        engine.reset(new Engine);
        engine->game=game;engine->dip=dip;engine->pot_ohms=pot_ohms;
        engine->pcm.reserve(8192);
        engine->events.reserve(1024);
        engine->circuit.reset(new Circuit(engine->settings,engine->input,engine->video,desc,name));
        // The accepted original Qt reference client is 632x432. Original
        // keep-aspect cropping gives 576x432 landscape or 324x432 portrait.
        engine->video.video_init(632,432,engine->settings.video);
        return 1;
    } catch(...) {engine.reset();return 0;}
}
uint32_t nocpu_create(uint32_t seed){return nocpu_create_game(NOCPU_PONG,seed,0,0);}
void nocpu_destroy(){engine.reset();}
uint32_t nocpu_reset(uint32_t seed){
    if(!engine)return 0;
    return nocpu_reset_config(seed,engine->dip,engine->pot_ohms);
}
uint32_t nocpu_reset_config(uint32_t seed,uint32_t dip,uint32_t pot_ohms){
    if(!engine||!valid_options(engine->game,dip,pot_ohms))return 0;
    uint32_t game=engine->game;nocpu_destroy();return nocpu_create_game(game,seed,dip,pot_ohms);
}
uint32_t nocpu_game(){return engine?engine->game:UINT32_MAX;}
uint32_t nocpu_dip(){return engine?engine->dip:0;}
uint32_t nocpu_pot_ohms(){return engine?engine->pot_ohms:0;}
void nocpu_coin(uint32_t held){if(engine)engine->input.coin=held!=0;}
void nocpu_start(uint32_t held){nocpu_start_player(1,held);}
uint32_t nocpu_start_player(uint32_t player,uint32_t held){
    if(!engine||engine->game==NOCPU_PONG||player<1||player>2
       ||(player==2&&engine->game!=NOCPU_BREAKOUT))return 0;
    if(player==1)engine->input.start=held!=0;
    else engine->input.start2=held!=0;
    return 1;
}
uint32_t nocpu_serve(uint32_t held){
    if(!engine||engine->game!=NOCPU_BREAKOUT)return 0;
    engine->input.serve=held!=0;return 1;
}
void nocpu_paddle(uint32_t slot,int32_t axis){
    if(engine&&engine->game!=NOCPU_SPACE_RACE
       &&slot<(engine->game==NOCPU_PONG?2u:engine->game==NOCPU_BREAKOUT?1u:4u))
        engine->input.axes[slot]=int16_t(std::max(-32768,std::min(32767,axis)));
}
void nocpu_joystick(uint32_t slot,uint32_t up_held,uint32_t down_held){
    if(engine&&engine->game==NOCPU_SPACE_RACE&&slot<2) {
        engine->input.up[slot]=up_held!=0;engine->input.down[slot]=down_held!=0;
    }
}
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
uint32_t nocpu_width(){return engine?engine->video.pixel_width():Video::WIDTH;}
uint32_t nocpu_height(){return engine?engine->video.pixel_height():Video::HEIGHT;}
uint32_t nocpu_frame_number(){return engine?engine->frames:0;}
uint32_t nocpu_frame_time_lo(){return engine?uint32_t(engine->frame_time):0;}
uint32_t nocpu_frame_time_hi(){return engine?uint32_t(engine->frame_time>>32):0;}
const int16_t* nocpu_audio(){return engine&&!engine->pcm.empty()?engine->pcm.data():nullptr;}
uint32_t nocpu_audio_count(){return engine?uint32_t(engine->pcm.size()):0;}
void nocpu_audio_clear(){if(engine)engine->pcm.clear();}
uint32_t nocpu_sample_rate(){return 48000;}
uint32_t nocpu_audio_overruns(){return engine?engine->audio_overruns:0;}
uint32_t nocpu_score(uint32_t slot){
    if(!engine||slot>1)return 0;
    if(engine->game==NOCPU_PONG)return bcd(slot==0?"C7":"D7")+10*pin(slot==0?"C8.3":"C8.5");
    if(engine->game==NOCPU_PONG_DOUBLES)return bcd(slot==0?"C8":"D8")+10*pin(slot==0?"C9.3":"C9.5");
    if(engine->game==NOCPU_BREAKOUT)return bcd9310(slot==0?"H6":"N6")
        +10*bcd9310(slot==0?"J6":"M6")+100*bcd9310(slot==0?"K6":"L6");
    return bcd(slot==0?"J9":"L9")+10*bcd(slot==0?"H9":"K9");
}
uint32_t nocpu_hits(){return engine?engine->hits:0;}
uint32_t nocpu_run_n(){
    if(engine&&engine->game==NOCPU_SPACE_RACE)return !pin("C9.3");
    return pin("LATCH.3");
}
uint32_t nocpu_attract_n(){
    if(engine&&engine->game==NOCPU_SPACE_RACE)return UINT32_MAX;
    if(engine&&engine->game==NOCPU_BREAKOUT)return pin("E6.9");
    return pin(engine&&engine->game==NOCPU_PONG_DOUBLES?"D2.4":"D2.1");
}
uint32_t nocpu_active(){
    if(!engine)return 0;
    if(engine->game==NOCPU_PONG_DOUBLES)return pin("D2.4")!=0;
    if(engine->game==NOCPU_SPACE_RACE)return pin("C9.3")!=0;
    if(engine->game==NOCPU_BREAKOUT)return pin("E6.9")!=0;
    return pin("LATCH.3")==0;
}
uint32_t nocpu_crashes(uint32_t slot){return engine&&engine->game==NOCPU_SPACE_RACE&&slot<2?engine->crashes[slot]:0;}
uint32_t nocpu_breakout_signal(uint32_t signal){
    if(!engine||engine->game!=NOCPU_BREAKOUT)return UINT32_MAX;
    const char* keys[]={"E6.8","E6.9","LATCH.3","A3.9","B4.14"};
    if(signal<5)return uint32_t(pin(keys[signal]));
    if(signal==NOCPU_BREAKOUT_BALL_COUNTER)return pin("B4.13")+2*pin("B4.12")+4*pin("B4.11");
    return UINT32_MAX;
}
uint32_t nocpu_breakout_count(uint32_t event){
    return engine&&engine->game==NOCPU_BREAKOUT&&event>=NOCPU_BRICK_HIT&&event<=NOCPU_VB_HIT_N
        ?engine->breakout_counts[event-NOCPU_BRICK_HIT]:UINT32_MAX;
}
uint32_t nocpu_time_lo(){return uint32_t(now());}
uint32_t nocpu_time_hi(){return uint32_t(now()>>32);}
const uint32_t* nocpu_collisions(){return engine&&!engine->collisions.empty()?engine->collisions.data():nullptr;}
uint32_t nocpu_collision_count(){return engine?uint32_t(engine->collisions.size()/3):0;}
void nocpu_collisions_clear(){if(engine)engine->collisions.clear();}
const uint32_t* nocpu_events(){return engine&&!engine->events.empty()?engine->events.data():nullptr;}
uint32_t nocpu_event_count(){return engine?uint32_t(engine->events.size()/4):0;}
void nocpu_events_clear(){if(engine)engine->events.clear();}
uint32_t nocpu_event_overruns(){return engine?engine->event_overruns:0;}
}
