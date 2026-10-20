// SPDX-License-Identifier: GPL-3.0-or-later
// Appended to the prepared games/antiaircraft.cpp: restore every mutable
// static descriptor to its original cold value before a new machine is built.
// The potentiometer writes D9.r; the DIP switches hold their state. k1_desc
// (RomDesc) holds no state: its bytes come from the core's ROM session. The
// RANDOM_CLOCK_GEN chip keeps no state of its own; its random periods come
// from nocpu_glibc_rand(), reseeded at every creation (core/api.cpp).
void nocpu_reset_antiaircraft_descriptors() {
    b1_desc=Mono9602Desc(K_OHM(9.1),U_FARAD(100.0),K_OHM(9.1),U_FARAD(100.0));
    c1_desc=Mono9602Desc(K_OHM(15.0),U_FARAD(5.0),K_OHM(15.0),U_FARAD(5.0));
    e1_desc=Mono9602Desc(K_OHM(33.0),U_FARAD(47.0),K_OHM(27.0),P_FARAD(100.0));
    d9_555_desc=Mono555Desc(K_OHM(610.0),U_FARAD(100.0));
    ((DipswitchBase*)&dipswitch1_desc)->state=0;
    ((DipswitchBase*)&dipswitch2_desc)->state=0;
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(830.0);
}
