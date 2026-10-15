FROM node:22-bookworm AS dependencies

WORKDIR /hydrooj

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
COPY packages ./packages
COPY framework ./framework
COPY plugins ./plugins
COPY modules ./modules
COPY examples ./examples

RUN corepack enable && \
    YARN_ENABLE_IMMUTABLE_INSTALLS=true yarn workspaces focus @hydrooj/hydrojudge --production

FROM node:22-bookworm

WORKDIR /hydrooj

ARG TARGETARCH

COPY --from=dependencies /hydrooj/node_modules ./node_modules
COPY --from=dependencies /hydrooj/packages/hydrojudge ./packages/hydrojudge
COPY --from=dependencies /hydrooj/packages/common ./packages/common
COPY --from=dependencies /hydrooj/framework/utils ./framework/utils
COPY --from=dependencies /hydrooj/framework/register ./framework/register
COPY install/docker/judge/entrypoint.sh /root/entrypoint.sh

RUN apt-get -qq update && \
    apt-get install -y \
    ca-certificates \
    wget \
    gcc \
    python3 \
    g++ \
    fp-compiler \
    openjdk-17-jdk-headless \
    php-cli \
    rustc \
    ghc \
    libjavascriptcoregtk-4.0-bin \
    golang \
    ruby \
    mono-runtime \
    mono-mcs && \
    rm -rf /var/lib/apt/lists/* && \
    chmod +x /root/entrypoint.sh && \
    # node is at /usr/local/bin but hydrojudge will find it at /usr/bin
    # so make a symlink to it
    ln -s /usr/local/bin/node /usr/bin/node && \
    ln -s /hydrooj/packages/hydrojudge/bin/hydrojudge.js /usr/local/bin/hydrojudge

RUN npm install --global pm2@7.0.4 && \
    case "${TARGETARCH}" in \
        amd64) sandbox_sha256=509782f8959987256d99ac6dc8062ec593d776f291401c8e0c28bdc48dcd1880 ;; \
        arm64) sandbox_sha256=dbc21dfdb9e72a6584b697ea1bb2f29e47349aa3ad8d1d75e70911539b0e03d7 ;; \
        *) echo "Unsupported judge architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    wget --https-only --timeout=30 --tries=3 \
        "https://github.com/criyle/go-judge/releases/download/v1.13.3/go-judge_1.13.3_linux_${TARGETARCH}" -O /usr/bin/sandbox && \
    echo "${sandbox_sha256}  /usr/bin/sandbox" | sha256sum --check --strict && \
    chmod +x /usr/bin/sandbox && \
    mkdir -p /hydrooj/packages/hydrojudge/vendor/testlib && \
    wget --https-only --timeout=30 --tries=3 \
        https://raw.githubusercontent.com/MikeMirzayanov/testlib/2d20123984e9479b8a56ebe0d6a51e23ad7c35b3/testlib.h \
        -O /hydrooj/packages/hydrojudge/vendor/testlib/testlib.h && \
    echo "bb323e3c89285214966076e0d23d5a295c5f6126da7ff198c1276ddb95ecb1a0  /hydrooj/packages/hydrojudge/vendor/testlib/testlib.h" | sha256sum --check --strict

RUN node -e "require('node:fs').writeFileSync('/tmp/judge-build.yaml', 'hosts: {}\n')" && \
    CONFIG_FILE=/tmp/judge-build.yaml node -r ./framework/register -e "require('./packages/hydrojudge/src/daemon')" && \
    rm /tmp/judge-build.yaml

ENTRYPOINT ["/root/entrypoint.sh"]
