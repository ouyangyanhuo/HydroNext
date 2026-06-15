FROM node:22

COPY install/docker/backend/entrypoint.sh /root/entrypoint.sh
COPY packages/code-replay /opt/hydro-addons/code-replay

RUN yarn global add pm2 hydrooj @hydrooj/ui-default \
    @hydrooj/vjudge \
    @hydrooj/onlyoffice \
    @hydrooj/import-hoj \
    @hydrooj/import-qduoj && \
    chmod +x /root/entrypoint.sh

ENTRYPOINT ["/root/entrypoint.sh"]
