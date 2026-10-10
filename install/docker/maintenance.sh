#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() {
    cat <<'USAGE'
用法：maintenance.sh (--manual|--scheduled) [选项]
备份 data/、docker-compose.yml 和 oj-backend 容器实际使用的镜像，
然后重新启动 Compose 容器。仅保留最近一次成功的备份。

  --manual             手动执行
  --scheduled          定时任务执行
  --compose-file 文件  默认：./docker-compose.yml
  --backup-dir 目录    默认：Compose 文件所在目录下的 backup-file/
  --timeout 秒数       停止容器的超时时间（默认：60 秒）
  --wait-timeout 秒数  等待服务启动的超时时间（默认：300 秒）
  --help               显示帮助

复制 data/ 时会停止所有 Compose 容器，包括 MongoDB。
镜像使用 docker-oj-backend:backup-* 标签保存为未压缩的 tar 文件。
导出完成后会删除 Docker 中的临时标签。
USAGE
}
log() { printf '[%s] %s\n' "$(date '+%F %T %z')" "$*"; }
fail() { log "错误：$*" >&2; exit 1; }
mode=''
compose_file='./docker-compose.yml'
backup_dir=''
shutdown_timeout=60
wait_timeout=300
while (($#)); do
    case "$1" in
        --manual|--scheduled) mode="${1#--}"; shift ;;
        --compose-file|--backup-dir|--timeout|--wait-timeout)
            (($# >= 2)) || fail "参数 $1 缺少值"
            case "$1" in
                --compose-file) compose_file="$2" ;;
                --backup-dir) backup_dir="$2" ;;
                --timeout) shutdown_timeout="$2" ;;
                --wait-timeout) wait_timeout="$2" ;;
            esac
            shift 2 ;;
        --help|-h) usage; exit 0 ;;
        *) fail "未知参数：$1" ;;
    esac
done
[[ -n "$mode" ]] || { usage; exit 2; }
[[ "$shutdown_timeout" =~ ^[1-9][0-9]*$ && "$wait_timeout" =~ ^[1-9][0-9]*$ ]] || fail '超时时间必须为正整数'
for tool in docker flock realpath mktemp cp sha256sum; do
    command -v "$tool" >/dev/null || fail "缺少命令：$tool"
done
[[ -f "$compose_file" ]] || fail "找不到 Compose 文件：$compose_file"
compose_file="$(realpath -- "$compose_file")"
compose_dir="$(dirname -- "$compose_file")"
backup_dir="$(realpath -m -- "${backup_dir:-$compose_dir/backup-file}")"
[[ "$backup_dir" != '/' && "$compose_dir/" != "$backup_dir/"* ]] || fail '备份目录不能是项目目录或其上级目录'
[[ "$backup_dir/" != "$compose_dir/data/"* ]] || fail '备份目录不能位于 data/ 内'
[[ -d "$compose_dir/data" && ! -L "$compose_dir/data" ]] || fail 'Compose 文件所在目录下必须存在非符号链接的 data/ 目录'
cd -- "$compose_dir"
exec 9>"${compose_file}.maintenance.lock"
flock -n 9 || { log '已有备份或恢复任务正在运行'; exit 75; }
previous="$backup_dir.previous"
[[ ! -e "$previous" ]] || fail "发现中断的备份：$previous；请先保留并检查该目录，再继续操作"
if [[ -e "$backup_dir" ]]; then
    [[ -d "$backup_dir" && -f "$backup_dir/.hydro-backup" ]] || fail "拒绝覆盖非本脚本管理的目录：$backup_dir"
    [[ "$(cat "$backup_dir/.hydro-backup")" == 'hydro-backup-v2' ]] || fail '无法识别备份目录'
