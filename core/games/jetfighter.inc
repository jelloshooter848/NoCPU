// SPDX-License-Identifier: GPL-3.0-or-later
#include <cstring>
// Appended to the prepared games/jetfighter.cpp: restore every mutable static
// descriptor to its original cold value before a new machine is built. The
// two 8225 RAMs keep their contents in the static m8_desc/n8_desc arrays,
// which the original leaves to static zero-initialization; the potentiometer
// writes K9's resistance; the DIP switch holds its state. The RomDesc
// descriptors hold no state: their bytes come from the core's ROM session.
void nocpu_reset_jetfighter_descriptors() {
    std::memset(m8_desc,0,sizeof(m8_desc));
    std::memset(n8_desc,0,sizeof(n8_desc));
    k9_555_desc=Astable555Desc(K_OHM(510.0),K_OHM(470.0),U_FARAD(10.0));
    ((DipswitchBase*)&dipswitch1_desc)->state=0;
    ((PotentiometerBase*)&pot1_desc)->current_val=K_OHM(510.0);
}
