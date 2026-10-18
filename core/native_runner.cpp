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
#include <zlib.h>

namespace {
struct Event { uint64_t time; std::string action; int value; };
std::string output, epoch_path, rom_dir;
gzFile rgb=nullptr;
std::ofstream hardware,geometry;
std::ofstream pcm,frames,gray,telemetry,inputs,collisions,transition_events;
uint32_t game=NOCPU_PONG,dip=0,pot_ohms=0;
bool gzip_snapshots=false;
bool selected(){return game==NOCPU_STUNT_CYCLE||game==NOCPU_INDY_4;}
const char* game_name(){return nocpu_game_name(game);}
// Games ported from 0.2.0 on describe their inputs through the ABI.
bool registered(){return nocpu_game_info(game,NOCPU_INFO_REGISTERED)==1;}
uint32_t info(uint32_t field){return nocpu_game_info(game,field);}
uint32_t score_slots(){return registered()?std::max<uint32_t>(2,info(NOCPU_INFO_SCORES)):2;}
// Generic replay vocabulary of a registered game: coin, start/start2,
// paddleN, upN/downN/leftN/rightN (declared directions only), buttonSB, and
// for declared wheels wheelN (signed rate axis) and wheelleftN/wheelrightN
// (held keys).
bool registered_action(const std::string& action,bool& analog) {
    analog=false;
    auto digit=[&](size_t at,uint32_t limit){return action.size()==at+1&&action[at]>='1'&&uint32_t(action[at]-'0')<=limit;};
    if(action=="coin")return true;
    if(action=="start")return info(NOCPU_INFO_STARTS)>=1;
    if(action=="start2")return info(NOCPU_INFO_STARTS)>=2;
    if(action.compare(0,6,"paddle")==0&&digit(6,info(NOCPU_INFO_PADDLES))){analog=true;return true;}
    if(action.compare(0,9,"wheelleft")==0)return digit(9,info(NOCPU_INFO_WHEELS));
    if(action.compare(0,10,"wheelright")==0)return digit(10,info(NOCPU_INFO_WHEELS));
    if(action.compare(0,5,"wheel")==0&&digit(5,info(NOCPU_INFO_WHEELS))){analog=true;return true;}
    const char* names[]={"up","down","left","right"};
    for(unsigned bit=0;bit<4;++bit) {
        const std::string name=names[bit];
        if(action.compare(0,name.size(),name)==0&&digit(name.size(),info(NOCPU_INFO_JOYSTICKS)))
            return (info(NOCPU_INFO_JOYSTICK_DIRECTIONS)>>bit)&1;
    }
    return action.size()==8&&action.compare(0,6,"button")==0&&action[6]>='1'&&uint32_t(action[6]-'0')<=info(NOCPU_INFO_BUTTON_SLOTS)
        &&action[7]>='1'&&uint32_t(action[7]-'0')<=info(NOCPU_INFO_BUTTONS);
}
uint32_t frame_number=0,snapshot=0;
const uint64_t snapshots[]={250,399,633,799,866,999,1000,1132,1166,1232,1316,1382,1500,1800,2000,2100,2200,2250,2300,2400,2500,2600,2700,2750,3000,3200,3250,3300,3400,3500,3600,3700,3750,3800,3900,4000,4250,4500,4750,5000,5250,5500,5750,6000,6500,7500,8000,8500,9000,9500,10000,10500,11000,11500,12000,13000,15000,20000,30000,45000,60000,80000,110000,130000,170000};

uint64_t time_now() {return uint64_t(nocpu_time_hi())<<32|nocpu_time_lo();}
void directory(const std::string& path) {
    if(mkdir(path.c_str(),0755)!=0&&errno!=EEXIST)
        throw std::runtime_error("Cannot create directory: "+path+": "+std::strerror(errno));
}
void on_frame(uint64_t time) {
    const auto* rgba=nocpu_frame();
    const uint32_t width=nocpu_width(),height=nocpu_height();
    std::vector<uint8_t> full_rgb;
    if(selected())full_rgb.reserve(width*height*3);
    // The historical GL capture hashes bottom-up RGB. Match its byte order.
    uint64_t hash=14695981039346656037ULL;
    for(uint32_t y=height;y-->0;)for(uint32_t x=0;x<width;++x)for(unsigned c=0;c<3;++c){
        const auto value=rgba[(y*width+x)*4+c];hash^=value;hash*=1099511628211ULL;
        if(selected())full_rgb.push_back(value);
    }
    if(selected()) {
        if(gzwrite(rgb,full_rgb.data(),full_rgb.size())!=int(full_rgb.size()))throw std::runtime_error("Full RGB write failed");
        geometry<<frame_number<<','<<time<<','<<width<<','<<height<<'\n';
    }
    frames<<frame_number++<<','<<time<<','<<hash<<'\n';
    // Match reference_driver.cpp's exact viewport sample positions, including
    // its asymmetric rounding when converting GL's bottom-up coordinates.
    for(unsigned y=0;y<120;++y)for(unsigned x=0;x<160;++x)
        gray.put(rgba[((y*height/120)*width+x*width/160)*4]);
    if(snapshot<sizeof(snapshots)/sizeof(snapshots[0])&&time>=snapshots[snapshot]*1000000000ULL) {
        const std::string path=epoch_path+"/"+std::to_string(snapshots[snapshot++])+"ms.ppm";
        if(gzip_snapshots) {
            const std::string header="P6\n"+std::to_string(width)+" "+std::to_string(height)+"\n255\n";
            std::vector<uint8_t> pixels;pixels.reserve(width*height*3);
            for(uint32_t i=0;i<width*height;++i)for(unsigned c=0;c<3;++c)pixels.push_back(rgba[i*4+c]);
            gzFile file=gzopen((path+".gz").c_str(),"wb1");
            if(!file)throw std::runtime_error("Cannot open compressed frame snapshot");
            const bool wrote=gzwrite(file,header.data(),header.size())==int(header.size())
                &&gzwrite(file,pixels.data(),pixels.size())==int(pixels.size());
            const int closed=gzclose(file);
            if(!wrote||closed!=Z_OK)throw std::runtime_error("Cannot write compressed frame snapshot");
        } else {
            std::ofstream file(path,std::ios::binary);
            file<<"P6\n"<<width<<' '<<height<<"\n255\n";
            for(uint32_t i=0;i<width*height;++i)file.write(reinterpret_cast<const char*>(rgba+i*4),3);
            if(!file)throw std::runtime_error("Cannot write frame snapshot");
        }
    }
}
void on_hit(uint64_t time,int value){collisions<<time<<','<<value<<'\n';}
void on_event(uint64_t time,unsigned signal,int value){
    // The independently instrumented original Breakout names these six raw
    // source pins 100..105. Portable IDs 5..10 use the same declared order.
    if(game==NOCPU_BREAKOUT) {
        if(signal<5||signal>10)throw std::runtime_error("Unexpected Breakout source event");
        signal+=95;
    }
    transition_events<<time<<','<<signal<<','<<value<<'\n';
}
void drain_audio() {
    const auto* samples=nocpu_audio();
    for(uint32_t i=0;i<nocpu_audio_count();++i) {
        uint16_t value=uint16_t(samples[i]);
        pcm.put(char(value&255));pcm.put(char(value>>8));
    }
    nocpu_audio_clear();
    // Exact transitions are already retained by the native callback above.
    nocpu_collisions_clear();
    nocpu_events_clear();
}
void open_epoch(unsigned epoch) {
    epoch_path=output+"/epoch"+std::to_string(epoch);directory(epoch_path);
    pcm.open(epoch_path+"/audio.s16le",std::ios::binary|std::ios::trunc);
    frames.open(epoch_path+"/frames.csv");gray.open(epoch_path+"/frames.gray",std::ios::binary|std::ios::trunc);
    telemetry.open(epoch_path+"/telemetry.csv");inputs.open(epoch_path+"/inputs.csv");
    collisions.open(epoch_path+"/collisions.csv");
    transition_events.open(epoch_path+"/events.csv");
    if(!pcm||!frames||!gray||!telemetry||!inputs||!collisions||!transition_events)throw std::runtime_error("Cannot open evidence files");
    frames<<"frame,time_ps,fnv1a64\n";
    telemetry<<"time_ps";
    for(uint32_t slot=1;slot<=score_slots();++slot)telemetry<<",score"<<slot;
    telemetry<<",run_n,attract_n,hits"<<(game==NOCPU_PONG?"\n":",active\n");
    inputs<<"requested_ps,applied_ps,action,value\n";
    collisions<<"time_ps,hit_output\n";
    transition_events<<"time_ps,signal,value\n";
    if(selected()) {
        rgb=gzopen((epoch_path+"/frames.rgb.gz").c_str(),"wb1");
        hardware.open(epoch_path+"/hardware.csv");geometry.open(epoch_path+"/frame-geometry.csv");
        if(!rgb||!hardware||!geometry)throw std::runtime_error("Selected evidence open failed");
        geometry<<"frame,time_ps,width,height\n";
        if(game==NOCPU_STUNT_CYCLE)hardware<<"time_ps,attract_n,player_control,jump,flip,good_jump,bad_jump,miss_counter,credit,throttle_milli,score1,score2\n";
        else {
            hardware<<"time_ps,play,endgame_n,credit_n";
            for(unsigned p=1;p<=4;++p)hardware<<",car"<<p<<"_attract,car"<<p<<"_collision,car"<<p<<"_heading,car"<<p<<"_speed,car"<<p<<"_lap,car"<<p<<"_score_code,car"<<p<<"_displayed_score";
            hardware<<'\n';
        }
    }
    frame_number=snapshot=0;
}
void close_epoch() {
    drain_audio();
    if(nocpu_audio_overruns())throw std::runtime_error("Portable PCM overrun");
    if(nocpu_event_overruns())throw std::runtime_error("Portable event overrun");
    if(!pcm||!frames||!gray||!telemetry||!inputs||!collisions||!transition_events)throw std::runtime_error("Evidence write failed");
    pcm.close();frames.close();gray.close();telemetry.close();inputs.close();collisions.close();transition_events.close();
    if(selected()) {
        if(!hardware||!geometry||gzclose(rgb)!=Z_OK)throw std::runtime_error("Selected evidence write failed");
        rgb=nullptr;hardware.close();geometry.close();
    }
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
        if(registered()) {
            bool analog=false;
            if(event.action!="recreate"&&!registered_action(event.action,analog))throw std::runtime_error("Unknown replay action");
            if(event.action=="recreate"&&event.value!=1)throw std::runtime_error("Invalid recreate action");
            if(analog?(event.value< -32768||event.value>32767):(event.value!=0&&event.value!=1))
                throw std::runtime_error("Replay input outside physical range");
            events.push_back(event);continue;
        }
        const bool paddle=event.action.size()==7&&event.action.substr(0,6)=="paddle"&&event.action[6]>='1'
            &&event.action[6]<=(game==NOCPU_PONG_DOUBLES?'4':game==NOCPU_BREAKOUT?'1':'2')&&(game==NOCPU_PONG||game==NOCPU_PONG_DOUBLES||game==NOCPU_BREAKOUT);
        const bool direction=game==NOCPU_SPACE_RACE&&(event.action=="up1"||event.action=="down1"||event.action=="up2"||event.action=="down2");
        const bool breakout_switch=game==NOCPU_BREAKOUT&&(event.action=="start2"||event.action=="serve");
        const bool throttle=game==NOCPU_STUNT_CYCLE&&event.action=="throttle";
        const bool wheel=game==NOCPU_INDY_4&&event.action.size()==6&&event.action.substr(0,5)=="wheel"&&event.action[5]>='1'&&event.action[5]<='4';
        const bool added=(game==NOCPU_STUNT_CYCLE&&(event.action=="start2"||event.action=="throttlekey"))||(game==NOCPU_INDY_4&&(event.action=="dollar"||
            (event.action.size()==5&&event.action.substr(0,4)=="coin"&&event.action[4]>='1'&&event.action[4]<='4')||
            (event.action.size()==4&&event.action.substr(0,3)=="gas"&&event.action[3]>='1'&&event.action[3]<='4')||
            (event.action.size()==6&&event.action.substr(0,5)=="brake"&&event.action[5]>='1'&&event.action[5]<='4')||
            (event.action.size()==5&&event.action.substr(0,4)=="left"&&event.action[4]>='1'&&event.action[4]<='4')||
            (event.action.size()==6&&event.action.substr(0,5)=="right"&&event.action[5]>='1'&&event.action[5]<='4')));
        if(event.action!="coin"&&!(event.action=="start"&&game!=NOCPU_PONG&&game!=NOCPU_INDY_4)&&!breakout_switch&&!added&&!throttle&&!wheel&&!paddle&&!direction&&event.action!="recreate")
            throw std::runtime_error("Unknown replay action");
        if(event.action=="recreate"&&event.value!=1)throw std::runtime_error("Invalid recreate action");
        if((paddle||wheel)&&(event.value< -32768||event.value>32767))
            throw std::runtime_error("Paddle outside ABI range");
        if(throttle&&(event.value<0||event.value>32767))throw std::runtime_error("Throttle outside ABI range");
        if(!paddle&&!wheel&&!throttle&&event.value!=0&&event.value!=1)throw std::runtime_error("Switch must be 0 or 1");
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
        std::string replay;uint32_t seed=848;unsigned epochs=2;bool dip_given=false;
        for(int i=1;i<argc;++i) {
            std::string arg=argv[i];if(i+1==argc)throw std::runtime_error("Missing option value");
            const std::string value=argv[++i];
            if(arg=="--output")output=value;
            else if(arg=="--replay")replay=value;
            else if(arg=="--seed")seed=std::stoul(value);
            else if(arg=="--epochs")epochs=std::stoul(value);
            else if(arg=="--game") {
                game=NOCPU_GAME_LIMIT;
                for(uint32_t id=0;id<NOCPU_GAME_LIMIT;++id) {
                    const char* name=nocpu_game_name(id);
                    if(name&&value==name)game=id;
                }
                if(game==NOCPU_GAME_LIMIT)throw std::runtime_error("Unsupported game");
            }
            else if(arg=="--dip"){dip=std::stoul(value);dip_given=true;}
            else if(arg=="--pot-ohms")pot_ohms=std::stoul(value);
            else if(arg=="--rom-dir")rom_dir=value;
            else if(arg=="--snapshot-encoding") {
                if(value!="raw"&&value!="gzip")throw std::runtime_error("Unsupported snapshot encoding");
                gzip_snapshots=value=="gzip";
            }
            else throw std::runtime_error("Unknown option: "+arg);
        }
        if(output.empty()||replay.empty()||!epochs||epochs>16)
            throw std::runtime_error("Usage: pong-native --output DIR --replay FILE [--game pong|pongdoubles|spacerace|breakout|stuntcycle|indy4|<registered game>] [--dip PACKED_GAME_SETTINGS] [--pot-ohms N] [--seed 848] [--epochs 2]");
        if(game==NOCPU_SPACE_RACE&&!pot_ohms)pot_ohms=970000;
        if(game==NOCPU_BREAKOUT&&!dip_given)dip=3;
        if(game==NOCPU_STUNT_CYCLE&&!dip_given)dip=76;
        if(game==NOCPU_INDY_4&&!pot_ohms)pot_ohms=720000;
        if(registered()&&!dip_given)dip=info(NOCPU_INFO_DEFAULT_DIP);
        if(registered()&&!pot_ohms)pot_ohms=info(NOCPU_INFO_POT_DEFAULT);
        if(gzip_snapshots&&!selected())throw std::runtime_error("Compressed snapshots require a selected ROM-backed game");
        const auto events=read_replay(replay);directory(output);nocpu_set_hooks(on_frame,on_hit);nocpu_set_event_hook(on_event);
        if(selected()) {
            if(rom_dir.empty()||!nocpu_rom_begin(game))throw std::runtime_error("Trusted private ROM input required");
            const char* names[]={"82s123.4d","82s115.1fh","indy.s1","indy.s2","indy.c1","indy.c2"};
            const unsigned sizes[]={32,512,512,32,512,32};
            const unsigned first=game==NOCPU_STUNT_CYCLE?0:2,count=game==NOCPU_STUNT_CYCLE?2:4;
            for(unsigned slot=0;slot<count;++slot) {
                std::ifstream input(rom_dir+"/"+game_name()+"/"+names[first+slot],std::ios::binary);
                std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(input)),std::istreambuf_iterator<char>());
                if(!input||bytes.size()!=sizes[first+slot])throw std::runtime_error("Private descriptor input size invalid");
                auto* owned=nocpu_rom_buffer(slot,bytes.size());if(!owned)throw std::runtime_error("Private owned ROM buffer rejected");
                std::copy(bytes.begin(),bytes.end(),owned);
            }
            if(!nocpu_rom_finish())throw std::runtime_error("Private ROM CRC verification failed");
        }
        for(unsigned epoch=0;epoch<epochs;++epoch) {
            open_epoch(epoch);
            if(!(epoch?nocpu_reset(seed):nocpu_create_game(game,seed,dip,pot_ohms)))throw std::runtime_error("Portable circuit construction failed");
            if(nocpu_game()!=game||nocpu_dip()!=dip||nocpu_pot_ohms()!=pot_ohms)throw std::runtime_error("Selected circuit/settings identity mismatch");
            if(selected()) {
                std::ofstream boundary(epoch_path+"/audio-boundary.json");
                boundary<<"{\"constructor_samples\":"<<nocpu_audio_count()<<",\"constructor_time_ps\":"<<time_now()<<"}\n";
                if(!boundary)throw std::runtime_error("Audio boundary write failed");
            }
            bool directions[2][2]={{false,false},{false,false}},keys[4][2]={},buttons[4][2]={},sticks[2][4]={},wheel_keys[4][2]={};
            uint64_t deadline=0;size_t next_event=0;bool complete=false;
            while(!complete) {
                const uint64_t now=time_now();
                telemetry<<now;
                for(uint32_t slot=0;slot<score_slots();++slot)telemetry<<','<<nocpu_score(slot);
                telemetry<<','<<nocpu_run_n()<<','<<nocpu_attract_n()<<','<<nocpu_hits();
                if(game!=NOCPU_PONG)telemetry<<','<<nocpu_active();
                telemetry<<'\n';
                if(selected()) {
                    hardware<<now;
                    if(game==NOCPU_STUNT_CYCLE) {
                        for(unsigned i=0;i<8;++i)hardware<<','<<nocpu_stuntcycle_signal(i);
                        hardware<<','<<nocpu_stuntcycle_throttle()<<','<<nocpu_score(0)<<','<<nocpu_score(1);
                    } else {
                        for(unsigned i=0;i<3;++i)hardware<<','<<nocpu_indy4_signal(0,i);
                        for(unsigned p=0;p<4;++p){for(unsigned i=3;i<=8;++i)hardware<<','<<nocpu_indy4_signal(p,i);hardware<<','<<nocpu_score(p);}
                    }
                    hardware<<'\n';
                }
                while(next_event<events.size()&&events[next_event].time<=now) {
                    const auto& event=events[next_event++];
                    inputs<<event.time<<','<<time_now()<<','<<event.action<<','<<event.value<<'\n';
                    if(registered()&&event.action!="recreate") {
                        bool accepted=true;
                        if(event.action=="coin")accepted=nocpu_coin_channel(1,event.value);
                        else if(event.action=="start"||event.action=="start2")accepted=nocpu_start_player(event.action=="start"?1:2,event.value);
                        else if(event.action.compare(0,6,"paddle")==0)nocpu_paddle(event.action.back()-'1',event.value);
                        else if(event.action.compare(0,6,"button")==0)accepted=nocpu_button(event.action[6]-'1',event.action[7]-'0',event.value);
                        else if(event.action.compare(0,5,"wheel")==0) {
                            const unsigned slot=event.action.back()-'1';
                            if(event.action.size()==6)accepted=nocpu_wheel(slot,event.value);
                            else {
                                wheel_keys[slot][event.action[5]=='l'?0:1]=event.value;
                                accepted=nocpu_wheel_keys(slot,wheel_keys[slot][0],wheel_keys[slot][1]);
                            }
                        }
                        else {
                            const unsigned slot=event.action.back()-'1';
                            const char first=event.action[0];
                            sticks[slot][first=='u'?0:first=='d'?1:first=='l'?2:3]=event.value;
                            accepted=nocpu_joystick_switches(slot,sticks[slot][0],sticks[slot][1],sticks[slot][2],sticks[slot][3]);
                        }
                        if(!accepted)throw std::runtime_error("Registered game input rejected: "+event.action);
                        continue;
                    }
                    if(event.action=="coin")nocpu_coin(event.value);
                    else if(event.action=="start")nocpu_start(event.value);
                    else if(event.action=="start2"){
                        if(!nocpu_start_player(2,event.value))throw std::runtime_error("Start2 rejected");
                    }
                    else if(event.action=="serve"){
                        if(!nocpu_serve(event.value))throw std::runtime_error("Serve rejected");
                    }
                    else if(event.action.substr(0,6)=="paddle")nocpu_paddle(event.action[6]-'1',event.value);
                    else if(event.action=="up1"||event.action=="down1"||event.action=="up2"||event.action=="down2") {
                        const unsigned slot=event.action.back()-'1',direction=event.action[0]=='u'?0:1;
                        directions[slot][direction]=event.value;
                        nocpu_joystick(slot,directions[slot][0],directions[slot][1]);
                    }
                    else if(event.action=="throttle") {if(!nocpu_throttle(event.value))throw std::runtime_error("Throttle rejected");}
                    else if(event.action=="throttlekey") {if(!nocpu_throttle_key(event.value))throw std::runtime_error("Throttle key rejected");}
                    else if(event.action=="dollar") {if(!nocpu_coin_channel(5,event.value))throw std::runtime_error("Dollar rejected");}
                    else if(event.action.substr(0,4)=="coin") {if(!nocpu_coin_channel(event.action.back()-'0',event.value))throw std::runtime_error("Coin rejected");}
                    else if(event.action.substr(0,5)=="wheel") {if(!nocpu_wheel(event.action.back()-'1',event.value))throw std::runtime_error("Wheel rejected");}
                    else if(event.action.substr(0,4)=="left"||event.action.substr(0,5)=="right") {
                        unsigned p=event.action.back()-'1';keys[p][event.action[0]=='l'?0:1]=event.value;
                        if(!nocpu_wheel_keys(p,keys[p][0],keys[p][1]))throw std::runtime_error("Wheel keys rejected");
                    }
                    else if(event.action.substr(0,3)=="gas"||event.action.substr(0,5)=="brake") {
                        unsigned p=event.action.back()-'1';buttons[p][event.action[0]=='g'?0:1]=event.value;
                        if(!nocpu_buttons(p,buttons[p][0],buttons[p][1]))throw std::runtime_error("Driving buttons rejected");
                    }
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
        nocpu_destroy();nocpu_set_hooks(nullptr,nullptr);nocpu_set_event_hook(nullptr);
        std::ofstream identity(output+"/configuration.json");
        identity<<"{\"game\":\""<<game_name()<<"\",\"dip\":"<<dip<<",\"pot_ohms\":"<<pot_ohms<<"}\n";
        if(!identity)throw std::runtime_error("Configuration evidence write failed");
        std::cout<<"Portable "<<game_name()<<" evidence: "<<output<<'\n';return 0;
    }catch(const std::exception& error){nocpu_destroy();std::cerr<<error.what()<<'\n';return 1;}
}
