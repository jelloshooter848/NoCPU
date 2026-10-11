import { cloneBindings, defaultBindings, validateBindings, type Bindings } from './control-schema';
import { defaultGameOptions, normalizeGameOptions, type GameOptionsById, type PlayableGameId } from './game-contract';

export interface Preferences {
  volume: number; muted: boolean;
  /** Shipped Pong map kept at its original location for explicit version-1 migration. */
  bindings: Bindings;
  bindingsByGame: { pongdoubles: Bindings; spacerace: Bindings; breakout: Bindings };
  optionsByGame: GameOptionsById;
}
export interface PreferencesResult { preferences: Preferences; status: 'available' | 'unavailable' | 'recovered'; message?: string }
export const PREFERENCES_KEY = 'nocpu.preferences';
export const PREFERENCES_VERSION = 3;
export const DEFAULT_PREFERENCES: Preferences = {
  volume: 0.6, muted: false, bindings: cloneBindings(),
  bindingsByGame: { pongdoubles: defaultBindings('pongdoubles'), spacerace: defaultBindings('spacerace'), breakout: defaultBindings('breakout') },
  optionsByGame: { pong: defaultGameOptions('pong'), pongdoubles: defaultGameOptions('pongdoubles'), spacerace: defaultGameOptions('spacerace'), breakout: defaultGameOptions('breakout') },
};
export function clonePreferences(value: Preferences = DEFAULT_PREFERENCES): Preferences { return structuredClone(value); }
export function gameBindings(preferences: Preferences, gameId: PlayableGameId): Bindings { return gameId === 'pong' ? preferences.bindings : preferences.bindingsByGame[gameId]; }
export function withGameBindings(preferences: Preferences, gameId: PlayableGameId, bindings: Bindings): Preferences {
  return gameId === 'pong' ? { ...preferences, bindings } : { ...preferences, bindingsByGame: { ...preferences.bindingsByGame, [gameId]: bindings } };
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validVolume(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }
function browserStorage(): Storage | null { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } }
function recover(value: unknown, version = PREFERENCES_VERSION): { preferences: Preferences; changed: boolean } {
  const preferences = clonePreferences(); if (!record(value)) return { preferences, changed: true };
  let changed = false;
  if (validVolume(value.volume)) preferences.volume = value.volume; else changed = true;
  if (typeof value.muted === 'boolean') preferences.muted = value.muted; else changed = true;
  const mapping = validateBindings(value.bindings);
  if (mapping.ok) preferences.bindings = mapping.bindings; else changed = true;
  if (version >= 2) {
    const maps = record(value.bindingsByGame) ? value.bindingsByGame : {};
    const options = record(value.optionsByGame) ? value.optionsByGame : {};
    for (const gameId of (version === 2 ? ['pongdoubles', 'spacerace'] : ['pongdoubles', 'spacerace', 'breakout']) as readonly Exclude<PlayableGameId, 'pong'>[]) {
      const mapping = validateBindings(maps[gameId], gameId);
      if (mapping.ok) preferences.bindingsByGame[gameId] = mapping.bindings; else changed = true;
    }
    for (const gameId of (version === 2 ? ['pong', 'pongdoubles', 'spacerace'] : ['pong', 'pongdoubles', 'spacerace', 'breakout']) as readonly PlayableGameId[]) {
      const normalized = normalizeGameOptions(gameId, options[gameId]);
      Object.assign(preferences.optionsByGame, { [gameId]: normalized });
      if (JSON.stringify(normalized) !== JSON.stringify(options[gameId])) changed = true;
    }
  }
  return { preferences, changed };
}
/** v0 is sound-only; v1 keeps Pong, and v2 keeps all three shipped game maps/options. */
export function loadPreferences(storage: Storage | null = browserStorage()): PreferencesResult {
  if (!storage) return { preferences: clonePreferences(), status: 'unavailable', message: 'Settings work for this visit. Browser storage is unavailable.' };
  try {
    const raw = storage.getItem(PREFERENCES_KEY);
    if (raw === null) return { preferences: clonePreferences(), status: 'available' };
    if (raw.length > 65536) return { preferences: clonePreferences(), status: 'recovered', message: 'Saved settings were too large. Defaults are active.' };
    const envelope: unknown = JSON.parse(raw);
    if (!record(envelope)) return { preferences: clonePreferences(), status: 'recovered', message: 'Saved settings could not be read. Defaults are active.' };
    if (envelope.version === 0 && record(envelope.preferences)) {
      const preferences = clonePreferences();
      if (validVolume(envelope.preferences.volume)) preferences.volume = envelope.preferences.volume;
      if (typeof envelope.preferences.muted === 'boolean') preferences.muted = envelope.preferences.muted;
      return { preferences, status: 'recovered', message: 'Older sound settings were kept. Controls use the current defaults.' };
    }
    if (envelope.version === 1) {
      const { preferences, changed } = recover(envelope.preferences, 1);
      return { preferences, status: 'recovered', message: changed
        ? 'Older sound settings were kept where valid. Invalid Pong controls use defaults; new games have their own controls.'
        : 'Your Pong controls and sound settings were kept. New games have their own controls and settings.' };
    }
    if (envelope.version === 2) {
      const { preferences, changed } = recover(envelope.preferences, 2);
      return { preferences, status: 'recovered', message: changed
        ? 'Your valid controls, sound and game settings were kept. Invalid fields use defaults; Breakout has its own controls and settings.'
        : 'Your controls, sound and game settings were kept. Breakout has its own controls and settings.' };
    }
    if (envelope.version !== PREFERENCES_VERSION) return { preferences: clonePreferences(), status: 'recovered', message: 'This settings version is unsupported. Defaults are active.' };
    const { preferences, changed } = recover(envelope.preferences);
    return { preferences, status: changed ? 'recovered' : 'available', ...(changed ? { message: 'Invalid saved settings were replaced with usable defaults.' } : {}) };
  } catch {
    let denied = false; try { storage.getItem(PREFERENCES_KEY); } catch { denied = true; }
    return { preferences: clonePreferences(), status: denied ? 'unavailable' : 'recovered', message: denied ? 'Settings work for this visit. Browser storage is unavailable.' : 'Saved settings could not be read. Defaults are active.' };
  }
}
export function savePreferences(value: Preferences, storage: Storage | null = browserStorage()): PreferencesResult {
  const { preferences, changed } = recover(value);
  if (!storage) return { preferences, status: 'unavailable', message: 'Settings work for this visit and could not be saved on this device.' };
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ version: PREFERENCES_VERSION, preferences }));
    return { preferences, status: changed ? 'recovered' : 'available', ...(changed ? { message: 'Invalid settings were replaced with usable defaults before saving.' } : {}) };
  } catch { return { preferences, status: 'unavailable', message: 'Settings work for this visit and could not be saved on this device.' }; }
}
