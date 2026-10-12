// SPDX-License-Identifier: GPL-3.0-or-later
#ifndef NOCPU_ROM_SESSION_H
#define NOCPU_ROM_SESSION_H
#include <stdint.h>
#include <vector>
struct RomDesc;
struct NoCPURomSession {
    uint32_t game=UINT32_MAX;
    std::vector<std::vector<uint8_t>> members;
};
// The engine owns the loaded bytes; RomDesc retains its original offset and
// out-of-range semantics without a process-global ZIP/last-member cache.
uint8_t nocpu_rom_read(const RomDesc*,unsigned offset);
#endif
