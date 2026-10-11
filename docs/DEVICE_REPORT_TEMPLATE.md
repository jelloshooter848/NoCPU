# Physical-device report — copy one per phone

Use `pass`, `fail`, `pending` or `unavailable`. Replace `pending` only with an
actual observation. Keep the JSON export and its limitations; controller
results apply separately to each tested pairing. Send no ROM bytes/private archives.

## Actual test identity

| Field | Actual value |
| --- | --- |
| Tester / report ID and UTC date/time | |
| Physical platform/model | |
| OS version | |
| Browser/version | |
| Test URL | |
| Build displayed in About | |
| Full source/build commit and runtime SHA-256 | |
| Manifest/export filenames and artifact validation/loaded-byte scope | |
| Orientations; fullscreen or normal tab | |
| Charging, thermal and other conditions | |
| Screenshots/clips filenames | |

## Required phone checks

| Check | Result | Steps and observed evidence |
| --- | --- | --- |
| `coin_starts_play` | pending | |
| `independent_simultaneous_touch_paddles` | pending | Both tracks/endpoints, court touches, both orientations |
| `ball_contacts_and_scoring` | pending | |
| `audible_circuit_sound` | pending | Phone speakers |
| `pause_resume_and_reset` | pending | |
| `mute_unmute_and_audio_recovery` | pending | Name the real tested interruptions |
| `portrait_landscape_layout` | pending | Reachability, separation and obstruction |
| `touch_cancel_and_background_recovery` | pending | Held input, Menu, rotation, background and lock/unlock |

## App observations

| Check | Result | Steps and observed evidence |
| --- | --- | --- |
| Library → information → Help/Settings → Back | pending | Both orientations |
| Focus, internal scrolling and reachable controls | pending | Both orientations |
| Preferences after reload | pending | |
| Storage unavailable/cleared recovery | pending | Setup or reason unavailable |
| Fullscreen or usable normal-tab fallback | pending | |
| Own compatible ROM picker/import/Remember/remove/re-import | pending | Conditional; only hashes/sizes, or reason unavailable |

## Sustained active-play measurements

Session seconds include excluded time. Wall/simulation seconds cover the same
accepted foreground/native-running segments. Copy measured values from the
export and preserve raw readings/limitations. Missing fields remain blank.

| Field | Actual value | Source / units / limitation |
| --- | --- | --- |
| Session seconds | | Total recording-session elapsed seconds |
| Wall seconds | | Sum of accepted active intervals, at least 600 |
| Conservative active-wall lower bound | | Preserve endpoint acquisition uncertainty |
| Simulation seconds | | Native deltas over those same intervals |
| Simulation/wall ratio and uncertainty | | At least 0.95; retain nominal/conservative values |
| Frame pacing | | Method and observed stalls |
| Audio underruns | | Start/end/delta and counter scope |
| Memory start/end bytes | | Wasm capacity; other memory only if separately measured |
| Input response | | Method and manual observation |
| Thermal/slowdown observations | | |
| Raw readings, excluded intervals, coverage and identity/measurement gaps | | Export/evidence filenames |
| Measurement result | pending | Missing fields or failed threshold remain explicit |

## Controller pairing — copy for each pairing

| Field | Actual value |
| --- | --- |
| Device/browser and tested build/runtime | |
| Controller model(s), connection and visible ID(s) | |
| P1/P2 axes and action bindings before/after remap | |
| Evidence filenames | |

| Check | Result | Steps and observed evidence |
| --- | --- | --- |
| Detection and independent simultaneous P1/P2 movement | pending | |
| Coin/menu/reset/mute and remapped binding | pending | |
| Reload retains binding | pending | |
| Held disconnect/reconnect, neutral return and fresh input | pending | |
| Menu/Resume, Reset and background release | pending | |

## Failures and remaining work

For each problem, record expected/actual behavior, reproducible steps,
frequency and evidence filename. List pending/unavailable checks and their
reasons. A phone pass requires complete identified-runtime evidence; this
report alone does not change release readiness.
