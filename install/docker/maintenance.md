# 定时备份、重启和恢复

将 `maintenance.sh`、`restore.sh` 放到服务器的 Compose 所在目录。需要 Bash、Docker Compose v2（支持 `start --wait`）、`flock`、GNU coreutils，以及恢复脚本使用的 Python 3。以能够访问 Docker 并保留 `data/` 文件属主、权限的用户执行，通常使用 root。

## 备份目录

默认只保留一份完整备份，目录为 `backup-file/`，不再创建每日 snapshot 子目录：

```text
backup-file/
├── data/
├── docker-compose.yml
├── docker-oj-backend-20261007-030000-12345.tar
├── judge.yaml       # 原目录存在时备份
├── mount.yaml       # 原目录存在时备份
└── .env             # 原目录存在时备份
```

目录还包含一个隐藏标记 `.hydro-backup`，用于防止脚本误删普通目录。没有容器清单、镜像标签清单或额外的成功标记文件。

镜像 tar 不压缩，只包含 `oj-backend` 容器实际使用的镜像。tar 内的名称为 `docker-oj-backend:backup-日期-时间-进程号`；导出后立即移除这个临时标签，`docker images` 不会因此长期增加备份标签。现有部署标签和正在使用的镜像继续保留。

## 手动备份及每天 03:00 执行

在部署目录执行：

```bash
chmod +x maintenance.sh restore.sh
./maintenance.sh --manual
```

执行顺序：导出后端镜像 → 停止 Compose 容器 → 确认容器停止 → 复制 `data/` 和配置 → 用完整新备份替换旧备份并清理旧临时备份 → 启动已有容器并等待健康检查。

**`data/` 包含 MongoDB 的物理数据文件，必须停止数据库写入再复制。停机时间包含数据复制和容器启动时间。** 数据目录使用 `cp -a --reflink=auto` 复制，保留文件属主和权限。这里只支持题目、数据库和后端配置都位于 Compose 旁边 `data/` 的部署布局；外部数据库、其他目录和 Docker named volume 不在备份范围内。

新备份完整保存后，自动删除上一份备份，并清理同一备份路径下带有 `hydro-backup-v2` 标记的旧 `.work-*` 目录；符号链接和无标记目录不自动删除。导出失败时不停止服务；复制失败时保留旧备份并尝试重新启动原容器。启动或健康检查失败时，本次完整备份仍保存在 `backup-file/`，脚本返回非零退出码并提示检查容器。不会执行全局镜像清理。

更新服务器上的 `maintenance.sh` 后，只要脚本路径和参数不变，原定时任务无需修改，也不需要重启 cron。若遗留 `.work-*` 目录没有备份标记，需检查维护日志和目录内容后再手动处理。

使用 `crontab -e` 添加以下任务，将 `/实际部署目录` 换成真实绝对路径：

```cron
0 3 * * * /bin/bash /实际部署目录/maintenance.sh --scheduled --compose-file /实际部署目录/docker-compose.yml >> /实际部署目录/maintenance.log 2>&1
```

cron 按服务器时区执行，可用 `timedatectl` 核对。需要北京时间凌晨 03:00 时，服务器应使用 UTC+8 时区。脚本不会自行安装定时任务。

## 恢复

在部署目录选择一种模式执行：

```bash
# 仅恢复后端镜像，重建 oj-backend；不替换 data/ 或配置文件
./restore.sh --image

# 恢复 data/、Compose 和附带的配置、后端镜像，重建所有服务
./restore.sh --all
```

恢复脚本导入 tar 内的日期标签，将其重新标记为 Compose 中 `oj-backend` 配置的部署标签（例如 `docker-oj-backend:latest`），再移除临时日期标签。因此恢复后的运行镜像仍叫 `docker-oj-backend`。

**`--all` 会覆盖当前数据和配置，备份之后新增的数据也会被替换。** 脚本先准备待恢复数据、导入镜像，再停止容器；原数据和配置暂存到 `restore-previous-*`。恢复成功后删除暂存文件；恢复失败则保留并输出路径，供检查或手动退回。失败时不会自动把可能已经开始写入的两套数据库混合起来。

全部恢复会强制重建容器，以便 bind mount 使用恢复后的数据目录。仅镜像恢复也会重建后端，因为单纯 `restart` 不会应用新镜像。无 healthcheck 的评测容器只能确认进程运行，实际评测连接需另行验证。

MongoDB 和评测机镜像没有包含在备份中，全部恢复要求服务器上已有 Compose 指定的这两个镜像，且 MongoDB 版本与物理数据备份兼容。数据目录复制、恢复预备数据和保留原数据均需要额外磁盘空间。

两个脚本都支持 `--compose-file FILE`、`--backup-dir DIR`、`--timeout SECONDS`（默认 60）和 `--wait-timeout SECONDS`（默认 300）。备份和恢复共享文件锁，防止同时执行。正常备份只是停止再启动已有容器，不会自动应用另行 `docker load` 的新镜像。

## 旧版备份迁移

旧版 `image-backups/` 不含数据库和配置，不能用于新的 `--all` 恢复。新的完整备份成功后，脚本自动移除旧脚本为**当前 Compose 路径**创建的 `hydro-maintenance-*` 标签，保留业务标签及其他项目的标签。旧 `image-backups/` 归档目录可在确认新备份可用后自行清理。

## 验证

```bash
bash -n install/docker/maintenance.sh
bash -n install/docker/restore.sh
node -r @hydrooj/register install/docker/tests/maintenance.spec.ts
```

测试通过模拟 Docker 和临时数据目录覆盖备份、恢复、失败保护和并发锁，不操作真实容器或生产数据。
