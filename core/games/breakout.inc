// SPDX-License-Identifier: GPL-3.0-or-later
// Copy the original cold static mixer, including its private capacitor state.
// RAM82S16 is an original static array, not a ROM or per-Chip allocation.
static const MixerDesc nocpu_cold_breakout_mixer=mixer_desc;
void nocpu_reset_breakout_descriptors() {
    b2_555_desc=Astable555Desc(OHM(560.0),M_OHM(1.8),U_FARAD(0.1));
    c9_555_desc=Mono555Desc(OHM(47.0),U_FARAD(1.0));
    for(auto& bit:l3_desc) bit=0;
    mixer_desc=nocpu_cold_breakout_mixer;
    pad1_desc=Paddle1HorizontalDesc(15047.0,47.0,&c9_555_desc);
    c32_desc=CapacitorDesc(U_FARAD(0.1));
    c36_desc=CapacitorDesc(N_FARAD(1.0));
    c37_desc=CapacitorDesc(P_FARAD(330.0));
    pad_en_buf_desc=BufferDesc(DELAY_NS(15.0),DELAY_NS(15.0));
    // Original 9602 descriptors hold fixed RC values; their callbacks update
    // newly allocated Chip delays, rather than accumulating descriptor state.
    n8_desc=Mono9602Desc(K_OHM(33.0),U_FARAD(100.0),K_OHM(5.6),P_FARAD(0.0));
    f3_desc=Mono9602Desc(K_OHM(47.0),U_FARAD(1.0),K_OHM(47.0),U_FARAD(1.0));
    a7_desc=Mono9602Desc(K_OHM(68.0),U_FARAD(1.0),K_OHM(22.0),U_FARAD(10.0));
    a8_desc=Mono9602Desc(K_OHM(27.0),U_FARAD(1.0),K_OHM(27.0),U_FARAD(1.0));
    ((DipswitchBase*)&dipswitch1_desc)->state=3;
    ((DipswitchBase*)&dipswitch2_desc)->state=0;
    ((DipswitchBase*)&dipswitch3_desc)->state=0;
    ((DipswitchBase*)&dipswitch4_desc)->state=0;
}
void nocpu_configure_breakout(unsigned packed_dips) {
    ((DipswitchBase*)&dipswitch1_desc)->state=packed_dips&15;
    ((DipswitchBase*)&dipswitch2_desc)->state=(packed_dips>>4)&1;
    ((DipswitchBase*)&dipswitch3_desc)->state=(packed_dips>>5)&1;
    ((DipswitchBase*)&dipswitch4_desc)->state=(packed_dips>>6)&1;
}
