// NoCPU game-shell views, GPL-3.0-or-later.
import { GAMES, type GameInfo } from './catalog';

export function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

export function libraryMarkup(): string {
  return GAMES.map((game) => `<button class="library-game" data-game-id="${game.id}" data-testid="game-${game.id}"><span class="game-name">${escapeText(game.name)}</span><span class="status-tag">${game.playable ? 'Ready to play' : 'Browser port pending'}</span><span class="game-summary">${game.manufacturer} · ${game.year} · ${game.roms.length ? 'ROM required' : 'No ROM needed'}</span></button>`).join('');
}

export function gameInfoMarkup(game: GameInfo, romStatus: string): string {
  return `<dl class="game-info-facts"><div><dt>Original</dt><dd>${escapeText(game.manufacturer)} · ${game.year}</dd></div><div><dt>Players</dt><dd>Up to ${game.players}${game.sharedControls ? ' · shared controls' : ''}</dd></div><div><dt>Controls</dt><dd>${game.controlFamilies.map(escapeText).join(', ')}</dd></div><div><dt>Browser</dt><dd data-testid="game-port-status">${game.playable ? 'Ready to play' : 'Browser port pending'}</dd></div><div><dt>ROMs</dt><dd data-testid="game-rom-status">${escapeText(romStatus)}</dd></div><div><dt>Sound</dt><dd data-testid="game-audio-status">${game.audioWired ? game.playable ? 'Original circuit sound' : 'DICE circuit sound · browser port pending' : 'Inherited audio unavailable in DICE'}</dd></div></dl>${game.playable ? '<p>Insert a coin to start. First to 11 wins.</p>' : '<p>This original DICE game is part of the NoCPU roadmap. It cannot be played in this browser version.</p>'}${game.roms.length ? `<details class="rom-requirements"><summary>Required ROM files</summary><ul>${game.roms.map((rom) => `<li>${escapeText(rom.expected_member)}</li>`).join('')}</ul></details>` : ''}`;
}

