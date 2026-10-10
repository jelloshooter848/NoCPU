// SPDX-License-Identifier: GPL-3.0-or-later
// Evidence adapter for the same portable circuit compiled by Emscripten.
#include "nocpu.h"
#include "port_hooks.h"
#include <algorithm>
#include <cerrno>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include <sys/stat.h>

namespace {
struct Event { uint64_t time; std::string action; int value; };
std::string output, epoch_path;
std::ofstream pcm,frames,gray,telemetry,inputs,collisions;
uint32_t frame_number=0,snapshot=0;
const uint64_t snapshots[]={250,1000,2000,3000,6000,13000,15000};

uint64_t time_now() {return uint64_t(nocpu_time_hi())<<32|nocpu_time_lo();}
void directory(const std::string& path) {
    if(mkdir(path.c_str(),0755)!=0&&errno!=EEXIST)
        throw std::runtime_error("Cannot create directory: "+path+": "+std::strerror(errno));
}
void on_frame(uint64_t time) {
    const auto* rgba=nocpu_frame();
    const uint32_t width=nocpu_width(),height=nocpu_height();
    // The historical GL capture hashes bottom-up RGB. Match its byte order.
    uint64_t hash=14695981039346656037ULL;
    for(uint32_t y=height;y-->0;)for(uint32_t x=0;x<width;++x)for(unsigned c=0;c<3;++c){
        hash^=rgba[(y*width+x)*4+c];hash*=1099511628211ULL;
    }
    frames<<frame_number++<<','<<time<<','<<hash<<'\n';
    // Match reference_driver.cpp's exact viewport sample positions, including
    // its asymmetric rounding when converting GL's bottom-up coordinates.
    for(unsigned y=0;y<120;++y)for(unsigned x=0;x<160;++x)
        gray.put(rgba[((y*height/120)*width+x*width/160)*4]);
    if(snapshot<sizeof(snapshots)/sizeof(snapshots[0])&&time>=snapshots[snapshot]*1000000000ULL) {
        std::ofstream file(epoch_path+"/"+std::to_string(snapshots[snapshot++])+"ms.ppm",std::ios::binary);
        file<<"P6\n"<<width<<' '<<height<<"\n255\n";
        for(uint32_t i=0;i<width*height;++i)file.write(reinterpret_cast<const char*>(rgba+i*4),3);
        if(!file)throw std::runtime_error("Cannot write frame snapshot");
    }
}
void on_hit(uint64_t time,int value){collisions<<time<<','<<value<<'\n';}
void drain_audio() {
    const auto* samples=nocpu_audio();
    for(uint32_t i=0;i<nocpu_audio_count();++i) {
        uint16_t value=uint16_t(samples[i]);
        pcm.put(char(value&255));pcm.put(char(value>>8));
    }
    nocpu_audio_clear();
    // Exact transitions are already retained by the native callback above.
    nocpu_collisions_clear();
}
void open_epoch(unsigned epoch) {
    epoch_path=output+"/epoch"+std::to_string(epoch);directory(epoch_path);
    pcm.open(epoch_path+"/audio.s16le",std::ios::binary|std::ios::trunc);
    frames.open(epoch_path+"/frames.csv");gray.open(epoch_path+"/frames.gray",std::ios::binary|std::ios::trunc);
    telemetry.open(epoch_path+"/telemetry.csv");inputs.open(epoch_path+"/inputs.csv");
    collisions.open(epoch_path+"/collisions.csv");
    if(!pcm||!frames||!gray||!telemetry||!inputs||!collisions)throw std::runtime_error("Cannot open evidence files");
    frames<<"frame,time_ps,fnv1a64\n";
    telemetry<<"time_ps,score1,score2,run_n,attract_n,hits\n";
    inputs<<"requested_ps,applied_ps,action,value\n";
    collisions<<"time_ps,hit_output\n";
    frame_number=snapshot=0;
}
void close_epoch() {
    drain_audio();
    if(nocpu_audio_overruns())throw std::runtime_error("Portable PCM overrun");
    if(!pcm||!frames||!gray||!telemetry||!inputs||!collisions)throw std::runtime_error("Evidence write failed");
    pcm.close();frames.close();gray.close();telemetry.close();inputs.close();collisions.close();
}
std::vector<Event> read_replay(const std::string& path) {
    std::ifstream file(path);if(!file)throw std::runtime_error("Cannot read replay");
    std::vector<Event> events;std::string line;
    while(std::getline(file,line)) {
        if(line.empty()||line[0]=='#')continue;
        std::istringstream row(line);uint64_t milliseconds;Event event;std::string extra;
        if(!(row>>milliseconds>>event.action>>event.value)||(row>>extra))throw std::runtime_error("Invalid replay row");
        if(milliseconds>1000000ULL)throw std::runtime_error("Replay duration exceeds runner bound");
        event.time=milliseconds*1000000000ULL;
        if(!events.empty()&&event.time<events.back().time)throw std::runtime_error("Unsorted replay");
        if(event.action!="coin"&&event.action!="paddle1"&&event.action!="paddle2"&&event.action!="recreate")
            throw std::runtime_error("Unknown replay action");
        if(event.action=="recreate"&&event.value!=1)throw std::runtime_error("Invalid recreate action");
        if((event.action=="paddle1"||event.action=="paddle2")&&(event.value< -32768||event.value>32767))
            throw std::runtime_error("Paddle outside ABI range");
        if(event.action=="coin"&&event.value!=0&&event.value!=1)throw std::runtime_error("Coin must be 0 or 1");
        events.push_back(event);
    }
    if(events.empty()||events.back().action!="recreate"||events.back().time==0)
        throw std::runtime_error("Replay must end with a nonzero recreate boundary");
    for(size_t i=0;i+1<events.size();++i)if(events[i].action=="recreate")
        throw std::runtime_error("Only final recreate boundary is supported");
    return events;
}
}
int main(int argc,char** argv) {
    try {
        std::string replay;uint32_t seed=848;unsigned epochs=2;
        for(int i=1;i<argc;++i) {
            std::string arg=argv[i];if(i+1==argc)throw std::runtime_error("Missing option value");
            const std::string value=argv[++i];
            if(arg=="--output")output=value;
            else if(arg=="--replay")replay=value;
            else if(arg=="--seed")seed=std::stoul(value);
            else if(arg=="--epochs")epochs=std::stoul(value);
            else throw std::runtime_error("Unknown option: "+arg);
        }
        if(output.empty()||replay.empty()||!epochs||epochs>16)
            throw std::runtime_error("Usage: pong-native --output DIR --replay FILE [--seed 848] [--epochs 2]");
        const auto events=read_replay(replay);directory(output);nocpu_set_hooks(on_frame,on_hit);
        for(unsigned epoch=0;epoch<epochs;++epoch) {
            open_epoch(epoch);
            if(!(epoch?nocpu_reset(seed):nocpu_create(seed)))throw std::runtime_error("Portable circuit construction failed");
            uint64_t deadline=0;size_t next_event=0;bool complete=false;
            while(!complete) {
                const uint64_t now=time_now();
                telemetry<<now<<','<<nocpu_score(0)<<','<<nocpu_score(1)<<','<<nocpu_run_n()<<','<<nocpu_attract_n()<<','<<nocpu_hits()<<'\n';
                while(next_event<events.size()&&events[next_event].time<=now) {
                    const auto& event=events[next_event++];
                    inputs<<event.time<<','<<time_now()<<','<<event.action<<','<<event.value<<'\n';
                    if(event.action=="coin")nocpu_coin(event.value);
                    else if(event.action=="paddle1")nocpu_paddle(0,event.value);
                    else if(event.action=="paddle2")nocpu_paddle(1,event.value);
                    else if(event.action=="recreate"){complete=true;break;}
                }
                if(complete)break;
                const uint64_t target=std::min<uint64_t>(deadline+1000000000ULL,events[next_event].time);
                // Replay events lie at millisecond boundaries. The original
                // scheduler may overshoot; deadline remains the requested time.
                if(!nocpu_advance(uint32_t((target-deadline)/1000000ULL)))throw std::runtime_error("Advance rejected");
                deadline=target;drain_audio();
            }
            close_epoch();
        }
        nocpu_destroy();nocpu_set_hooks(nullptr,nullptr);
        std::cout<<"Portable Pong evidence: "<<output<<'\n';return 0;
    }catch(const std::exception& error){nocpu_destroy();std::cerr<<error.what()<<'\n';return 1;}
}
