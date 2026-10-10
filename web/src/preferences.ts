import { cloneBindings, validateBindings, type Bindings } from './control-schema';

export interface Preferences { volume: number; muted: boolean; bindings: Bindings }
export interface PreferencesResult { preferences: Preferences; status: 'available' | 'unavailable' | 'recovered'; message?: string }
export const PREFERENCES_KEY = 'nocpu.preferences';
export const PREFERENCES_VERSION = 1;
export const DEFAULT_PREFERENCES: Preferences = { volume: 0.6, muted: false, bindings: cloneBindings() };
export function clonePreferences(value: Preferences = DEFAULT_PREFERENCES): Preferences { return structuredClone(value); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validVolume(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }
function browserStorage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; }
  catch { return null; }
}
function recover(value: unknown): { preferences: Preferences; changed: boolean } {
  const preferences = clonePreferences();
  if (!record(value)) return { preferences, changed: true };
  let changed = false;
  if (validVolume(value.volume)) preferences.volume = value.volume; else changed = true;
  if (typeof value.muted === 'boolean') preferences.muted = value.muted; else changed = true;
  const mapping = validateBindings(value.bindings);
  if (mapping.ok) preferences.bindings = mapping.bindings; else changed = true;
  return { preferences, changed };
}

/** Version 0 is the explicitly supported sound-only envelope, not a previously shipped format. */
export function loadPreferences(storage: Storage | null = browserStorage()): PreferencesResult {
  if (!storage) return { preferences: clonePreferences(), status: 'unavailable', message: 'Settings work for this visit. Browser storage is unavailable.' };
  try {
    const raw = storage.getItem(PREFERENCES_KEY);
    if (raw === null) return { preferences: clonePreferences(), status: 'available' };
    if (raw.length > 65536) return { preferences: clonePreferences(), status: 'recovered', message: 'Saved settings were too large. Defaults are active.' };
    const envelope: unknown = JSON.parse(raw);
    if (!record(envelope)) return { preferences: clonePreferences(), status: 'recovered', message: 'Saved settings could not be read. Defaults are active.' };
    if (envelope.version === 0 && record(envelope.preferences)) {
      // This version supports sound only; unrelated/future fields must not become controls.
      const { preferences } = recover({ volume: envelope.preferences.volume, muted: envelope.preferences.muted });
      return { preferences, status: 'recovered', message: 'Older sound settings were kept. Controls use the current defaults.' };
    }
    if (envelope.version !== PREFERENCES_VERSION) return { preferences: clonePreferences(), status: 'recovered', message: 'This settings version is unsupported. Defaults are active.' };
    const { preferences, changed } = recover(envelope.preferences);
    return { preferences, status: changed ? 'recovered' : 'available', ...(changed ? { message: 'Invalid saved settings were replaced with usable defaults.' } : {}) };
  } catch {
    // A malformed JSON value and denied storage both leave the game usable.
    let denied = false;
    try { storage.getItem(PREFERENCES_KEY); } catch { denied = true; }
    return { preferences: clonePreferences(), status: denied ? 'unavailable' : 'recovered', message: denied ? 'Settings work for this visit. Browser storage is unavailable.' : 'Saved settings could not be read. Defaults are active.' };
  }
}

export function savePreferences(value: Preferences, storage: Storage | null = browserStorage()): PreferencesResult {
  const { preferences, changed } = recover(value);
  if (!storage) return { preferences, status: 'unavailable', message: 'Settings work for this visit and could not be saved on this device.' };
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ version: PREFERENCES_VERSION, preferences }));
    return { preferences, status: changed ? 'recovered' : 'available', ...(changed ? { message: 'Invalid settings were replaced with usable defaults before saving.' } : {}) };
  } catch {
    return { preferences, status: 'unavailable', message: 'Settings work for this visit and could not be saved on this device.' };
  }
}
