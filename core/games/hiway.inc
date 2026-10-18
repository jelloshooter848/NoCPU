// SPDX-License-Identifier: GPL-3.0-or-later
// Appended to the prepared games/highway.cpp (DICE ID "hiway"): restore every
// mutable static descriptor to its original cold value before a new machine
// is built.
void nocpu_reset_hiway_descriptors() {
    e9_555_desc=Astable555Desc(K_OHM(510.0),K_OHM(470.0),U_FARAD(10.0));
    ((PotentiometerBase*)&e9pot_desc)->current_val=K_OHM(510.0);
    capa28_desc=CapacitorDesc(P_FARAD(470));
    capc36_desc=CapacitorDesc(P_FARAD(100));
    capd34_desc=CapacitorDesc(P_FARAD(100));
    capd63_desc=CapacitorDesc(N_FARAD(10));
    capf68_desc=CapacitorDesc(P_FARAD(100));
    capf77_desc=CapacitorDesc(P_FARAD(100));
    capf96_desc=CapacitorDesc(N_FARAD(1));
    cap10_desc=CapacitorDesc(N_FARAD(1));
    cap11_desc=CapacitorDesc(N_FARAD(1));
    cap12_desc=CapacitorDesc(P_FARAD(100));
    cap14_desc=CapacitorDesc(N_FARAD(1),OHM(180));
    sw_ext_play=Dipswitch4SP4TDesc("ext_play","Extended Play Score",6,"None",
        "10","20","30","40","50","60","70","80","90","100","110","120","130","140","150");
    sw_k4l4=DipswitchDesc("concurrent_traffic","Concurrent Traffic",0,"Regular","Double");
    sw_h6n4=DipswitchDesc("opposing_traffic","Opposing Traffic",0,"Regular","Double");
    e1_desc=Ram2533Desc();
    // cirque has no safe assignment operator: clear each owned queue in place.
    wheel1_desc.angle=0.0;
    wheel1_desc.wheel_events[0].clear(); wheel1_desc.wheel_events[1].clear();
    buf1_desc=BufferDesc(DELAY_NS(40.0),DELAY_NS(40.0));
    buf2_desc=BufferDesc(DELAY_NS(25.0),DELAY_NS(25.0));
    buf3_desc=BufferDesc(DELAY_NS(25.0),DELAY_NS(25.0));
    // HighwaySpeedDesc has const members (no assignment); its chip's init call
    // zeroes both voltages, and these are its only mutable fields.
    speed_desc.v_cap=0.0; speed_desc.v_555=0.0;
}
