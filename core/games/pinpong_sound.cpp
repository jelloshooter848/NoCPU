// SPDX-License-Identifier: GPL-3.0-or-later
// Pin Pong sound board reconstruction (see pinpong_sound.h and
// docs/PINPONG_SOUND.md). Every constant names its schematic part or its
// data-sheet source.
#include "pinpong_sound.h"
#include <cmath>

namespace nocpu_pinpong {
namespace {
// Supplies: "+14V TO SOUND CIRCUIT" (Q6 2N5190 regulator, D21 15V zener).
constexpr double V_PLUS=14.0;
// C10 NE566: R1 2.2K (pin 6), C1 C26 0.22 uF Mylar (pin 7).
// f = 2 (V+ - Vc) / (R1 C1 V+), the NE566 data-sheet relation.
constexpr double R1=2200.0, C1=0.22e-6;
constexpr double HZ_PER_VOLT=2.0/(R1*C1*V_PLUS);
// Pin 5 network: +14V - R41 TONE (rheostat) - R49 220R - node; each latched
// D9 Q-bar (low, 0.2 V as DICE's TTL low) pulls the node down through a
// 1N914 (0.65 V) and its resistor.
constexpr double R49=220.0, V_PULL=0.2+0.65;
constexpr double R_LATCH[4]={15000.0 /*R47*/,12000.0 /*R48*/,4700.0 /*R46*/,27000.0 /*R45*/};
// NE566 triangle output (pin 4), 2.4 Vpp typical; R43 100R / R42 4.7K divider.
constexpr double TRIANGLE_PEAK=1.2, DIVIDER=4700.0/4800.0;
// B10 MFC6040 (MC3340P data): control pin Thevenin source fitted from the
// data sheet's Fig. 3 and Fig. 4 (7.39 V through 4.7 kOhm at 16 V), scaled to
// V+ = 14 V; +13 dB maximum gain; 7.7 Vpp output swing at 14 V (Fig. 6).
constexpr double V_OPEN=7.39*V_PLUS/16.0, R_CONTROL=4700.0, MAX_GAIN_DB=13.0, OUT_PEAK=7.7/2.0;
// C33 100 uF "DECAY" on the control pin.
constexpr double C33=100e-6, TAU=R_CONTROL*C33;
// Q5 2N3643 (data-sheet minimum hFE 100) driven from F1.Q (3.4 V) through
// R53 1K: a 270 mA collector sink, saturating at about 0.1 V.
constexpr double Q5_CURRENT=100.0*(3.4-0.7)/1000.0, Q5_SAT=0.1;
// PCM scale: volts at the attenuator output to signed 16-bit samples
// (+-3.85 V full drive gives +-15400, about Pong's loudest level).
constexpr double PCM_PER_VOLT=4000.0;
constexpr double PS=1e-12;

double exp_neg_small(double x) { // e^-x for 0 <= x <= 1/16, Taylor to x^10
    double term=1.0,sum=1.0;
    for(int n=1;n<=10;++n){term*=-x/double(n);sum+=term;}
    return sum;
}
}

double exp_det(double x) {
    if(x>0.0)return 1.0/exp_det(-x);
    double y=-x;int squarings=0;
    while(y>0.0625&&squarings<20){y*=0.5;++squarings;}
    double r=exp_neg_small(y);
    for(int i=0;i<squarings;++i)r*=r;
    return r;
}

// MC3340P Fig. 3 (attenuation versus DC control voltage), read at the
// solid 12 V and 16 V curves and interpolated to 14 V; +-0.1 V reading
// tolerance. Beyond the last point the slope continues, capped at 100 dB.
double attenuation_db(double v) {
    static const double volts[]={3.80,4.07,4.56,5.11,5.67};
    static const double db[]={0.0,20.0,40.0,60.0,80.0};
    if(v<=volts[0])return 0.0;
    for(int i=1;i<5;++i)if(v<=volts[i])
        return db[i-1]+(db[i]-db[i-1])*(v-volts[i-1])/(volts[i]-volts[i-1]);
    double a=db[4]+(db[4]-db[3])*(v-volts[4])/(volts[4]-volts[3]);
    return a>100.0?100.0:a;
}

SoundBoard::SoundBoard(uint32_t tone_ohms)
    :v_c33(V_OPEN),phase(0.0),frequency(0.0),v_control(V_PLUS),latch{false,false,false,false},q8_on(false),
     r_top(double(tone_ohms)+R49),decay_per_sample(exp_det(-double(SAMPLE_PERIOD_PS)*PS/TAU)),
     time_ps(0),next_sample_ps(SAMPLE_PERIOD_PS),levels{} {}

void SoundBoard::start(const int initial[PIN_COUNT]) {
    for(unsigned i=0;i<PIN_COUNT;++i)levels[i]=initial[i]?1:0;
    q8_on=levels[F1_Q];
    latch[0]=levels[LATCH_SLING];latch[1]=levels[LATCH_100];latch[2]=levels[LATCH_1000];
    latch[3]=!levels[FLIPPER_PRE_N];
    retune();
}

void SoundBoard::retune() {
    // Node voltage: +14 V through r_top against every conducting pull-down.
    double conductance=1.0/r_top,current=V_PLUS/r_top;
    for(int i=0;i<4;++i)if(latch[i]){conductance+=1.0/R_LATCH[i];current+=V_PULL/R_LATCH[i];}
    v_control=current/conductance;
    frequency=v_control<V_PLUS?HZ_PER_VOLT*(V_PLUS-v_control):0.0;
}

void SoundBoard::integrate(uint64_t dt_ps) {
    if(!dt_ps)return;
    const double seconds=double(dt_ps)*PS;
    phase+=frequency*seconds;
    phase-=std::floor(phase);
    if(q8_on) {
        v_c33-=Q5_CURRENT/C33*seconds;
        if(v_c33<Q5_SAT)v_c33=Q5_SAT;
    } else {
        const double decay=dt_ps==SAMPLE_PERIOD_PS?decay_per_sample:exp_det(-seconds/TAU);
        v_c33=V_OPEN-(V_OPEN-v_c33)*decay;
    }
}

int16_t SoundBoard::sample() const {
    const double triangle=phase<0.5?4.0*phase-1.0:3.0-4.0*phase;
    const double input=TRIANGLE_PEAK*DIVIDER*triangle;
    const double gain=exp_det((MAX_GAIN_DB-attenuation_db(v_c33))*0.11512925464970229); // ln(10)/20
    double out=gain*input;
    if(out>OUT_PEAK)out=OUT_PEAK;
    if(out<-OUT_PEAK)out=-OUT_PEAK;
    return int16_t(out*PCM_PER_VOLT);
}

void SoundBoard::emit_before(uint64_t bound,SampleSink sink) {
    while(next_sample_ps<bound) {
        integrate(next_sample_ps-time_ps);
        time_ps=next_sample_ps;
        sink(time_ps,sample());
        next_sample_ps+=SAMPLE_PERIOD_PS;
    }
}

void SoundBoard::pin(unsigned index,int value,uint64_t at,SampleSink sink) {
    if(index>=PIN_COUNT)return;
    value=value?1:0;
    emit_before(at,sink);
    integrate(at-time_ps);
    time_ps=at;
    const int previous=levels[index];
    levels[index]=value;
    switch(index) {
    case F1_Q:q8_on=value;break;
    case LATCH_SLING:latch[0]=value;break;
    case LATCH_100:latch[1]=value;break;
    case LATCH_1000:latch[2]=value;break;
    // D9-1 pins 8-13 (pruned by DICE because nothing reads it): /PRE C8.3,
    // D GND, CLK D8.8, /CLR VCC, as wired in the original netlist.
    case FLIPPER_PRE_N:if(!value)latch[3]=true;break;
    case ANY_HIT:if(value&&!previous&&levels[FLIPPER_PRE_N])latch[3]=false;break;
    }
    retune();
}

}
