// SPDX-License-Identifier: GPL-3.0-or-later
// Appended to the prepared games/tvbasketball.cpp: restore every mutable static
// descriptor to its original cold value before a new machine is built. The
// potentiometer writes _9d_555_desc.r1. The VIDEO_DESC, INPUT_DESC and the two
// DIODE_LAYOUT tables are constant.
void nocpu_reset_tvbasketball_descriptors() {
    _5h_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(0.1));
    _5f_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(0.1));
    _3h_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(0.1));
    _3f_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(0.1));
    _12a_555_desc=Mono555Desc(K_OHM(220.0),U_FARAD(3.3));
    _3b_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(4.7));
    _14g_555_desc=Mono555Desc(K_OHM(330.0),U_FARAD(0.22));
    _9d_555_desc=Astable555Desc(K_OHM(40.0),K_OHM(15.0),U_FARAD(22.0));
    pad1_desc=Paddle1VerticalDesc(4000.0,94000.0,&_5h_555_desc);
    pad2_desc=Paddle2VerticalDesc(4000.0,94000.0,&_3f_555_desc);
    pad3_desc=Paddle3VerticalDesc(4000.0,94000.0,&_3h_555_desc);
    pad4_desc=Paddle4VerticalDesc(4000.0,94000.0,&_5f_555_desc);
    c1_desc=CapacitorDesc(U_FARAD(0.001));
    c2_desc=CapacitorDesc(U_FARAD(0.001));
    c3_desc=CapacitorDesc(U_FARAD(0.001));
    c4_desc=CapacitorDesc(U_FARAD(0.001));
    c5_desc=CapacitorDesc(U_FARAD(0.001));
    c6_desc=CapacitorDesc(P_FARAD(100.0));
    c7_desc=CapacitorDesc(U_FARAD(0.01));
    buf1_desc=BufferDesc(DELAY_NS(25.0),DELAY_NS(25.0));
    buf2_desc=BufferDesc(DELAY_NS(25.0),DELAY_NS(25.0));
    rc1_desc=SeriesRCDesc(OHM(220.0),U_FARAD(350.0));
    rc2_desc=SeriesRCDesc(OHM(220.0),U_FARAD(470.0));
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(35.0);
}
