// SPDX-License-Identifier: GPL-3.0-or-later
// Host acquisition adapter for DICE RomDesc. PROM LUT/chip logic is unchanged.
#include <stdint.h>
#include "chips/rom.h"
#include "rom_session.h"
uint8_t RomDesc::get_data(const RomDesc* rom,unsigned offset) {
    return nocpu_rom_read(rom,offset);
}
