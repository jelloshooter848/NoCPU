// SPDX-License-Identifier: GPL-3.0-or-later
#ifndef REALTIME_H
#define REALTIME_H
#include <stdint.h>
// Browser presentation controls pacing; circuit simulation never waits on wall time.
struct RealTimeClock { void operator+=(int64_t){} uint64_t get_usecs(){ return UINT64_MAX; } };
#endif
