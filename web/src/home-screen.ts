// SPDX-License-Identifier: GPL-3.0-or-later
// Home Screen installation changes presentation, never circuit or storage state.
export function homeScreenGuideMarkup(place: 'help' | 'about'): string {
  return `<details class="home-screen-guide" data-testid="home-screen-${place}">
    <summary>iPhone Home Screen</summary>
    <p data-home-screen-status role="status">Add NoCPU to your Home Screen for a game view without Safari's browser controls.</p>
    <ol data-home-screen-steps><li>Open NoCPU in Safari.</li><li>Open Share, then choose Add to Home Screen.</li><li>Keep the name NoCPU, add it, and launch its icon.</li></ol>
    <p>Connect to the internet to load NoCPU. Home Screen installation does not add offline play.</p>
    <p>Rotate your phone to play in portrait or landscape. After leaving the app, tap Resume; if needed, tap Enable sound in Settings. Closing the app can end the current game.</p>
    <p>Settings and optional remembered ROMs stay in this browser's storage. Safari and the Home Screen app may have separate saved data. If settings are missing, choose them again in Settings. Keep your original ROM ZIP or use Save a backup in Local ROMs, then re-import it if storage is cleared.</p>
  </details>`;
}

export function homeScreenDisplayActive(): boolean {
  // navigator.standalone covers iOS versions that do not expose display-mode.
  const safari = navigator as Navigator & { standalone?: boolean };
  return safari.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function syncHomeScreenGuidance(): void {
  const active = homeScreenDisplayActive();
  document.querySelector<HTMLElement>('.game-shell')?.setAttribute('data-display-mode', active ? 'standalone' : 'browser');
  document.querySelectorAll<HTMLElement>('[data-home-screen-status]').forEach((status) => {
    status.textContent = active ? 'NoCPU is running in Home Screen view.'
      : "Add NoCPU to your Home Screen for a game view without Safari's browser controls.";
  });
  document.querySelectorAll<HTMLElement>('[data-home-screen-steps]').forEach((steps) => { steps.hidden = active; });
}

export function observeHomeScreenDisplay(onChange: () => void): void {
  const query = window.matchMedia('(display-mode: standalone)');
  query.addEventListener('change', onChange);
  onChange();
}
