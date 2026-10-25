FROM node:22.23.4

WORKDIR /hydrooj

ARG HYDRO_BUILD_ID
ARG HYDRO_BUILD_TIME

COPY install/docker/backend/entrypoint.sh /root/entrypoint.sh
COPY install/docker/backend/configure-addons.cjs /root/configure-addons.cjs
COPY package.json .yarnrc.yml .npmrc ./
COPY .yarn ./.yarn
COPY build ./build
COPY framework ./framework
COPY packages ./packages
COPY plugins ./plugins
COPY modules ./modules
COPY examples ./examples
COPY tsconfig*.json ./

RUN HYDRO_BUILD_ID="${HYDRO_BUILD_ID}" node -e "const crypto = require('crypto'); const fs = require('fs'); fs.writeFileSync('/hydrooj/.build-id', process.env.HYDRO_BUILD_ID || crypto.randomBytes(12).toString('hex'));" && \
    node -e "const fs = require('fs'); const p = '/root/entrypoint.sh'; const source = fs.readFileSync(p, 'utf8'); const pattern = /^.*(?:echo|printf).*addon[.]json.*$/m; if (!pattern.test(source)) throw new Error('Cannot locate addon configuration in entrypoint'); fs.writeFileSync(p, source.replace(pattern, 'node /root/configure-addons.cjs || exit 1'));" && \
    corepack enable && \
    yarn install && \
    yarn workspace @hydrooj/ui-next vite build && \
    HYDRO_BUILD_TIME="${HYDRO_BUILD_TIME}" node -e "const fs = require('fs'); fs.writeFileSync('/hydrooj/.build-time', process.env.HYDRO_BUILD_TIME || new Date().toISOString());" && \
    npm install -g pm2 && \
    mkdir -p /opt/hydro-addons && \
    ln -sf /hydrooj/packages/ui-next /opt/hydro-addons/ui-next && \
    ln -sf /hydrooj/packages/code-replay /opt/hydro-addons/code-replay && \
    ln -sf /hydrooj/packages/honor-frame /opt/hydro-addons/honor-frame && \
    ln -sf /hydrooj/packages/client-updates /opt/hydro-addons/client-updates && \
    ln -sf /hydrooj/packages/user-contributions /opt/hydro-addons/user-contributions && \
    ln -sf /hydrooj/packages/editor-paste-guard /opt/hydro-addons/editor-paste-guard && \
    ln -sf /hydrooj/packages/hydrooj/bin/hydrooj.js /usr/local/bin/hydrooj && \
    chmod +x /root/entrypoint.sh

ENTRYPOINT ["/root/entrypoint.sh"]
