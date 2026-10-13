# Indy 4: raster row 213 shows the wrong scanline while a car crosses it

- Report date: 2026-10-13
- Build string (from the About panel, quoted exactly, e.g. `v0.2.0` or `v0.2.0-dev.3a09872`): `v0.1.0-dev.c772c63` (no About panel build string in 0.1.0; commit tested `c772c63`, branch `wip/0.1.1-comparisons`)
- Game ID or subsystem: `indy4`, portable renderer (`core/platform/portable_video.inc`)
- Native toolchain, or device/OS/browser and version: portable native runner (host GCC, `build-core.sh native`) and Wasm (Emscripten 3.1.74 in Node 22.22.0); original DICE 0.9 in the pinned image `nocpu-dice-qt4:0.1.0` (`sha256:bfdadad2…`), Xvfb, Mesa 20.0.8 llvmpipe (LLVM 10.0.0, 256 bits)
- Input method and bindings: recorded replays `tests/replays/indy4-max-time-keys.tsv` and `tests/replays/indy4-min-time-end.tsv` (keyboard wheel keys)
- Relevant settings/DIP switches: play-time potentiometer 1220 kΩ (`indy4-max-time-keys`) and 220 kΩ (`indy4-min-time-end`); DIP 0; seed 848
- ROM validation result/checksums, if needed (no payloads): `fetch-roms.sh`: `PASS indy4: indy4.zip; 4 required descriptors verified` (NoCPU-Roms fixtures)
- Frequency: every time (fully deterministic, including a repeat original capture)

## Steps to reproduce

1. Start from: `NOCPU_ROMS_REPO=<fixtures> ./tools/fetch-roms.sh`, `./tools/build-native.sh`, `./tools/build-core.sh all`.
2. Perform: `python3 tools/compare-rom-games.py --scenario indy4-max-time-keys` (or `--scenario indy4-min-time-end`).
3. Observe: `original_vs_native_epoch0` reports `frames.csv`, `frames.rgb` and one snapshot (`20000ms.ppm`) as different.

## Expected behavior

Every stream is byte-equal between the original DICE capture, the portable
native runner and the Wasm module, as for `indy4-pilot` and the Stunt Cycle
scenarios. The portable renderer is meant to reproduce the original's OpenGL
rasterization on llvmpipe pixel for pixel.

## Actual behavior

Only the RGB frame streams differ, original vs native; native and Wasm match
each other and every non-RGB stream (PCM, inputs, events, telemetry, hardware,
gray, geometry) is equal. The differences are confined to single raster rows
of the 576×432 frame (v_size 259), 3–7 pixels per frame, only while a car
crosses them:

- `indy4-max-time-keys`: frames 1176–1203.
- `indy4-min-time-end`: frames 548–567, 891–926, 1531–1638, 2379–2398, 2615–2640.

The comparison report described the row as row 213 of `frames.rgb`. That
stream is stored bottom-up (it follows the GL read-back order), so the affected
rows are top-down rows 213 and 218 of the displayed frame. In the original,
top-down row 213 repeats scanline 127 (row 212) and row 218 repeats scanline
130 (row 217); the port gives them to scanlines 128 and 131. Elsewhere those
adjacent scanlines are identical, which is why the rows only differ while a car
crosses them.

## Evidence

Root cause, from a rasterization probe built and run in the pinned original
image. It draws DICE's own `glOrtho`/`glViewport`/`GL_QUADS` sequence for every
scanline at v_size 100–400, plus segmented scanlines for horizontal edges, and
reads the pixels back:

- The scanline 128 top edge lands at 54527.504 units of 1/256 pixel. That
  snaps to 54528, exactly the center of row 213, and the scanline 131 top edge
  snaps exactly onto the center of row 218. So the row's owner is decided by
  the fill rule for a center lying on a horizontal edge, not by rounding.
- llvmpipe renders a window-system framebuffer as `Y_0_TOP`, and Mesa then
  selects `bottom_edge_rule` (Mesa 20.0.8 `st_atom_rasterizer.c`,
  `lp_setup_tri.c`). In downward window coordinates a tied center belongs to
  the quad above it: bottom edges are inclusive and top edges exclusive. The
  probe confirms this: row 213 goes to scanline 127 and row 218 to 130.
- The ROTATE_0 path in `Video::draw` used `ceil` boundaries, which make the
  top edge inclusive. That is a top-left rule in downward coordinates, so it
  gave those rows to the scanline below.
- A second, latent difference: the port flipped an upward window coordinate
  (`432 - (clip*216 + 216)`). Mesa instead computes the downward coordinate
  directly through a negated viewport scale and translate
  (`st_atom_viewport.c`: `clip*-216 + 216`). The two round differently. At
  v_size 253, for example, the port's value is an exact tie (23039.5) and
  llvmpipe's is 23039.496, which changes row 90.