fi
compose=(docker compose -f "$compose_file")
"${compose[@]}" config --quiet
ids="$("${compose[@]}" ps --all --quiet oj-backend)"
[[ -n "$ids" && "$ids" != *$'\n'* ]] || fail '必须存在且仅存在一个 oj-backend 容器'
image_id="$(docker inspect --format '{{.Image}}' "$ids")"
[[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || fail '后端镜像 ID 无效'
all_ids="$("${compose[@]}" ps --all --quiet)"
[[ -n "$all_ids" ]] || fail '未找到 Compose 容器'
mapfile -t containers <<< "$all_ids"
mkdir -p -- "$(dirname -- "$backup_dir")"
stage="$(mktemp -d "${backup_dir}.work-XXXXXXXX")"
stamp="$(date '+%Y%m%d-%H%M%S')-$$"
temporary_tag="docker-oj-backend:backup-$stamp"
tag_created=false
needs_start=false
keep_stage=false
backup_published=false
cleanup() {
    local status=$?
    trap - EXIT
    set +e
    if [[ "$tag_created" == true ]]; then
        docker image rm --force --no-prune "$temporary_tag" || log "请手动删除临时标签：$temporary_tag"
    fi
    if [[ "$needs_start" == true ]]; then
        log '备份失败，正在尝试重新启动容器'
        "${compose[@]}" start --wait --wait-timeout "$wait_timeout" || log '容器启动失败，请执行 docker compose ps 检查状态'
    fi
    if [[ -d "$stage" ]]; then
        if [[ "$keep_stage" == true ]]; then
            log "已完成的备份保留在：$stage"
        else
            rm -rf -- "$stage"
        fi
    fi
    if ((status != 0)); then
        if [[ "$backup_published" == true ]]; then
            log "维护未完成，本次完整备份已保存至：$backup_dir；请检查上述错误和容器状态"
        else
            log '备份未替换成功，之前的备份（如有）已保留'
        fi
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ "$mode" == manual ]]; then log '开始手动备份'; else log '开始定时备份'; fi
docker image tag "$image_id" "$temporary_tag"
tag_created=true
docker image save --output "$stage/docker-oj-backend-$stamp.tar" "$temporary_tag"
docker image rm --force --no-prune "$temporary_tag"
tag_created=false

# 必须停止数据库写入后再复制 MongoDB 文件。
needs_start=true
"${compose[@]}" stop --timeout "$shutdown_timeout"
for container in "${containers[@]}"; do
    state="$(docker inspect --format '{{.State.Status}}' "$container")"
    [[ "$state" == 'exited' || "$state" == 'created' ]] || fail "容器 $container 尚未停止（当前状态：$state）"
done
log '容器已停止，正在复制数据和配置'
cp -a --reflink=auto -- "$compose_dir/data" "$stage/data"
cp -a -- "$compose_file" "$stage/docker-compose.yml"
for file in judge.yaml mount.yaml .env; do
    [[ ! -f "$compose_dir/$file" ]] || cp -a -- "$compose_dir/$file" "$stage/$file"
done
printf 'hydro-backup-v2\n' > "$stage/.hydro-backup"
keep_stage=true

# 完整备份就绪后先替换目录，避免服务启动失败使新备份一直留在临时目录。
# 使用 -T 防止目标目录存在时将源目录嵌套移入其中。
if [[ -d "$backup_dir" ]]; then mv -T -- "$backup_dir" "$previous"; fi
if ! mv -T -- "$stage" "$backup_dir"; then
    [[ ! -d "$previous" ]] || mv -T -- "$previous" "$backup_dir"
    fail '无法将备份放入正式备份目录'
fi
backup_published=true
[[ ! -d "$previous" ]] || rm -rf -- "$previous"
log "备份已保存：$backup_dir"
# 仅在新备份保存成功后清理旧版遗留的完整临时备份，跳过符号链接和无标记目录。
for stale in "$backup_dir".work-*; do
    [[ -d "$stale" && ! -L "$stale" && -f "$stale/.hydro-backup" ]] || continue
    [[ "$(cat "$stale/.hydro-backup")" == 'hydro-backup-v2' ]] || continue
    rm -rf -- "$stale"
    log "已清理旧临时备份：$stale"
done
needs_start=false
if ! "${compose[@]}" start --wait --wait-timeout "$wait_timeout"; then
    fail '容器启动或健康检查失败，请执行 docker compose ps 和 docker compose logs 检查'
fi
# 仅清理属于当前 Compose 文件路径的旧版备份标签。
legacy_hash="$(printf '%s' "$compose_file" | sha256sum)"
legacy_repository="hydro-maintenance-${legacy_hash:0:16}"
if legacy_tags="$(docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$legacy_repository:*")"; then
    while IFS= read -r legacy_tag; do
        [[ "$legacy_tag" == "$legacy_repository:"* ]] || continue
        docker image rm --force --no-prune "$legacy_tag" || log "无法删除旧版备份标签：$legacy_tag"
    done <<< "$legacy_tags"
else
    log '无法查询旧版备份标签，请在 Docker 恢复可用后清理'
fi
log "备份完成：$backup_dir（数据、Compose 配置、后端镜像 tar 文件）"
