// SPDX-License-Identifier: GPL-3.0-or-later
// Appended to the prepared games/pinpong.cpp: restore every mutable static
// descriptor to its original cold value before a new machine is built. The
// VIDEO_DESC (rotated 90 degrees) and INPUT_DESC are constant.
void nocpu_reset_pinpong_descriptors() {
    a5_desc=Mono9602Desc(K_OHM(4.7),P_FARAD(220.0),K_OHM(15.0),U_FARAD(5.0));
    cap1_desc=CapacitorDesc(P_FARAD(220.0));
    cap2_desc=CapacitorDesc(P_FARAD(220.0));
    cap3_desc=CapacitorDesc(P_FARAD(220.0));
    cap4_desc=CapacitorDesc(P_FARAD(110.0));
    cap5_desc=CapacitorDesc(P_FARAD(220.0));
    dipswitch1_desc=DipswitchDesc("coinage","Coinage",0,"1 Coin / 1 Credit","1 Coin / 2 Credits");
    dipswitch2_desc=DipswitchDesc("free_ball","Free Ball",0,"Enabled","Disabled");
    dipswitch3_desc=DipswitchDesc("ball_count","Ball Count",0,"3","5");
}
