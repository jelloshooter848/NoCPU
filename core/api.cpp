// SPDX-License-Identifier: GPL-3.0-or-later
#include "nocpu.h"
#include "port_hooks.h"
#include "circuit.h"
#include "circuit_desc.h"
#include "platform/rom_session.h"
#include "game_registry.h"
#include "chips/dipswitch.h"
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
extern const CircuitDesc* circuit_stuntcycle();
extern const CircuitDesc* circuit_indy4();
extern void nocpu_reset_pong_descriptors();
extern void nocpu_reset_pongdoubles_descriptors();
extern void nocpu_reset_spacerace_descriptors();
extern void nocpu_reset_breakout_descriptors();
extern void nocpu_reset_stuntcycle_descriptors();
extern void nocpu_reset_indy4_descriptors();
extern void nocpu_configure_pong(unsigned);
extern void nocpu_configure_pongdoubles(unsigned);
extern void nocpu_configure_spacerace(unsigned,unsigned);
extern void nocpu_configure_breakout(unsigned);
extern void nocpu_configure_stuntcycle(unsigned);
extern void nocpu_configure_indy4(unsigned);
extern unsigned nocpu_stuntcycle_throttle_value();
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
    Chip* observed[NOCPU_EVENT_TYPES]={};
    // Registered games (core/games/<id>.cpp): their definition and the chips
    // of their declared event pins, reported as NOCPU_GAME_EVENT_BASE+index.
    const NoCPUGameDef* def=nullptr;
    Chip* game_observed[NOCPU_GAME_EVENT_LIMIT]={};
    // A registered game's NoCPU sound reconstruction and the chips of its
    // declared sound pins (index = position in def->sound_pins).
    std::unique_ptr<NoCPUSound> sound;
    std::vector<Chip*> sound_observed;
    // Every distinct chip in hit, observed, game_observed and sound_observed: a chip outside
    // it records nothing when its output changes, so the per-transition hook
    // can return after one short scan (refresh_watched keeps it current).
    std::vector<Chip*> watched;
    void refresh_watched() {
        watched.clear();
        auto add=[this](Chip* chip){if(chip&&std::find(watched.begin(),watched.end(),chip)==watched.end())watched.push_back(chip);};
        add(hit);
        for(Chip* chip:observed)add(chip);
        for(Chip* chip:game_observed)add(chip);
        for(Chip* chip:sound_observed)add(chip);
    }
    uint32_t event_counts[NOCPU_EVENT_TYPES]={};
    NoCPURomSession roms;
    uint32_t game=NOCPU_PONG,dip=0,pot_ohms=0,crashes[2]={0,0};
    uint32_t breakout_counts[3]={0,0,0};
    uint64_t deadline=0,frame_time=0;
    uint32_t frames=0,hits=0,audio_overruns=0,event_overruns=0;
    std::vector<int16_t> pcm;
    std::vector<uint32_t> collisions;
    std::vector<uint32_t> events;
};
std::unique_ptr<Engine> engine;
NoCPURomSession staged_roms;
uint32_t rom_error=NOCPU_ROM_OK;
std::map<uint32_t,NoCPUGameDef>& registry() {
    static std::map<uint32_t,NoCPUGameDef> games;
    return games;
}
uint32_t dip_mask(const NoCPUGameDef& def) {
    uint32_t mask=0,shift=0;
    for(const auto& field:def.dips){mask|=((1u<<field.bits)-1)<<shift;shift+=field.bits;}
    return mask;
}
uint32_t default_dip(const NoCPUGameDef& def) {
    uint32_t packed=0,shift=0;
    for(const auto& field:def.dips){packed|=field.default_index<<shift;shift+=field.bits;}
    return packed;
}
bool valid_registered_options(const NoCPUGameDef& def,uint32_t dip,uint32_t pot) {
    if(dip&~dip_mask(def))return false;
    uint32_t shift=0;
    for(const auto& field:def.dips) {
        if(((dip>>shift)&((1u<<field.bits)-1))>=field.values)return false;
        shift+=field.bits;
    }
    return def.pot.empty()?pot==0:pot>=def.pot_min&&pot<=def.pot_max;
}
// Apply settings the way the original GameConfig names them: every top-level
// DIP switch and potentiometer descriptor of the circuit, found by its name.
bool configure_registered(const NoCPUGameDef& def,const CircuitDesc* desc,uint32_t dip,uint32_t pot) {
    std::vector<unsigned> found(def.dips.size(),0);
    unsigned pots=0;
    for(const ChipInstance& instance:desc->get_chips()) {
        if(instance.chip==chip_DIPSWITCH||instance.chip==chip_DIPSWITCH_SP4T||instance.chip==chip_53137
           ||instance.chip==chip_DIPSWITCH_4SPST) {
            auto* setting=reinterpret_cast<DipswitchBase*>(instance.custom_data);
            uint32_t shift=0;
            for(size_t i=0;i<def.dips.size();++i) {
                if(!def.dips[i].nocpu&&def.dips[i].name==setting->name) {
                    setting->state=(dip>>shift)&((1u<<def.dips[i].bits)-1);++found[i];
                }
                shift+=def.dips[i].bits;
            }
        } else if(instance.chip==chip_POT_555_MONO||instance.chip==chip_POT_555_ASTABLE) {
            auto* setting=reinterpret_cast<PotentiometerBase*>(instance.custom_data);
            if(!def.pot.empty()&&!def.pot_nocpu&&def.pot==setting->name){setting->current_val=double(pot);++pots;}
        }
    }
    for(size_t i=0;i<found.size();++i)if(found[i]!=(def.dips[i].nocpu?0u:1u))return false;
    return pots==(def.pot.empty()||def.pot_nocpu?0u:1u);
}
struct RomRequirement { const char* file;const char* name;uint32_t crc,size; };
const RomRequirement stunt_roms[]={
    {"stuntcycle","82s123.4d",0x31A09EFB,32},
    {"stuntcycle","82s115.1fh",0x4ED5A99D,512}};
