# NoCPU core boundary

This directory reserves the original-derived engine/adaptation boundary. No portable browser core has been extracted in 0.1.0. The audited native reference remains under [`upstream/dice-0.9/`](../upstream/dice-0.9/), built from a separate generated copy.

The 0.2 work defines create/destroy/reset/input/advance/video/audio/ROM interfaces while preserving the C++ circuit scheduler, integer timing, frame geometry, and circuit-generated PCM. Keep platform adapters and documented port patches separately identifiable. Do not edit the historical source to accommodate frontend tooling.

Read [architecture](../docs/ARCHITECTURE.md), [provenance](../docs/PROVENANCE.md), and [testing](../docs/TESTING.md) before introducing an adapter.
