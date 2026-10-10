# Original native reference toolchain

Run from any working directory:

```sh
/path/to/NoCPU/tools/build-native.sh --jobs 2
```

The prerequisites are Bash and Docker Engine or Docker Desktop with an accessible
daemon. The first run downloads the pinned Ubuntu image and signed Ubuntu
packages, then compiles all 21 games registered by the original DICE 0.9
Makefile. Later runs reuse the toolchain image. Each compile starts with a clean
copy of `upstream/dice-0.9` in ignored `build/native`; no source file in `upstream`
is modified and no ROM is included in the image. ROM-free Pong can be used for
the public smoke test. Other games may require separately supplied ROMs.

```sh
./tools/build-native.sh --jobs 2 --rebuild-image
BUILD_JOBS=4 ./tools/build-native.sh
docker run --rm nocpu-dice-qt4:0.1.0 /usr/local/bin/nocpu-check-toolchain
```

`NOCPU_NATIVE_IMAGE` can override the tag `nocpu-dice-qt4:0.1.0`. The script
checks the toolchain on every run. `--rebuild-image` rebuilds its Dockerfile and
checks the base-image digest against the registry; Docker may reuse unchanged
layers. Output from a failed compile remains in `build/native` for diagnosis.
The compile container has no network access and mounts the repository read-only.
The container runs with your host UID/GID, so its outputs stay owned by your
user. `build/native/toolchain-provenance` records the exact image ID, full package
inventory, signed apt release metadata, toolchain check, and binary SHA-256.

The script respects an existing `DOCKER_CONFIG`. If the normal Docker client
configuration location is not writable, it uses ignored `build/docker-config`
for buildx state. It does not copy credentials from your home directory.
Package installation during image build uses Docker's host network because some
managed environments restrict bridge-network egress. Set
`NOCPU_DOCKER_BUILD_NETWORK=default` to use Docker's ordinary build network.
Standard HTTP/HTTPS proxy environment variables are forwarded using Docker's
predefined proxy build arguments. They are not written into the image.

The native reference is an x86-64 Linux application, not the browser build.
Docker runs it as `linux/amd64`; ARM hosts require Docker's amd64 emulation.
Interactive launch also requires a display and audio arrangement. The separate
Pong capture script supplies a headless X server and dummy audio for CI.

## What is pinned

- Official Ubuntu 18.04 base:
  `ubuntu@sha256:152dc042452c496007f07ca9127571cb9c29697f42acbfad72324b2bb2e43c98`.
- Explicit versions of the direct build and capture packages in `Dockerfile`.
- GCC/G++ 7.5.0, Qt 4.8.7, SDL 1.2.15, and key development packages checked by
  `check-toolchain.sh` before compiling.

Normal Ubuntu signed repository verification stays enabled. There are no
insecure apt flags, signature exceptions, TLS exceptions, or unsigned downloads.
The direct package pins fail if those versions disappear. Transitive package
versions come from the signed Bionic repositories and are not frozen in a
snapshot; this is a repeatable reference setup, not a promise of bit-for-bit
image or binary reproducibility. Ubuntu 18.04 and these libraries are historical
dependencies, used here to retain the original source behavior in an isolated
native reference. The future browser runtime will have its own toolchain.