export function createShellMarkup(base: string, source: string): string {
  return `
  <main class="game-shell" data-screen="title" aria-label="NoCPU circuit arcade">
    <div class="game-stage" id="arcade">
      <div class="screen-frame">
        <canvas data-testid="game-canvas" width="576" height="432" tabindex="0" aria-label="Pong game display. Player 1 uses W and S, player 2 uses Up and Down. On touchscreens use the separate P1 and P2 sliders outside the court."></canvas>
      </div>
      <div class="touch-controls" aria-label="Paddle controls">
        <div class="paddle-controller">
          <span class="control-player" id="paddle-p1-label">P1</span>
          <div class="paddle-control" data-testid="paddle-p1" tabindex="0" role="slider" aria-label="Player 1 paddle position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-orientation="vertical" aria-describedby="paddle-p1-help"><span class="control-track" aria-hidden="true"><span class="control-thumb"></span></span></div>
          <span class="control-help" id="paddle-p1-help">DRAG UP / DOWN</span>
        </div>
        <div class="paddle-controller">
          <span class="control-player" id="paddle-p2-label">P2</span>
          <div class="paddle-control" data-testid="paddle-p2" tabindex="0" role="slider" aria-label="Player 2 paddle position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-orientation="vertical" aria-describedby="paddle-p2-help"><span class="control-track" aria-hidden="true"><span class="control-thumb"></span></span></div>
          <span class="control-help" id="paddle-p2-help">DRAG UP / DOWN</span>
        </div>
      </div>
    </div>
    <nav class="game-hud" aria-label="Game actions" hidden>
      <button class="hud-button coin-button" data-testid="insert-coin" disabled>Insert coin</button>
      <button class="hud-button menu-button" id="menu" data-testid="pause" aria-haspopup="dialog" aria-pressed="false" disabled>Menu <span aria-hidden="true">☰</span></button>
    </nav>
    <p class="sr-only" data-testid="status" role="status" aria-live="polite">Choose Play Pong to start.</p>
    <div class="sr-only" aria-label="Score"><span data-testid="score-p1">0</span><span data-testid="score-p2">0</span></div>
    <div class="shell-overlay" id="screen-overlay" role="dialog" aria-modal="true" aria-labelledby="title-heading">
      <div class="overlay-card">
        <button class="back-button" id="back" data-testid="back" hidden>← Back</button>
        <section class="panel-section title-panel" id="intro" data-panel="title">
          <h1 id="title-heading" class="game-logo">NoCPU</h1>
          <p class="game-subtitle">PONG</p>
          <div class="menu-actions">
            <button class="primary-button play-button" data-testid="play-pong">Play Pong</button>
            <button data-action="library" data-testid="open-library">Library</button>
            <button data-action="settings">Settings</button>
            <button data-action="help">How to play</button>
            <button data-action="about">About</button>
          </div>
          <p class="title-version" data-testid="title-version">V${__NOCPU_VERSION__}</p>
        </section>
        <section class="panel-section loading-panel" data-panel="loading" hidden>
          <h1 id="loading-heading">Loading Pong</h1>
          <p id="overlay-label">Preparing the circuit…</p>
        </section>
        <section class="panel-section paused-panel" data-panel="paused" hidden>
          <h1 id="paused-heading">Paused</h1>
          <div class="menu-actions">
            <button class="primary-button" id="resume" data-testid="resume">Resume</button>
            <button data-testid="reset" disabled>Reset game</button>
            <button data-action="settings">Settings</button>
            <button data-action="help">How to play</button>
            <button data-action="about">About</button>
            <button id="return-library" data-testid="return-library">Return to library</button>
            <button id="return-title" data-testid="return-title">Return to title</button>
          </div>
        </section>
        <section class="panel-section library-panel" data-panel="library" hidden>
          <h1 id="library-heading">Library</h1>
          <p class="panel-note">Pong is ready to play. More DICE games are coming.</p>
          <div class="menu-inline-actions"><button data-action="settings">Settings</button><button data-action="help">How to play</button><button data-action="about">About</button></div>
          <div class="library-list" data-testid="game-library">${libraryMarkup()}</div>
        </section>
        <section class="panel-section game-info-panel" data-panel="game-info" hidden>
          <h1 id="game-info-heading">Pong</h1>
          <div id="game-info-content" data-testid="game-info"></div>
          <div class="menu-inline-actions">
            <button class="primary-button" data-testid="play-selected">Play Pong</button>
            <button data-action="game-help">Controls & help</button>
            <button data-action="settings">Settings</button>
            <button data-action="manage-roms" id="manage-game-roms">Local ROMs</button>
          </div>
        </section>
        <section class="panel-section settings-panel" data-panel="settings" hidden>
          <h1 id="settings-heading">Settings</h1>
          <div class="menu-inline-actions settings-jump"><button data-settings-target="sound-section">Sound</button><button data-settings-target="controls-section">Controls</button><button data-settings-target="rom-section">Local ROMs</button><button data-settings-target="display-section">Display</button></div>
          <p class="storage-status" data-testid="preferences-status" role="status"></p>
          <section class="settings-section" id="sound-section" aria-labelledby="sound-heading">
            <h2 id="sound-heading" tabindex="-1">Sound</h2>
            <div class="sound-control"><button data-testid="mute" aria-pressed="false" aria-label="Enable sound">Enable sound</button><label class="volume-label" for="volume">Volume</label><input id="volume" type="range" min="0" max="100" value="60" aria-label="Volume" /></div>
            <p id="sound-note" class="sound-note" hidden>Sound is unavailable. Tap Enable sound to try again.</p>
          </section>
          <section class="settings-section" id="controls-section" aria-labelledby="controls-heading">
            <h2 id="controls-heading" tabindex="-1">Pong controls</h2>
            <p>Choose a keyboard action, then press its new key. Escape cancels. Each key or controller button belongs to one action.</p>
            <h3>Keyboard</h3><div id="keyboard-bindings" data-testid="keyboard-bindings"></div>
            <h3>Gamepads</h3><p class="gamepad-status" data-testid="gamepad-status" role="status">Connect a gamepad and press a button.</p>
            <div id="gamepad-players"></div><div id="gamepad-bindings" data-testid="gamepad-bindings"></div>
            <p id="binding-message" data-testid="binding-message" role="status" aria-live="polite"></p>
            <div class="menu-inline-actions"><button id="cancel-binding" data-testid="cancel-binding" hidden>Cancel assignment</button><button id="controls-defaults" data-testid="controls-defaults">Restore default controls</button></div>
          </section>
          <section class="settings-section" id="rom-section" aria-labelledby="rom-heading">
            <h2 id="rom-heading" tabindex="-1">Local ROMs</h2>
            <p>Pong needs no ROM. Import your own compatible ZIP for a game below. Files stay in this browser; importing does not make a pending browser port playable.</p>
            <label for="rom-game">Game</label><select id="rom-game" data-testid="rom-game">${GAMES.filter((game) => game.roms.length).map((game) => `<option value="${game.id}">${escapeText(game.name)}</option>`).join('')}</select>
            <label class="remember-roms" for="remember-roms"><input id="remember-roms" data-testid="remember-roms" type="checkbox" /> Remember on this device</label>
            <label class="rom-file-label" for="rom-file">Choose ROM ZIP</label><input id="rom-file" data-testid="rom-import" type="file" accept=".zip,application/zip" />
            <p data-testid="rom-import-status" role="status" aria-live="polite"></p><p class="storage-status" data-testid="storage-status">Checking local ROM storage…</p>
            <div class="rom-list" data-testid="rom-list"></div>
          </section>
          <section class="settings-section" id="display-section" aria-labelledby="display-heading">
            <h2 id="display-heading" tabindex="-1">Display</h2><button data-testid="fullscreen">Enter fullscreen</button><p data-testid="fullscreen-status" role="status">Normal browser view works without fullscreen.</p>
          </section>
        </section>
        <section class="panel-section help-panel" data-panel="help" hidden>
          <h1 id="help-heading">How to play</h1>
          <div id="game-help-content"></div>
        </section>
        <section class="panel-section about-panel" data-panel="about" hidden>
          <h1 id="about-heading">About NoCPU</h1>
          <p>A continuation of <a href="https://sourceforge.net/projects/dice/" target="_blank" rel="noopener noreferrer">DICE</a>, the Discrete Integrated Circuit Emulator, by the DICE Team.</p>
          <p>Pong runs its original circuit simulation and sound. No ROM file is required.</p>
          <p data-testid="version">Version ${__NOCPU_VERSION__} · <span id="build-id">development</span></p>
          <p class="preview-note" id="release-stage">Browser preview · physical phone qualification pending</p>
          <nav class="about-links" aria-label="Project and license"><a href="https://github.com/jelloshooter848/NoCPU" target="_blank" rel="noopener noreferrer">GitHub</a><a href="${source}" target="_blank" rel="noopener noreferrer">Source</a><a href="${base}notices/LICENSE">GPL v3</a><a href="${base}notices/THIRD_PARTY_NOTICES.md">Credits & notices</a></nav>
        </section>
        <section class="panel-section error-panel" data-panel="error" data-testid="error" role="alert" hidden>
          <h1 id="error-heading">Unable to load Pong</h1>
          <p id="error-message"></p>
          <button class="primary-button" id="retry">Reload game</button>
          <button data-action="title">Return to title</button>
        </section>
      </div>
    </div>
  </main>
`;
}
