#!/bin/sh
set -eu
umask 077

pm2 start sandbox -- -mount-conf /root/.hydro/mount.yaml -http-addr=127.0.0.1:5050
exec pm2-runtime start hydrojudge
