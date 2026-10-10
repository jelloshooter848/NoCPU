# Native reference assertions

Run `./tools/build-native.sh` followed by `./tools/capture-pong.sh` from the
repository root. The second command executes the native scenario and asserts
observed behavior; the checks are not mocks or screenshots of attract mode alone.

The fixed external input fixture is [`../replays/pong.tsv`](../replays/pong.tsv).
The assertion implementation is [`../../tools/reference/analyze.py`](../../tools/reference/analyze.py).
The method, measured baseline, exact artifact paths, and practical limits are in
[`../../docs/PONG_REFERENCE.md`](../../docs/PONG_REFERENCE.md).

Generated reports, native media, and working binaries live only in ignored
`build/reference/`. No ROM is required for this Pong reference. The aggregate
report records version, original source-archive hash, replay hash, adapter hash,
adapted binary hash, native binary record, and toolchain identity.

The runtime checks fail if either paddle's observed independent movement,
two distinct HIT contact episodes with rendered trajectory reversals, score
increase, coin restart/clear, generated sound transitions, bounded simulation
input scheduling, full recreation scenario, or fresh-process repeat equality is
missing. Circuit recreation is characterized separately; identical startup
frames are not an assertion about the original simulator.

Qualification additionally requires full video/PCM duration and cadence, plus
exact accounting of every declared replay timestamp/action/value in row order.
`make test` exercises these gates without native media. The capture command then
also runs actual-artifact regressions using isolated copies under ignored
`build/audit-reference/`. To rerun those against an existing capture:

```sh
python3 tests/test-reference-analysis.py --reference-dir build/reference
```

The actual-artifact tests reject video truncated to 360 frames, PCM truncated to
624,000 samples, a log containing only recreation, altered paddle values, extra
duplicate rows, and reordered inputs sharing one timestamp. Original captured
media and reports remain unchanged.
