// SPDX-License-Identifier: GPL-3.0-or-later
// Appended to the prepared games/gotcha.cpp: restore every mutable static
// descriptor to its original cold value before a new machine is built. The
// PROXIMITY chip writes e8_555_desc.ctrl from its capacitor voltage, which the
// original keeps in a function-local `static double v_cap`; tools/prepare-core.py
// moves that one variable to file scope (nocpu_gotcha_proximity_v_cap, see
// docs/UPSTREAM_PATCHES.md) so that it can be restored here. The potentiometer
// writes d8_555_desc.r1. The two mixers keep their capacitor state in their
// (non-static) descriptors; the copies below are taken at static initialization.
static const MixerDesc nocpu_cold_gotcha_mixer1=mixer1_desc;
static const MixerDesc nocpu_cold_gotcha_mixer2=mixer2_desc;
void nocpu_reset_gotcha_descriptors() {
    b8_555_desc=Mono555Desc(K_OHM(82.0),U_FARAD(1.0));
    c8_555_desc=Mono555Desc(K_OHM(82.0),U_FARAD(1.0));
    k10_555_desc=Mono555Desc(K_OHM(100.0),U_FARAD(1.0));
    d8_555_desc=Astable555Desc(K_OHM(297.0),K_OHM(2.0),U_FARAD(5.0));
    e8_555_desc=Astable555Desc(K_OHM(200.0),K_OHM(100.0),U_FARAD(1.0));
    b7_desc=Mono9602Desc(K_OHM(47.0),U_FARAD(0.5),K_OHM(47.0),U_FARAD(50.0));
    buf1_desc=BufferDesc(DELAY_NS(30.0),DELAY_NS(30.0));
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(297.0);
    mixer1_desc=nocpu_cold_gotcha_mixer1;
    mixer2_desc=nocpu_cold_gotcha_mixer2;
    nocpu_gotcha_proximity_v_cap=0.0;
}
