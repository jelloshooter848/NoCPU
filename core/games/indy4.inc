// SPDX-License-Identifier: GPL-3.0-or-later
void nocpu_reset_indy4_descriptors() {
    carl1_555_desc=Mono555Desc(K_OHM(82),U_FARAD(5));
    coinl1_555_desc=Astable555Desc(K_OHM(720.0),K_OHM(220.0),U_FARAD(1.0));
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(720.0);
    // cirque has no safe assignment operator. Clear each owned queue in place.
    wheel1_desc.angle=wheel2_desc.angle=wheel3_desc.angle=wheel4_desc.angle=0.0;
    for(unsigned i=0;i<2;++i) {
        wheel1_desc.wheel_events[i].clear();wheel2_desc.wheel_events[i].clear();
        wheel3_desc.wheel_events[i].clear();wheel4_desc.wheel_events[i].clear();
    }
    carcap27_desc=CapacitorDesc(P_FARAD(100));
    carcap31_desc=CapacitorDesc(P_FARAD(100));
    carcap32_desc=CapacitorDesc(P_FARAD(100));
    coincap35_desc=CapacitorDesc(U_FARAD(0.1));
    scorecap08_desc=CapacitorDesc(P_FARAD(33));
    scorecap10_desc=CapacitorDesc(U_FARAD(0.001));
    scorecap11_desc=CapacitorDesc(U_FARAD(0.001));
    scorecap12_desc=CapacitorDesc(U_FARAD(0.001));
    scorecap13_desc=CapacitorDesc(U_FARAD(0.001));
    scorecap14_desc=CapacitorDesc(U_FARAD(0.001));
    synccap01_desc=CapacitorDesc(P_FARAD(330));
}
void nocpu_configure_indy4(unsigned pot_ohms) {
    ((PotentiometerBase*)&pot1_desc)->current_val=double(pot_ohms);
}
