#!/bin/sh

ROOT=/root/.hydro

# Always update addon.json to ensure correct paths
echo '["@hydrooj/ui-default","/opt/hydro-addons/code-replay","/opt/hydro-addons/contest-settings"]' > "$ROOT/addon.json"

if [ ! -f "$ROOT/config.json" ]; then
    echo '{"host": "oj-mongo", "port": "27017", "name": "hydro", "username": "", "password": ""}' > "$ROOT/config.json"
fi

    echo "for marking use only!" > "$ROOT/first"

    hydrooj cli user create systemjudge@systemjudge.local judge examplepassword 2
    hydrooj cli user setJudge 2
    # Always ensure server binds to all interfaces (required for Docker)
    hydrooj cli system set server.host 0.0.0.0

pm2-runtime start hydrooj
