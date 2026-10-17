// SPDX-License-Identifier: GPL-3.0-or-later
static const PWM555Desc nocpu_cold_d9(K_OHM(151.0),U_FARAD(0.1));
static const RCFilterDesc nocpu_cold_c25(K_OHM(470.0),K_OHM(470.0),U_FARAD(0.1));
static const RCFilterDesc nocpu_cold_c19(K_OHM(470.0),K_OHM(470.0),U_FARAD(0.1));
static const RCFilterDesc nocpu_cold_c32(K_OHM(25.2),K_OHM(25.2),U_FARAD(4.7));
static const NE566Desc nocpu_cold_a4(K_OHM(6.8),U_FARAD(0.1));
static const NE566Desc nocpu_cold_b4(K_OHM(10.0),U_FARAD(0.1));
static const NE566Desc nocpu_cold_c4(K_OHM(10.0),U_FARAD(0.1));
static const MixerDesc nocpu_cold_mixer({K_OHM(10.0),K_OHM(10.0),K_OHM(4.7)},0.0,U_FARAD(0.1));
void nocpu_reset_spacerace_descriptors() {
    a3_555_desc=Mono555Desc(K_OHM(6.8)+K_OHM(6.8),U_FARAD(4.7));
    a6_555_desc=Mono555Desc(K_OHM(330.0),U_FARAD(4.7));
    a9_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(0.1));
    b6_555_desc=Mono555Desc(K_OHM(330.0),U_FARAD(4.7));
    c9_555_desc=Mono555Desc(K_OHM(1000.0),U_FARAD(100.0));
    d9_555_desc=nocpu_cold_d9;
    l4_desc=Mono9602Desc(K_OHM(10.0),P_FARAD(100.0),K_OHM(10.0),P_FARAD(100.0));
    dipswitch1_desc=DipswitchDesc("coinage","Coinage",0,"1 Coin / 1 Credit","1 Coin / 2 Credits");
    // Preserve the original reference binding. The original potentiometer
    // chip updates C9.r at initialization and on its subsequent 250 ms polls.
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(970.0);
    coin_cap_desc=SeriesRCDesc(K_OHM(1.0),U_FARAD(0.1));
    c25_filter_desc=nocpu_cold_c25;c19_filter_desc=nocpu_cold_c19;c32_filter_desc=nocpu_cold_c32;
    a4_566_desc=nocpu_cold_a4;b4_566_desc=nocpu_cold_b4;c4_566_desc=nocpu_cold_c4;
    mixer_desc=nocpu_cold_mixer;
}
void nocpu_configure_spacerace(unsigned dip,unsigned pot_ohms) {
    ((DipswitchBase*)&dipswitch1_desc)->state=dip;
    ((PotentiometerBase*)&pot1_desc)->current_val=double(pot_ohms);
}
