// SPDX-License-Identifier: GPL-3.0-or-later
// Development server only. app-settings imports this module behind
// import.meta.env.DEV, so production bundles contain neither the endpoint nor
// any fixture bytes. The Vite dev middleware serves ZIPs fetched by
// tools/fetch-roms.sh; each one still passes the normal CRC/size validation
// and is held for this session only, never saved to device storage.
import type { RomLibrary } from './roms';

const endpoint = `${import.meta.env.BASE_URL}__nocpu-dev-roms/`;

/** Imports available development fixtures not already ready; returns the count loaded. */
export async function importDevRoms(library: RomLibrary): Promise<number> {
  let index: { gameId: string; fileName: string }[];
  try {
    const response = await fetch(`${endpoint}index.json`, { cache: 'no-store' });
    if (!response.ok) return 0;
    index = await response.json();
  } catch { return 0; }
  const ready = new Set((await library.list()).filter((entry) => entry.status === 'ready').map((entry) => entry.gameId));
  let loaded = 0;
  for (const { gameId, fileName } of index) {
    if (ready.has(gameId)) continue;
    try {
      const response = await fetch(`${endpoint}${encodeURIComponent(gameId)}.zip`, { cache: 'no-store' });
      if (!response.ok) continue;
      const result = await library.importArchive(gameId, new File([await response.arrayBuffer()], fileName), false);
      if (result.ok) loaded += 1;
    } catch { /* A missing or invalid fixture leaves the normal import path. */ }
  }
  return loaded;
}
