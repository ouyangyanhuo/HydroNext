## 首要条件

> [!WARNING]
> docker 安装方式仅适用于可熟练使用 docker-compose 维护容器的用户，并要求您有基础的错误排查能力  
> 该安装模块非官方维护，即不会提供任何技术支持  
> 普通用户请务必使用自动脚本安装，这可大大提高您一次成功的可能性

本文假设您已经安装了 `docker`、`docker-compose`、`git`，**未安装请先安装**。

## 开始安装（请使用 Linux）

1. 请选择磁盘空间富裕的位置，运行下面的命令。

   `git clone https://github.com/hydro-dev/Hydro.git && cd Hydro/install/docker`

2. 启动服务。

   `docker compose up -d`

在本机制作 docker 镜像耗时可能会比较长。根据网络情况，大约 5 到 30 分钟就可以自动搭建完成，全程无需人工干预。

命令执行完成后运行 `docker ps -a`，当看到所有的容器的状态没有 `Exited (x) xxx` 就代表 OJ 已经启动成功。

## 独立项目与网络

Compose 配置固定使用项目名 `hydro` 和网络名 `hydro-network`，避免与其他同名 `docker` 目录中的项目混用网络或误报孤立容器。请使用支持顶层 `name` 的 Docker Compose V2 或更新版本，并确保没有通过 `-p` 或 `COMPOSE_PROJECT_NAME` 覆盖项目名。

如果已经使用旧项目名 `docker` 启动过服务，请在 `install/docker` 目录执行以下命令迁移。迁移会短暂中断 Hydro 服务，执行前请等待正在进行的评测结束。

```bash
# 保留现有后端镜像；任一步失败都会停止后续迁移操作。
sudo docker image tag "$(sudo docker inspect --format '{{.Image}}' oj-backend)" hydro-oj-backend:latest &&
sudo docker compose -p docker stop oj-judge oj-backend oj-mongo &&
sudo docker container rm oj-judge oj-backend oj-mongo &&
sudo docker compose up -d --no-build --pull never &&
sudo docker compose ps
```

旧的 `docker_default` 网络可能仍被其他项目使用，可以保留。不要使用 `--remove-orphans` 清理共享旧项目中的容器。

## 更新评测机

在 `install/docker` 目录执行 `docker compose build oj-judge`，会从当前仓库源码构建 `docker-oj-judge:latest`。
评测器的生产依赖按 `yarn.lock` 安装，镜像固定使用 go-judge 1.13.3，并对沙箱二进制和仓库指定版本的 testlib 头文件校验 SHA-256。
构建成功后，执行 `docker compose up -d --no-deps oj-judge` 应用更新；请在没有正在进行的评测时重建容器。

沙箱 HTTP 接口只监听容器内的 `127.0.0.1:5050`，评测配置和挂载配置以只读方式提供。
评测器在启动时必须确认沙箱具有符号链接逃逸防护；无法连接或未确认防护时会拒绝接单。
沙箱响应缺少必要字段、返回未知状态或结果数量不匹配时，会终止本次评测并报告系统错误。
此镜像支持 amd64 和 arm64；可核对 [go-judge 发行包](https://github.com/criyle/go-judge/releases/tag/v1.13.3)和校验值。

## 每日维护

容器定时重启、数据与后端镜像备份，以及完整恢复或仅镜像恢复方法见 [每日维护说明](maintenance.md)。

## 后台运行时间

系统管理员可在“系统管理”首页查看后端容器的启动时间与连续运行时长，时长每秒更新。
默认 Docker 部署按容器 PID 1 计时，而不是宿主机或 Hydro 工作进程的运行时间；应用重载不会重置计时，容器重新启动后刷新页面即可看到新的启动时间。
此功能无需 Docker socket、额外容器权限或数据库迁移，也不统计 MongoDB 和评测机容器。
非容器环境或容器计时读取失败时，页面会明确切换为应用进程运行时间。
读取依据为 Linux [进程启动时钟计数](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html)及系统运行时钟，启动日期时间按服务端时钟推算，前端按浏览器时区展示。

## 注意

安装过程中，会默认注册一个 uid 为 2 的测评账号。用户名：`judge`，密码：`examplepassword`。**请务必及时修改密码**。修改该账号密码后，请修改 `judge/judge.yaml` 中的 `password`。否则可能会无法测评。

## 测评机默认编译器

测评机默认安装了以下编译器，如有需要，请自行安装：

1. gcc
2. python3
3. g++
4. fp-compiler
5. openjdk-17-jdk-headless
6. php-cli
7. rustc
8. ghc
9. libjavascriptcoregtk-4.0-bin
10. golang
11. ruby
12. mono-runtime
13. mono-mcs
