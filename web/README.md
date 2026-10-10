# NoCPU browser frontend boundary

This directory reserves the browser frontend. 0.1.0 has no browser runtime, package manifest, playable site, or mobile controls. The first browser milestone is a minimal Pong proof with sound on desktop, physical Android, and physical iPhone.

The planned TypeScript/Vite interface handles the game library, contextual controls, keyboard/gamepad/touch mappings, rendering, PCM delivery through Web Audio, optional local ROM storage, settings, and lifecycle recovery. Preserve the original-derived C++/Wasm simulation rather than implementing replacement game rules here.

Read [architecture](../docs/ARCHITECTURE.md) and the [roadmap](../docs/ROADMAP.md). Add dependency manifests and frozen lockfiles when browser tooling is actually introduced.
