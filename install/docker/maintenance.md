# 每日容器重启与镜像备份

将 `maintenance.sh` 复制到服务器，与现有 Compose 文件放在一起。脚本要求 Bash、Docker Compose v2、`flock`、`gzip` 和 Ubuntu 提供的 GNU 命令行工具；执行用户需要有 Docker 权限。

## 手动执行

```bash
cd
chmod +x maintenance.sh
./maintenance.sh --manual --compose-file docker-compose.yml
```

定时和手动模式执行相同的操作，模式名称用于日志。`--backup-dir` 可指定备份目录，默认使用 Compose 所在目录的 `image-backups`。`--timeout` 控制每个容器停止时的等待时间，默认 60 秒；`--wait-timeout` 控制重启后等待容器运行和健康检查通过的时间，默认 300 秒。

脚本依次执行以下操作：

1. 获取文件锁，避免定时和手动任务同时运行。
2. 读取 Compose 中已有容器实际使用的镜像 ID，并为每个不同的镜像创建专用备份标签。不根据可能已经被新版本覆盖的 `latest` 标签选择镜像。
3. 使用 `docker image save` 导出到临时目录并压缩；成功后发布完整备份。
4. 执行 `docker compose restart`，重启已有的服务容器。
5. 等待容器处于运行状态；有 healthcheck 的容器必须通过检查。没有 healthcheck 的评测容器只检查运行状态，这不能证明它已经成功连接评测后端。
6. 清理本脚本为同一 Compose 文件创建的旧备份目录和专用镜像标签，只保留最近一次成功备份。同一天多次执行也会轮换；任一步失败都保留上一份备份。

没有已有容器时，脚本退出，不创建容器。重启失败或健康检查超时，脚本以非零状态退出并保留已导出的新备份和旧备份。此时先查看日志和 `docker compose ps`，确认服务状态。

## 每天凌晨 03:00 执行

先确认服务器时区：

```bash
timedatectl
```

以下 cron 表达式按照**服务器时区**执行。如果希望北京时间凌晨 03:00 执行，服务器应处于 UTC+8 时区（例如 Asia/Shanghai 或 Asia/Hong_Kong）。

使用有 Docker 权限的用户执行 `crontab -e`，追加一行：

```cron
0 3 * * * /bin/bash maintenance.sh --scheduled --compose-file docker-compose.yml >> maintenance.log 2>&1
```

脚本不自动修改 crontab，以免在开发机上安装服务器任务。重启会产生短暂不可用，并中断当前连接和可能正在执行的评测任务；这是定时维护，不是蓝绿更新。

## 备份内容和恢复

每次备份位于 `image-backups/snapshot-<时间>-<随机编号>/`：

- `images.tar.gz`：包含本次容器使用的所有不同镜像，以备份标签保存。
- `containers.tsv`：容器、服务名、原镜像 ID、原引用和备份标签的对应关系。
- `image-tags.txt`：本次导出的备份标签。
- `success`：存在时表示本次重启后的运行状态检查通过。

恢复镜像时，先执行：

```bash
docker load -i /完整路径/images.tar.gz
```

随后根据 `containers.tsv` 找到需要恢复的服务对应的备份标签，将该标签填写到 Compose 的 `image`，再针对该服务执行 `docker compose up -d --no-deps`。仅执行 `restart` 不会切换到恢复的镜像。

脚本保留业务镜像标签，也不会强制删除被容器使用的镜像。旧镜像还被业务标签或容器引用时，清理专用备份标签不一定释放其镜像层；脚本不会执行全局 `docker image prune`。

**镜像备份不包含 MongoDB 数据、题目、提交文件及宿主机挂载的配置目录，也不包含容器运行后写入可写层的内容。** 这些数据需要单独备份。每次维护都会重新导出镜像，磁盘需要能同时容纳旧备份和新备份。

`restart` 继续使用已有容器的镜像。即使先执行 `docker load` 覆盖了 `latest`，重启也不会自动部署新镜像；更新版本仍需执行 `docker compose up -d --no-deps oj-backend`。

## 验证脚本

在仓库根目录执行：

```bash
bash -n install/docker/maintenance.sh
node -r @hydrooj/register install/docker/tests/maintenance.spec.ts
```

测试使用模拟 Docker，不会重启真实容器或删除真实镜像。