const RomRequirement indy_roms[]={
    {"indy4","indy.s1",0x1AAFBE72,512},
    {"indy4","indy.s2",0xE30EA877,32},
    {"indy4","indy.c1",0xB3443354,512},
    {"indy4","indy.c2",0x01DCA5B9,32}};
const RomRequirement* requirements(uint32_t game,unsigned& count) {
    count=game==NOCPU_STUNT_CYCLE?2:game==NOCPU_INDY_4?4:0;
    return game==NOCPU_STUNT_CYCLE?stunt_roms:game==NOCPU_INDY_4?indy_roms:nullptr;
}
uint32_t crc32(const std::vector<uint8_t>& bytes) {
    uint32_t crc=0xffffffff;
    for(uint8_t byte:bytes) {
        crc^=byte;
        for(unsigned bit=0;bit<8;++bit)crc=(crc>>1)^(0xedb88320u&uint32_t(-int32_t(crc&1)));
    }
    return crc^0xffffffff;
}
bool valid_roms(const NoCPURomSession& session,uint32_t game) {
    unsigned count=0;const auto* expected=requirements(game,count);
    if(!count) {
        // An unstaged legacy ROM-free launch remains valid. An explicit stage
        // belongs only to its named game, even when the target needs no ROMs.
        if((session.game!=UINT32_MAX&&session.game!=game)||!session.members.empty()) {
            rom_error=NOCPU_ROM_GAME;return false;
        }
        rom_error=NOCPU_ROM_OK;return true;
    }
    if(session.game!=game||session.members.size()!=count) {rom_error=NOCPU_ROM_MISSING;return false;}
    for(unsigned i=0;i<count;++i) {
        if(session.members[i].empty()) {rom_error=NOCPU_ROM_MISSING;return false;}
        if(session.members[i].size()!=expected[i].size) {rom_error=NOCPU_ROM_SIZE;return false;}
        if(crc32(session.members[i])!=expected[i].crc) {rom_error=NOCPU_ROM_CRC;return false;}
    }
    rom_error=NOCPU_ROM_OK;return true;
}
const char* cars[]={"GREEN.","CYAN.","VIOLET.","RED."};
NoCPUFrameHook frame_hook=nullptr;
NoCPUHitHook hit_hook=nullptr;
NoCPUEventHook event_hook=nullptr;
int pin(const std::string& name) {
    if(!engine) return 0;
    auto it=engine->chips.find(name);
    return it==engine->chips.end()?0:it->second->output;
}
uint64_t now() {return engine&&engine->circuit?engine->circuit->global_time:0;}
const NoCPUGameDef* registered() {return engine?engine->def:nullptr;}
uint32_t terms(const std::vector<NoCPUPinTerm>& sum) {
    uint32_t value=0;
    for(const auto& term:sum)value+=term.weight*uint32_t(term.inverted?1-pin(term.pin):pin(term.pin));
    return value;
}
bool valid_options(uint32_t game,uint32_t dip,uint32_t pot) {
    if(const auto* def=nocpu_registered_game(game))return valid_registered_options(*def,dip,pot);
    if(game==NOCPU_BREAKOUT)return pot==0&&(dip&~127u)==0&&(dip&15u)<=8;
    if(game==NOCPU_STUNT_CYCLE)return pot==0&&(dip&~511u)==0;
    if(game==NOCPU_INDY_4)return dip==0&&pot>=220000&&pot<=1220000;
    if(game>NOCPU_SPACE_RACE||dip>1)return false;
    return game==NOCPU_SPACE_RACE?pot>=470000&&pot<=1470000:pot==0;
}
uint32_t bcd(const std::string& name) {
    return pin(name+".12")+2*pin(name+".9")+4*pin(name+".8")+8*pin(name+".11");
}
uint32_t bcd9310(const std::string& name) {
    return pin(name+".14")+2*pin(name+".13")+4*pin(name+".12")+8*pin(name+".11");
}
uint32_t binary192(const std::string& name) {
    return pin(name+".3")+2*pin(name+".2")+4*pin(name+".6")+8*pin(name+".7");
}
bool observations_ready() {
    if(!engine)return false;
    std::vector<std::string> required;
    auto add=[&](const char* prefix,const std::vector<const char*>& pins) {
        for(const char* key:pins)required.emplace_back(std::string(prefix)+key);
    };
    if(const auto* def=engine->def) {
        for(const auto& sum:def->scores)for(const auto& term:sum)required.push_back(term.pin);
        for(const auto* key:{&def->active,&def->attract_n,&def->hit})if(!key->empty())required.push_back(*key);
        for(const auto& key:def->events)required.push_back(key);
        for(const auto& key:def->sound_pins)required.push_back(key);
    } else if(engine->game==NOCPU_STUNT_CYCLE) {
        add("",{"D9.9","H6.8","N9.11","N7.5","K7.6","K7.9","LATCH.3","A9.9","A9.5"});
        for(const char* counter:{"E5","B8","B9"})for(const char* suffix:{".3",".2",".6",".7"})required.emplace_back(std::string(counter)+suffix);
    } else if(engine->game==NOCPU_INDY_4) {
        add("COIN.",{"H1.10","H1.1","CAP35.2","F4.6","F4.3","F4.8","F4.11"});
        add("SCORE.",{"B4.9","B4.8","B4.11","B4.12","A4.12","A3.12","A4.9","A4.8","A4.11","A3.9","A3.8","A3.11", "F4.9","F4.8","F4.11","F4.12","E4.12","E3.12","E4.9","E4.8","E4.11","E3.9","E3.8","E3.11","B5.15","A5.15","F5.15","E5.15"});
        for(const char* car:cars)add(car,{"L1.3","E2.6","E2.7","F2.3","F2.2","F2.6","C2.3","C2.2","C2.6","C2.7","A1.5","K3.13","K3.12","K3.11"});
    }
    for(const auto& key:required)if(engine->chips.find(key)==engine->chips.end())return false;
    return true;
}
uint32_t indy_display_code(unsigned slot) {
    const char* groups[][6]={{"B4.9","B4.8","B4.11","B4.12","A4.12","A3.12"},
        {"A4.9","A4.8","A4.11","A3.9","A3.8","A3.11"},
        {"F4.9","F4.8","F4.11","F4.12","E4.12","E3.12"},
        {"E4.9","E4.8","E4.11","E3.9","E3.8","E3.11"}};
    uint32_t value=0;
    for(unsigned bit=0;bit<6;++bit)value|=uint32_t(pin(std::string("SCORE.")+groups[slot][bit]))<<bit;
    return value;
}
}
uint8_t nocpu_rom_read(const RomDesc* rom,unsigned offset) {
    if(!engine||!rom)return 0xff;
    unsigned count=0;const auto* expected=requirements(engine->game,count);
    for(unsigned i=0;i<count;++i) {
        // Descriptor names distinguish logical circuit chips, while accepted
        // CRC resolution may reuse one imported member for several descriptors.
        if(rom->file_name==expected[i].file&&rom->rom_name==expected[i].name
           &&(rom->crc==expected[i].crc||rom->alt_crc==expected[i].crc)) {
            const auto& data=engine->roms.members[i];
            return offset<data.size()?data[offset]:0xff;
        }
    }
    return 0xff;
}
void nocpu_set_hooks(NoCPUFrameHook frame,NoCPUHitHook hit){frame_hook=frame;hit_hook=hit;}
void nocpu_set_event_hook(NoCPUEventHook event){event_hook=event;}
void nocpu_register_chip(const char* name,unsigned output_pin,Chip* chip) {
    if(!engine) return;
    auto key=std::string(name)+"."+std::to_string(output_pin);
    engine->chips[key]=chip;
    if(const auto* def=engine->def) {
        if(!def->hit.empty()&&key==def->hit)engine->hit=engine->observed[NOCPU_HIT]=chip;
        for(size_t i=0;i<def->events.size();++i)if(key==def->events[i])engine->game_observed[i]=chip;
        engine->sound_observed.resize(def->sound_pins.size(),nullptr);
        for(size_t i=0;i<def->sound_pins.size();++i)if(key==def->sound_pins[i])engine->sound_observed[i]=chip;
    } else if(engine->game==NOCPU_PONG&&key=="B2.8")engine->hit=engine->observed[NOCPU_HIT]=chip;
    else if(engine->game==NOCPU_PONG_DOUBLES&&key=="B3.8")engine->hit=engine->observed[NOCPU_HIT]=chip;
    else if(engine->game==NOCPU_SPACE_RACE) {
        const char* keys[]={"D5.8","D5.10","H2.8","K2.8"};
        for(unsigned i=0;i<4;++i)if(key==keys[i])engine->observed[i+1]=chip;
    } else if(engine->game==NOCPU_BREAKOUT) {
        const char* keys[]={"E6.5","A5.8","A5.6","A3.9","B4.14","E6.9"};
        for(unsigned i=0;i<6;++i)if(key==keys[i])engine->observed[NOCPU_BRICK_HIT+i]=chip;
    } else if(engine->game==NOCPU_STUNT_CYCLE) {
        const char* keys[]={"D9.9","H6.8","N9.11","N7.5","K7.6","K7.9"};
        for(unsigned i=0;i<6;++i)if(key==keys[i])engine->observed[NOCPU_STUNT_ATTRACT_N+i]=chip;
    } else if(engine->game==NOCPU_INDY_4) {
        if(key=="COIN.H1.10")engine->observed[NOCPU_INDY_PLAY]=chip;
        const char* attract[]={"COIN.F4.6","COIN.F4.3","COIN.F4.8","COIN.F4.11"};
        const char* checkpoint[]={"SCORE.B5.15","SCORE.A5.15","SCORE.F5.15","SCORE.E5.15"};
        for(unsigned i=0;i<4;++i) {
            if(key==attract[i])engine->observed[NOCPU_INDY_ATTRACT_GREEN+i]=chip;
            if(key==std::string(cars[i])+"L1.3")engine->observed[NOCPU_INDY_COLLISION_GREEN+i]=chip;
            if(key==checkpoint[i])engine->observed[NOCPU_INDY_CHECKPOINT_GREEN_N+i]=chip;
        }
    }
    engine->refresh_watched();
}
void nocpu_unregister_chip(Chip* chip) {
    if(!engine)return;
    for(auto it=engine->chips.begin();it!=engine->chips.end();) {
        if(it->second==chip)it=engine->chips.erase(it);else ++it;
    }
    if(engine->hit==chip)engine->hit=nullptr;
    for(auto& observed:engine->observed)if(observed==chip)observed=nullptr;
    for(auto& observed:engine->game_observed)if(observed==chip)observed=nullptr;
    for(auto& observed:engine->sound_observed)if(observed==chip)observed=nullptr;
    engine->refresh_watched();
}
NoCPUOutputObservation::NoCPUOutputObservation(Chip* value):chip(value),previous(value->output){}
NoCPUOutputObservation::~NoCPUOutputObservation(){
    if(!engine||chip->output==previous)return;
    if(std::find(engine->watched.begin(),engine->watched.end(),chip)==engine->watched.end())return;
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
    // A NoCPU sound reconstruction listens to its pins; it never feeds back.
    if(engine->sound)for(size_t index=0;index<engine->sound_observed.size();++index)
        if(chip==engine->sound_observed[index])engine->sound->pin(unsigned(index),chip->output,time);
    for(unsigned signal=0;signal<NOCPU_EVENT_TYPES;++signal)if(chip==engine->observed[signal]) {
        if((signal==NOCPU_CRASH1_N||signal==NOCPU_CRASH2_N)&&!chip->output)
            ++engine->crashes[signal-NOCPU_CRASH1_N];
        if(signal>=NOCPU_BRICK_HIT&&signal<=NOCPU_VB_HIT_N&&((signal==NOCPU_BRICK_HIT&&chip->output)
           ||(signal!=NOCPU_BRICK_HIT&&!chip->output)))
            ++engine->breakout_counts[signal-NOCPU_BRICK_HIT];
        // GOOD_JUMP's unused Q pin5 is pruned by the original builder. Its
        // connected Q_n pin6 is complementary because /SET pin4 is VCC.
        const int value=signal==NOCPU_STUNT_GOOD_JUMP?1-chip->output:chip->output;
        const bool falling=signal>=NOCPU_INDY_CHECKPOINT_GREEN_N&&signal<=NOCPU_INDY_CHECKPOINT_RED_N;
        if(value!=int(falling))++engine->event_counts[signal];
        if(engine->events.size()/4<EVENT_LIMIT) {
            engine->events.push_back(uint32_t(time));
            engine->events.push_back(uint32_t(time>>32));
            engine->events.push_back(signal);
            engine->events.push_back(uint32_t(value));
        } else ++engine->event_overruns;
        if(event_hook)event_hook(time,signal,value);
        break;
    }
    for(unsigned index=0;index<NOCPU_GAME_EVENT_LIMIT;++index)if(chip==engine->game_observed[index]) {
        const uint32_t signal=NOCPU_GAME_EVENT_BASE+index;
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
const NoCPUGameDef* nocpu_registered_game(uint32_t id) {
    auto found=registry().find(id);
    return found==registry().end()?nullptr:&found->second;
}
bool nocpu_register_game(const NoCPUGameDef& def) {
    // Definitions are fixed program data: reject anything the generic paths
    // could not serve rather than failing later inside a live machine.
    uint32_t bits=0;
    for(const auto& field:def.dips) {
        if(field.name.empty()||!field.bits||field.bits>8||field.values<1||field.values>(1u<<field.bits)
           ||field.default_index>=field.values)std::abort();
        bits+=field.bits;
    }
    if(def.id<=NOCPU_INDY_4||def.id>=NOCPU_GAME_LIMIT||def.name.empty()||!def.circuit||!def.reset_descriptors
       ||bits>16||def.paddles>4||def.joysticks>2||def.joystick_directions>15||def.button_slots>4
       ||def.buttons>3||def.starts>2||def.scores.size()>4||def.active.empty()
       // A wheel reads axis N and held buttons 3/4 of slot N (nocpu_wheel_keys).
       ||def.wheels>4||(def.wheels&&(def.paddles||def.buttons>2))
       ||def.events.size()>NOCPU_GAME_EVENT_LIMIT||(def.pot.empty()?def.pot_min||def.pot_max||def.pot_default
         :!(def.pot_min<=def.pot_default&&def.pot_default<=def.pot_max))
       ||!registry().emplace(def.id,def).second)std::abort();
    return true;
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
uint32_t nocpu_abi_version(){return 5;}
const char* nocpu_game_name(uint32_t game) {
    static const char* legacy[]={"pong","pongdoubles","spacerace","breakout","stuntcycle","indy4"};
    if(game<=NOCPU_INDY_4)return legacy[game];
    const auto* def=nocpu_registered_game(game);
    return def?def->name.c_str():nullptr;
}
uint32_t nocpu_game_info(uint32_t game,uint32_t field) {
    const auto* def=nocpu_registered_game(game);
    if(!def)return field==NOCPU_INFO_REGISTERED&&game<NOCPU_GAME_LIMIT?0:UINT32_MAX;
    switch(field) {
    case NOCPU_INFO_REGISTERED:return 1;
    case NOCPU_INFO_PADDLES:return def->paddles;
    case NOCPU_INFO_JOYSTICKS:return def->joysticks;
    case NOCPU_INFO_JOYSTICK_DIRECTIONS:return def->joystick_directions;
    case NOCPU_INFO_BUTTON_SLOTS:return def->button_slots;
    case NOCPU_INFO_BUTTONS:return def->buttons;
    case NOCPU_INFO_STARTS:return def->starts;
    case NOCPU_INFO_DEFAULT_DIP:return default_dip(*def);
    case NOCPU_INFO_DIP_MASK:return dip_mask(*def);
    case NOCPU_INFO_POT_MIN:return def->pot_min;
    case NOCPU_INFO_POT_MAX:return def->pot_max;
    case NOCPU_INFO_POT_DEFAULT:return def->pot_default;
    case NOCPU_INFO_SCORES:return uint32_t(def->scores.size());
    case NOCPU_INFO_COINS:return 1;
    case NOCPU_INFO_PORTRAIT:return def->portrait?1:0;
    case NOCPU_INFO_WHEELS:return def->wheels;
    default:return UINT32_MAX;
    }
}
uint32_t nocpu_rom_begin(uint32_t game) {
    if(engine) {rom_error=NOCPU_ROM_BUSY;return 0;}
    if(game>NOCPU_INDY_4&&!nocpu_registered_game(game)) {rom_error=NOCPU_ROM_GAME;return 0;}
    try {
        unsigned count=0;requirements(game,count);
        NoCPURomSession next;next.game=game;next.members.resize(count);
        staged_roms=std::move(next);rom_error=NOCPU_ROM_OK;return 1;
    } catch(...) {rom_error=NOCPU_ROM_MEMORY;return 0;}
}
uint8_t* nocpu_rom_buffer(uint32_t slot,uint32_t size) {
    if(engine) {rom_error=NOCPU_ROM_BUSY;return nullptr;}
    unsigned count=0;const auto* expected=requirements(staged_roms.game,count);
    if(slot>=count) {rom_error=NOCPU_ROM_SLOT;return nullptr;}
    if(size!=expected[slot].size) {rom_error=NOCPU_ROM_SIZE;return nullptr;}
    try {
        staged_roms.members[slot].assign(size,0);
        rom_error=NOCPU_ROM_OK;return staged_roms.members[slot].data();
    } catch(...) {rom_error=NOCPU_ROM_MEMORY;return nullptr;}
}
uint32_t nocpu_rom_finish() {
    if(engine) {rom_error=NOCPU_ROM_BUSY;return 0;}
    if(staged_roms.game>NOCPU_INDY_4&&!nocpu_registered_game(staged_roms.game)) {rom_error=NOCPU_ROM_GAME;return 0;}
    return valid_roms(staged_roms,staged_roms.game)?1:0;
}
uint32_t nocpu_rom_error(){return rom_error;}
uint32_t nocpu_create_game(uint32_t game,uint32_t seed,uint32_t dip,uint32_t pot_ohms){
    if(engine||!valid_options(game,dip,pot_ohms)||!valid_roms(staged_roms,game))return 0;
    try {
        std::srand(seed);
        // Each selected machine starts with cold original custom descriptors.
        // The original Space Race potentiometer updates C9 in its initial
        // custom-update callback and subsequent 250 ms polls. Configuration
        // changes current_val; the original chip still performs the C9.r write.
        const CircuitDesc* desc=nullptr;const char* name=nullptr;
        const NoCPUGameDef* def=nocpu_registered_game(game);
        if(def) {
            def->reset_descriptors();desc=def->circuit_for?def->circuit_for(dip):def->circuit();name=def->name.c_str();
            if(!configure_registered(*def,desc,dip,pot_ohms))return 0;
        } else if(game==NOCPU_PONG) {
            nocpu_reset_pong_descriptors();nocpu_configure_pong(dip);
            desc=circuit_pong();name="pong";
        } else if(game==NOCPU_PONG_DOUBLES) {
            nocpu_reset_pongdoubles_descriptors();nocpu_configure_pongdoubles(dip);
            desc=circuit_pongdoubles();name="pongdoubles";
        } else if(game==NOCPU_SPACE_RACE) {
            nocpu_reset_spacerace_descriptors();nocpu_configure_spacerace(dip,pot_ohms);
            desc=circuit_spacerace();name="spacerace";
        } else if(game==NOCPU_BREAKOUT) {
            nocpu_reset_breakout_descriptors();nocpu_configure_breakout(dip);
            desc=circuit_breakout();name="breakout";
        } else if(game==NOCPU_STUNT_CYCLE) {
            nocpu_reset_stuntcycle_descriptors();nocpu_configure_stuntcycle(dip);
            desc=circuit_stuntcycle();name="stuntcycle";
        } else {
            nocpu_reset_indy4_descriptors();nocpu_configure_indy4(pot_ohms);
            desc=circuit_indy4();name="indy4";
        }
        engine.reset(new Engine);
        engine->game=game;engine->dip=dip;engine->pot_ohms=pot_ohms;engine->def=def;
        // Registered games read each BUTTONSn_INPUT switch from its own held
        // joystick button, as Indy 4's Gas does below.
        if(def)for(unsigned slot=0;slot<def->button_slots;++slot) {
            auto& buttons=engine->settings.input.buttons[slot];
            buttons.button1=KeyAssignment(KeyAssignment::JOYSTICK_BUTTON,0,slot);
            buttons.button2=KeyAssignment(KeyAssignment::JOYSTICK_BUTTON,1,slot);
            // A wheel's held keys use joystick buttons 3 and 4 of its slot
            // (nocpu_wheel_keys), so a game with wheels leaves button 3 unassigned.
            buttons.button3=def->wheels?KeyAssignment():KeyAssignment(KeyAssignment::JOYSTICK_BUTTON,2,slot);
        }
        engine->roms=std::move(staged_roms);staged_roms=NoCPURomSession{};
        if(game==NOCPU_INDY_4)engine->settings.input.buttons[0].button1=
            KeyAssignment(KeyAssignment::JOYSTICK_BUTTON,0,0);
        engine->pcm.reserve(8192);
        engine->events.reserve(1024);
        engine->circuit.reset(new Circuit(engine->settings,engine->input,engine->video,desc,name));
        // The accepted original Qt reference client is 632x432. Original
        // keep-aspect cropping gives 576x432 landscape or 324x432 portrait.
        engine->video.video_init(632,432,engine->settings.video);
        // A registered game's declared raster must be the one its circuit makes.
        if(def&&engine->video.pixel_width()!=(def->portrait?324u:576u)) {engine.reset();return 0;}
        if(!observations_ready()) {engine.reset();return 0;}
        if(def&&def->sound) {
            // Levels at the end of construction; later transitions are fed by
            // the observation hook as the circuit runs.
            std::vector<int> levels;
            for(const auto& key:def->sound_pins)levels.push_back(pin(key));
            engine->sound.reset(def->sound(dip,pot_ohms));
            engine->sound->start(levels.data());
        }
        return 1;
    } catch(...) {engine.reset();return 0;}
}
uint32_t nocpu_create(uint32_t seed){return nocpu_create_game(NOCPU_PONG,seed,0,0);}
void nocpu_destroy(){engine.reset();staged_roms=NoCPURomSession{};rom_error=NOCPU_ROM_OK;}
uint32_t nocpu_reset(uint32_t seed){
    if(!engine)return 0;
    return nocpu_reset_config(seed,engine->dip,engine->pot_ohms);
}
uint32_t nocpu_reset_config(uint32_t seed,uint32_t dip,uint32_t pot_ohms){
    if(!engine||!valid_options(engine->game,dip,pot_ohms))return 0;
    uint32_t game=engine->game;
    NoCPURomSession roms=std::move(engine->roms);
    engine.reset();staged_roms=std::move(roms);
    return nocpu_create_game(game,seed,dip,pot_ohms);
}
uint32_t nocpu_game(){return engine?engine->game:UINT32_MAX;}
uint32_t nocpu_dip(){return engine?engine->dip:0;}
uint32_t nocpu_pot_ohms(){return engine?engine->pot_ohms:0;}
void nocpu_coin(uint32_t held){nocpu_coin_channel(1,held);}
uint32_t nocpu_coin_channel(uint32_t channel,uint32_t held) {
    if(!engine||channel<1||channel>5||(channel>1&&engine->game!=NOCPU_INDY_4))return 0;
    if(channel==1)engine->input.coin=held!=0;
    else engine->input.coin_extra[channel-2]=held!=0;
    return 1;
}
void nocpu_start(uint32_t held){nocpu_start_player(1,held);}
uint32_t nocpu_start_player(uint32_t player,uint32_t held){
    if(const auto* def=registered()) {
        if(player<1||player>def->starts)return 0;
        if(player==1)engine->input.start=held!=0;else engine->input.start2=held!=0;
        return 1;
    }
    if(!engine||engine->game==NOCPU_PONG||engine->game==NOCPU_INDY_4||player<1||player>2
       ||(player==2&&engine->game!=NOCPU_BREAKOUT&&engine->game!=NOCPU_STUNT_CYCLE))return 0;
    if(player==1)engine->input.start=held!=0;
    else engine->input.start2=held!=0;
    return 1;
}
uint32_t nocpu_serve(uint32_t held){
    if(!engine||engine->game!=NOCPU_BREAKOUT)return 0;
    engine->input.serve=held!=0;return 1;
}
void nocpu_paddle(uint32_t slot,int32_t axis){
    if(const auto* def=registered()) {
        if(slot<def->paddles)engine->input.axes[slot]=int16_t(std::max(-32768,std::min(32767,axis)));
        return;
    }
    if(engine&&engine->game<=NOCPU_BREAKOUT&&engine->game!=NOCPU_SPACE_RACE
       &&slot<(engine->game==NOCPU_PONG?2u:engine->game==NOCPU_BREAKOUT?1u:4u))
        engine->input.axes[slot]=int16_t(std::max(-32768,std::min(32767,axis)));
}
void nocpu_joystick(uint32_t slot,uint32_t up_held,uint32_t down_held){
    if(engine&&engine->game==NOCPU_SPACE_RACE&&slot<2) {
        engine->input.up[slot]=up_held!=0;engine->input.down[slot]=down_held!=0;
    }
}
uint32_t nocpu_joystick_switches(uint32_t slot,uint32_t up,uint32_t down,uint32_t left,uint32_t right) {
    const auto* def=registered();
    if(!def||slot>=def->joysticks)return 0;
    const uint32_t held=(up?1u:0u)|(down?2u:0u)|(left?4u:0u)|(right?8u:0u);
    if(held&~def->joystick_directions)return 0;
    engine->input.up[slot]=up!=0;engine->input.down[slot]=down!=0;
    engine->input.left[slot]=left!=0;engine->input.right[slot]=right!=0;
    return 1;
}
uint32_t nocpu_button(uint32_t slot,uint32_t button,uint32_t held) {
    const auto* def=registered();
    if(!def||slot>=def->button_slots||button<1||button>def->buttons)return 0;
    engine->input.buttons[slot][button-1]=held!=0;return 1;
}
uint32_t nocpu_throttle(int32_t axis) {
    if(!engine||engine->game!=NOCPU_STUNT_CYCLE)return 0;
    engine->settings.input.throttle[0].key=KeyAssignment(KeyAssignment::JOYSTICK_AXIS,1,0);
    engine->input.throttle_held=false;
    engine->input.axes[0]=int16_t(std::max(0,std::min(32767,axis)));return 1;
}
uint32_t nocpu_throttle_key(uint32_t held) {
    if(!engine||engine->game!=NOCPU_STUNT_CYCLE)return 0;
    engine->settings.input.throttle[0].key=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Throttle);
    engine->input.throttle_held=held!=0;return 1;
}
// Indy 4, or a registered game's declared WHEELn_INPUT slots.
static bool wheel_slot(uint32_t slot) {
    if(!engine)return false;
    if(const auto* def=registered())return slot<def->wheels&&slot<4;
    return engine->game==NOCPU_INDY_4&&slot<4;
}
uint32_t nocpu_wheel(uint32_t slot,int32_t axis) {
    if(!wheel_slot(slot))return 0;
    auto& wheel=engine->settings.input.wheel[slot];
    wheel.left=KeyAssignment(KeyAssignment::JOYSTICK_AXIS,0,slot);
    wheel.right=KeyAssignment(KeyAssignment::JOYSTICK_AXIS,1,slot);
    engine->input.axes[slot]=int16_t(std::max(-32768,std::min(32767,axis)));return 1;
}
uint32_t nocpu_wheel_keys(uint32_t slot,uint32_t left,uint32_t right) {
    if(!wheel_slot(slot))return 0;
    auto& wheel=engine->settings.input.wheel[slot];
    wheel.left=KeyAssignment(KeyAssignment::JOYSTICK_BUTTON,2,slot);
    wheel.right=KeyAssignment(KeyAssignment::JOYSTICK_BUTTON,3,slot);
    engine->input.buttons[slot][2]=left!=0;engine->input.buttons[slot][3]=right!=0;return 1;
}
uint32_t nocpu_buttons(uint32_t slot,uint32_t gas,uint32_t brake) {
    if(!engine||engine->game!=NOCPU_INDY_4||slot>=4)return 0;
    engine->input.buttons[slot][0]=gas!=0;engine->input.buttons[slot][1]=brake!=0;return 1;
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
    // Samples before the current circuit time are final: any later transition
    // happens at or after it.
    if(engine->sound)engine->sound->emit_before(now());
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
    if(const auto* def=registered())return slot<def->scores.size()?terms(def->scores[slot]):0;
    if(!engine||slot>(engine->game==NOCPU_INDY_4?3u:1u))return 0;
    if(engine->game==NOCPU_PONG)return bcd(slot==0?"C7":"D7")+10*pin(slot==0?"C8.3":"C8.5");
    if(engine->game==NOCPU_PONG_DOUBLES)return bcd(slot==0?"C8":"D8")+10*pin(slot==0?"C9.3":"C9.5");
    if(engine->game==NOCPU_BREAKOUT)return bcd9310(slot==0?"H6":"N6")
        +10*bcd9310(slot==0?"J6":"M6")+100*bcd9310(slot==0?"K6":"L6");
    if(engine->game==NOCPU_STUNT_CYCLE)return binary192(slot==0?"B8":"B9")+10*pin(slot==0?"A9.9":"A9.5");
    if(engine->game==NOCPU_INDY_4) {
        // Source H1 mux feeds7448 (GND,A,B,C) units and(D,E,F,GND) tens.
        const uint32_t code=indy_display_code(slot);
        return 2*(code&7)+10*(code>>3);
    }
    return bcd(slot==0?"J9":"L9")+10*bcd(slot==0?"H9":"K9");
}
uint32_t nocpu_hits(){return engine?engine->hits:0;}
uint32_t nocpu_run_n(){
    if(const auto* def=registered())return pin(def->active)?0:1;
    if(engine&&engine->game==NOCPU_SPACE_RACE)return !pin("C9.3");
    if(engine&&engine->game==NOCPU_INDY_4)return !pin("COIN.H1.10");
    if(engine&&engine->game==NOCPU_STUNT_CYCLE)return !pin("D9.9");
    return pin("LATCH.3");
}
uint32_t nocpu_attract_n(){
    if(const auto* def=registered())return def->attract_n.empty()?UINT32_MAX:uint32_t(pin(def->attract_n));
    if(engine&&engine->game==NOCPU_SPACE_RACE)return UINT32_MAX;
    if(engine&&engine->game==NOCPU_BREAKOUT)return pin("E6.9");
    if(engine&&engine->game==NOCPU_STUNT_CYCLE)return pin("D9.9");
    if(engine&&engine->game==NOCPU_INDY_4)return UINT32_MAX;
    return pin(engine&&engine->game==NOCPU_PONG_DOUBLES?"D2.4":"D2.1");
}
uint32_t nocpu_active(){
    if(!engine)return 0;
    if(const auto* def=registered())return pin(def->active)!=0;
    if(engine->game==NOCPU_PONG_DOUBLES)return pin("D2.4")!=0;
    if(engine->game==NOCPU_SPACE_RACE)return pin("C9.3")!=0;
    if(engine->game==NOCPU_BREAKOUT)return pin("E6.9")!=0;
    if(engine->game==NOCPU_STUNT_CYCLE)return pin("D9.9")!=0;
    if(engine->game==NOCPU_INDY_4)return pin("COIN.H1.10")!=0;
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
uint32_t nocpu_stuntcycle_signal(uint32_t signal) {
    if(!engine||engine->game!=NOCPU_STUNT_CYCLE)return UINT32_MAX;
    const char* keys[]={"D9.9","H6.8","N9.11","N7.5","K7.6","K7.9"};
    if(signal<6)return signal==4?1-pin(keys[signal]):pin(keys[signal]);
    if(signal==6)return binary192("E5");
    if(signal==7)return pin("LATCH.3");
    return UINT32_MAX;
}
uint32_t nocpu_stuntcycle_throttle() {
    return engine&&engine->game==NOCPU_STUNT_CYCLE?nocpu_stuntcycle_throttle_value():UINT32_MAX;
}
uint32_t nocpu_indy4_signal(uint32_t slot,uint32_t signal) {
    if(!engine||engine->game!=NOCPU_INDY_4)return UINT32_MAX;
    const char* globals[]={"COIN.H1.10","COIN.H1.1","COIN.CAP35.2"};
    if(signal<3)return pin(globals[signal]);
    if(slot>=4)return UINT32_MAX;
    const char* attract[]={"COIN.F4.6","COIN.F4.3","COIN.F4.8","COIN.F4.11"};
    if(signal==3)return pin(attract[slot]);
    std::string car=cars[slot];
    if(signal==4)return pin(car+"L1.3");
    if(signal==5)return pin(car+"E2.6")+2*pin(car+"E2.7")+4*pin(car+"F2.3")+8*pin(car+"F2.2")+16*pin(car+"F2.6");
    if(signal==6)return pin(car+"C2.3")+2*pin(car+"C2.2")+4*pin(car+"C2.6")+8*pin(car+"C2.7")+16*pin(car+"A1.5");
    if(signal==7)return pin(car+"K3.13")+2*pin(car+"K3.12")+4*pin(car+"K3.11");
    if(signal==8)return indy_display_code(slot);
    return UINT32_MAX;
}
uint32_t nocpu_game_event_count(uint32_t event) {
    const bool stunt=engine&&engine->game==NOCPU_STUNT_CYCLE&&event>=NOCPU_STUNT_ATTRACT_N&&event<=NOCPU_STUNT_BAD_JUMP;
    const bool indy=engine&&engine->game==NOCPU_INDY_4&&event>=NOCPU_INDY_PLAY&&event<=NOCPU_INDY_CHECKPOINT_RED_N;
    return stunt||indy?engine->event_counts[event]:UINT32_MAX;
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
