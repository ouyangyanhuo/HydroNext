FROM node:22

WORKDIR /hydrooj

COPY install/docker/backend/entrypoint.sh /root/entrypoint.sh
COPY package.json yarn.lock .yarnrc.yml .npmrc ./
COPY .yarn ./.yarn
COPY build ./build
COPY framework ./framework
COPY packages ./packages
COPY plugins ./plugins
COPY modules ./modules
COPY examples ./examples
COPY tsconfig*.json ./

RUN corepack enable && \
    yarn install --immutable && \
    yarn workspace @hydrooj/ui-next vite build && \
    npm install -g pm2 && \
    mkdir -p /opt/hydro-addons && \
    ln -sf /hydrooj/packages/ui-next /opt/hydro-addons/ui-next && \
    ln -sf /hydrooj/packages/code-replay /opt/hydro-addons/code-replay && \
    ln -sf /hydrooj/packages/hydrooj/bin/hydrooj.js /usr/local/bin/hydrooj && \
    chmod +x /root/entrypoint.sh

ENTRYPOINT ["/root/entrypoint.sh"]
