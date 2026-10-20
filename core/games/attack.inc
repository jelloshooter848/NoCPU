// SPDX-License-Identifier: GPL-3.0-or-later
// Appended to the prepared games/attack.cpp: restore every mutable static
// descriptor to its original cold value before a new machine is built. The
// mixer keeps its capacitor state in mixer_desc, so its cold copy is taken at
// static initialization, before any machine runs. The potentiometer writes
// E13's resistance. The RomDesc descriptors hold no state: their bytes come
// from the core's ROM session.
static const MixerDesc nocpu_cold_attack_mixer=mixer_desc;
void nocpu_reset_attack_descriptors() {
    a5_555_desc=Astable555Desc(K_OHM(68.0),K_OHM(30.0),U_FARAD(1.2));
    j3_555_desc=Astable555Desc(K_OHM(220.0),K_OHM(30.0),U_FARAD(1.2));
    m4_555_desc=Astable555Desc(K_OHM(18.0),K_OHM(3.3),U_FARAD(33));
    l13_desc=Mono74123Desc(K_OHM(82.0),U_FARAD(0.1),K_OHM(30.0),U_FARAD(0.22));
    e13_555_desc=Astable555Desc(K_OHM(2500.0),K_OHM(0.33),U_FARAD(33.0));
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(2500.0);
    for(SeriesRCDesc* rc:{&c27_desc,&c28_desc,&c36_desc,&c37_desc,&c38_desc,&c57_desc,&c31_desc,&c39_desc,&c42_desc})
        *rc=SeriesRCDesc(K_OHM(0.33),P_FARAD(330.0));
    mixer_desc=nocpu_cold_attack_mixer;
}
