// SPDX-License-Identifier: GPL-3.0-or-later
// Appended to the prepared games/sharkjaws.cpp: restore every mutable static
// descriptor to its original cold value before a new machine is built. The
// potentiometer writes N9A.r; the DIP switch holds its state. The RomDesc
// descriptors hold no state: their bytes come from the core's ROM session.
void nocpu_reset_sharkjaws_descriptors() {
    cap35_desc=CapacitorDesc(P_FARAD(470));
    c9a_555_desc=Mono555Desc(K_OHM(470.0),U_FARAD(1.0));
    c9b_555_desc=Astable555Desc(K_OHM(470.0),K_OHM(15.0),U_FARAD(1.0));
    n9a_555_desc=Mono555Desc(K_OHM(970.0),U_FARAD(100.0));
    n9b_555_desc=Astable555Desc(K_OHM(4.7),K_OHM(680.0),U_FARAD(0.22));
    n8_555_desc=Mono555Desc(K_OHM(220.0),U_FARAD(100.0));
    ((DipswitchBase*)&dipswitch1_desc)->state=0;
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(970.0);
}