- Horizontal edges have two related latent differences, found with the same
  probe. A boundary snaps one unit differently for about 4 of every million
  possible segment times. llvmpipe applies the viewport as `llvm.fmuladd`, and
  on this FMA-capable reference host that is one fused multiply-add
  (`draw_llvm.c` `generate_viewport`). It also snaps absolute coordinates of
  the 632×432 client window, whose keep-aspect viewport starts at x = 28. The
  port used unfused arithmetic relative to the viewport. At 240
  boundary-critical times for Indy 4's 58 931 960 ps scanline, llvmpipe agreed
  with fused, absolute arithmetic every time; the old port arithmetic differed
  at 221.

## Fix

`core/platform/portable_video.inc`, `Video::draw` (unrotated scanline quads):

- Compute window coordinates with `std::fma(clip, scale, translate)`. That is
  one rounding, as llvmpipe does it, and identical in native and Wasm.
- Use absolute x (`viewport_x + width/2`) and the flipped y viewport
  (`-height/2`, `fb_height - (viewport_y + height/2)`).
- Snap with the existing nearest-even 1/256 grid.
- Apply the bottom-edge rule: rows are `floor(top)+1 … floor(bottom)` and
  columns are `ceil(start) … ceil(end)-1`.

Independent review found that the first fix was incomplete:

- The rotated/overlay path (`draw_quad`) still rounded differently from
  llvmpipe at boundary-critical times. My own ROTATE_90 probe at Breakout's
  geometry (viewport 154,0,324,432; 58 661 600 ps; v_size 200–300; eight
  segment layouts) had matched it, but it never hit those times. The
  reviewer's probes mismatched in 7/11, 38/51 and 20/20 scenes.
- The ortho scale was computed in double, `float(2.0/double(scanline_time))`.
  Mesa computes `2.0F/(GLfloat)scanline_time`. This changes nothing for the
  six games' measured scanline times, which are multiples of 4, but it
  mismatched 9 of 40 random times.

Follow-up fix:

- `draw_quad` uses the same viewport rules: fused, absolute x and direct
  downward y.
- It keeps the vertex transform unfused, because a fused vertex transform
  mismatches again.
- It applies the bottom-edge rule by storing y as the negated downward fixed
  coordinate.
- Both ortho scales now use Mesa's float formula.

Re-running the reviewer's GL probe scenes against the branch's actual code
(709 + 40 scenes) gave 0 mismatches:

- `a`: game geometry, 46 scenes;
- `b`: every v_size 1–600;
- `c`: 40 random scanline times;
- `d`: clipped quads;
- `e`/`i`: Breakout ROTATE_90 at critical and pixel-center-tie times;
- `h`: ROTATE_0 pixel-center ties.

The previous commit mismatched 9/40 `c`, 7/11 `e` and 20/20 `i` scenes.

Probe check of the fixed arithmetic: it matches llvmpipe on every row at
v_size 100–400, on 32 segmented-scanline layouts and on all 240
boundary-critical times. The previous arithmetic mismatched 57 of the 333 row
and segment layouts.

Raw probe outputs and comparison reports are kept under ignored `build/`.

## Original reference comparison

Tested original DICE result: the original capture is the reference.
Rasterizing DICE's quads directly in the same image reproduces its row
ownership exactly (rows 212–213 → scanline 127, row 214 → 128, rows 217–218 →
130).

## Review outcome

- Reproduced on: `c772c63`, native and Wasm, 2026-10-13 (`indy4-max-time-keys` FAIL with the stated streams)
- Verified after the fix, 2026-10-13, every run with fresh original captures:
  - `compare-rom-games.py` PASS for all six ROM scenarios (Stunt Cycle ×3, Indy 4 ×3).
  - `capture-pong.sh` plus `make core-compare` PASS for Pong.
  - `capture-games.sh` plus `replay-games.sh` PASS for 16 Pong Doubles, Space Race and Breakout scenarios, including the Breakout full-RGB snapshots.
  - No other game's output changed: each still equals its fresh original capture.
- Verified again after the review follow-up (draw_quad and ortho scale), 2026-10-13, with fresh original captures:
  - All six ROM scenarios PASS; `host_cpu_fma: true` is recorded.
  - Pong PASS.
  - All 16 ROM-free scenarios PASS, including the 10 Breakout scenarios' full-RGB snapshots.
  - No game's output changed: every scenario still equals its original.
- Classification: NoCPU regression (portable renderer fill rule and viewport flip differ from llvmpipe)

Status: fixed in e6b2042
