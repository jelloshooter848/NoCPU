# DICE 0.9's original Qt 4 / SDL 1.2 native reference, on linux/amd64.
# No source or ROM data is copied into this toolchain image.
FROM ubuntu@sha256:152dc042452c496007f07ca9127571cb9c29697f42acbfad72324b2bb2e43c98

ENV DEBIAN_FRONTEND=noninteractive

# Keep Ubuntu's normal signed repository verification enabled. The direct
# dependencies are version-pinned; transitive dependencies use signed Bionic
# repositories, rather than pretending this is a fully frozen apt snapshot.
RUN printf '%s\n' \
      'deb http://archive.ubuntu.com/ubuntu bionic main universe' \
      'deb http://archive.ubuntu.com/ubuntu bionic-updates main universe' \
      'deb http://security.ubuntu.com/ubuntu bionic-security main universe' \
      > /etc/apt/sources.list \
    && apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
      build-essential=12.4ubuntu1 \
      gcc-7=7.5.0-3ubuntu1~18.04 \
      g++-7=7.5.0-3ubuntu1~18.04 \
      pkg-config=0.29.1-0ubuntu2 \
      qt4-qmake=4:4.8.7+dfsg-7ubuntu1 \
      libqt4-dev=4:4.8.7+dfsg-7ubuntu1 \
      libsdl1.2-dev=1.2.15+dfsg2-0.1ubuntu0.2 \
      libgl1-mesa-dev=20.0.8-0ubuntu1~18.04.1 \
      libgl1-mesa-dri=20.0.8-0ubuntu1~18.04.1 \
      libxi-dev=2:1.7.9-1 \
      xvfb=2:1.19.6-1ubuntu4.15 \
      xauth=1:1.0.10-1 \
      xdotool=1:3.20160805.1-3 \
      python3=3.6.7-1~18.04 \
    && mkdir -p /usr/local/share/nocpu-toolchain/apt-release \
    && cp /var/lib/apt/lists/*InRelease /usr/local/share/nocpu-toolchain/apt-release/ \
    && dpkg-query -W > /usr/local/share/nocpu-toolchain/packages.tsv \
    && printf '%s\n' \
      'base=ubuntu@sha256:152dc042452c496007f07ca9127571cb9c29697f42acbfad72324b2bb2e43c98' \
      > /usr/local/share/nocpu-toolchain/base-image.txt \
    && rm -rf /var/lib/apt/lists/*

COPY check-toolchain.sh /usr/local/bin/nocpu-check-toolchain
RUN chmod 0755 /usr/local/bin/nocpu-check-toolchain \
    && /usr/local/bin/nocpu-check-toolchain

WORKDIR /build
CMD ["/bin/bash"]
