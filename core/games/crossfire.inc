// SPDX-License-Identifier: GPL-3.0-or-later
// Appended to the prepared games/crossfire.cpp (and crossfire.h): restore every
// mutable static descriptor to its original cold value before a new machine is
// built. The FIRE_SOUND_CV chips write the M9/L9 astables' ctrl voltage and keep
// their capacitor voltage in the (non-static) FireSoundDesc objects, whose
// cap_v the original leaves to static zero-initialization; the potentiometer
// writes N9.r, which the 555 and the custom GNE timer both read. The function-
// local statics of crossfire.h (t_lres, RC, RC_EXP, TC) are constants.
void nocpu_reset_crossfire_descriptors() {
    a6_desc=Mono9602Desc(K_OHM(12.0),U_FARAD(5.0),K_OHM(12.0),U_FARAD(5.0));
    a7_desc=Mono555Desc(M_OHM(6.8),U_FARAD(0.1));
    n9_desc=Mono555Desc(K_OHM(1180.0),U_FARAD(100.0));
    m9_desc=Astable555Desc(K_OHM(47.0),K_OHM(3.3),U_FARAD(0.1));
    l9_desc=Astable555Desc(K_OHM(47.0),K_OHM(3.3),U_FARAD(0.1));
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(1180.0);
    fire1_desc.cap_v=0.0;fire1_desc.desc=&m9_desc;
    fire2_desc.cap_v=0.0;fire2_desc.desc=&l9_desc;
    cap12_desc=CapacitorDesc(U_FARAD(0.001));
    cap27_desc=CapacitorDesc(U_FARAD(0.001));
    cap29_desc=CapacitorDesc(U_FARAD(0.1));
    cap36_desc=CapacitorDesc(U_FARAD(0.001));
    capx_desc=CapacitorDesc(U_FARAD(0.001));
}
