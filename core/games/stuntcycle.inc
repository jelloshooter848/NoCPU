// SPDX-License-Identifier: GPL-3.0-or-later
void nocpu_reset_stuntcycle_descriptors() {
    stunt_cycle_throttle_desc={0.0,0.0,0};
    c57_desc=CapacitorDesc(P_FARAD(220.0),OHM(330.0));
    c58_desc=CapacitorDesc(P_FARAD(220.0));
    n6_desc=Mono9602Desc(K_OHM(47.0),U_FARAD(100.0),K_OHM(47.0),U_FARAD(1.0));
    c13_desc=SeriesRCDesc(K_OHM(2.2),P_FARAD(470.0));
    ((DipswitchBase*)&f5_desc)->state=4;
    ((DipswitchBase*)&f7_desc)->state=9;
    ((DipswitchBase*)&dipswitch1_desc)->state=0;
    ((DipswitchBase*)&dipswitch2_desc)->state=0;
}
void nocpu_configure_stuntcycle(unsigned dip) {
    ((DipswitchBase*)&f5_desc)->state=dip&7;
    ((DipswitchBase*)&f7_desc)->state=(dip>>3)&15;
    ((DipswitchBase*)&dipswitch1_desc)->state=(dip>>7)&1;
    ((DipswitchBase*)&dipswitch2_desc)->state=(dip>>8)&1;
}
unsigned nocpu_stuntcycle_throttle_value() {
    return unsigned(stunt_cycle_throttle_desc.throttle_pos*1000.0+0.5);
}
