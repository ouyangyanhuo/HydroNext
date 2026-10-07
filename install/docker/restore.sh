#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() {
    cat <<'USAGE'
用法：restore.sh (--all|--image) [选项]
  --all                恢复 data/、配置和后端镜像，然后重建并启动所有 Compose 服务
  --image              仅恢复后端镜像，并重建 oj-backend 容器
  --compose-file 文件  默认：./docker-compose.yml
  --backup-dir 目录    默认：Compose 文件所在目录下的 backup-file/
  --timeout 秒数       停止容器的超时时间（默认：60 秒）
  --wait-timeout 秒数  等待服务启动的超时时间（默认：300 秒）
  --help               显示帮助

完整恢复会覆盖当前数据和配置。如果停止服务后恢复失败，
原文件会保留在 restore-previous-* 目录中。
本脚本适用于 maintenance.sh 创建的备份（hydro-backup-v2 格式）。
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
        --all|--image)
            [[ -z "$mode" ]] || fail '必须且只能选择 --all 或 --image 中的一个'
            mode="${1#--}"; shift ;;
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
for tool in docker flock realpath mktemp cp python3; do
    command -v "$tool" >/dev/null || fail "缺少命令：$tool"
done
compose_file="$(realpath -m -- "$compose_file")"
compose_dir="$(dirname -- "$compose_file")"
[[ -d "$compose_dir" ]] || fail "项目目录不存在：$compose_dir"
backup_dir="$(realpath -- "${backup_dir:-$compose_dir/backup-file}")"
[[ "$backup_dir/" != "$compose_dir/data/"* && "$compose_dir/" != "$backup_dir/"* ]] || fail '备份目录不能位于 data/ 内，也不能是项目目录或其上级目录'
cd -- "$compose_dir"
exec 9>"${compose_file}.maintenance.lock"
flock -n 9 || { log '已有备份或恢复任务正在运行'; exit 75; }
[[ -f "$backup_dir/.hydro-backup" && "$(cat "$backup_dir/.hydro-backup")" == 'hydro-backup-v2' ]] || fail '无法识别备份'
shopt -s nullglob
archives=("$backup_dir"/docker-oj-backend-*.tar)
((${#archives[@]} == 1)) || fail '备份目录中必须且只能存在一个 docker-oj-backend 镜像 tar 文件'
archive="${archives[0]}"
filename="${archive##*/}"
[[ "$filename" =~ ^docker-oj-backend-([0-9]{8}-[0-9]{6}-[0-9]+)\.tar$ ]] || fail '无法识别镜像文件名'
temporary_tag="docker-oj-backend:backup-${BASH_REMATCH[1]}"
compose=(docker compose -f "$compose_file")
source_compose="$compose_file"
if [[ "$mode" == all ]]; then
    source_compose="$backup_dir/docker-compose.yml"
    [[ -d "$backup_dir/data" && ! -L "$backup_dir/data" ]] || fail '备份中的 data/ 目录不存在或为符号链接'
    [[ ! -L "$compose_dir/data" ]] || fail '拒绝替换符号链接形式的 data/ 目录'
fi
[[ -f "$source_compose" ]] || fail "缺少 Compose 文件：$source_compose"
# 从恢复后实际使用的配置中读取目标镜像名称。
source_env="$(dirname -- "$source_compose")/.env"
[[ -f "$source_env" ]] || source_env=/dev/null
target_image="$(docker compose --env-file "$source_env" -f "$source_compose" config --format json | python3 -c \
    'import json,sys; print(json.load(sys.stdin)["services"]["oj-backend"]["image"])')"
[[ "$target_image" =~ ^docker-oj-backend(:[A-Za-z0-9_][A-Za-z0-9_.-]*)?$ ]] || fail 'oj-backend 必须使用 docker-oj-backend 仓库的镜像标签'
[[ "$target_image" != "$temporary_tag" ]] || fail 'Compose 中必须使用部署标签，不能使用临时备份标签'
stage=''
checkpoint=''
tag_loaded=false
restore_started=false
complete=false
cleanup() {
    local status=$?
    trap - EXIT
    set +e
    if [[ "$tag_loaded" == true ]]; then
        docker image rm --force --no-prune "$temporary_tag" || log "请手动删除临时标签：$temporary_tag"
    fi
    [[ -z "$stage" || ! -d "$stage" ]] || rm -rf -- "$stage"
    if [[ -n "$checkpoint" && -d "$checkpoint" ]]; then
        if [[ "$complete" == true || "$restore_started" == false ]]; then
            rm -rf -- "$checkpoint"
        else
            log "恢复失败，原文件保留在：$checkpoint"
            log '重试或移回原文件前，请先检查容器状态'
        fi
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ "$mode" == all ]]; then
    stage="$(mktemp -d "$compose_dir/.restore-work-XXXXXXXX")"
    cp -a --reflink=auto -- "$backup_dir/data" "$stage/data"
    cp -a -- "$source_compose" "$stage/docker-compose.yml"
    for file in judge.yaml mount.yaml .env; do
        [[ ! -f "$backup_dir/$file" ]] || cp -a -- "$backup_dir/$file" "$stage/$file"
    done
fi
tag_loaded=true
docker image load --input "$archive"
image_id="$(docker image inspect --format '{{.Id}}' "$temporary_tag")"
[[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || fail '加载的后端镜像无效'
if [[ "$mode" == all ]]; then
    checkpoint="$(mktemp -d "$compose_dir/restore-previous-XXXXXXXX")"
    [[ ! -f "$compose_file" ]] || cp -a -- "$compose_file" "$checkpoint/docker-compose.yml"
    restore_started=true
    control_compose=("${compose[@]}")
    if [[ ! -f "$compose_file" ]]; then
        control_compose=(docker compose --project-directory "$compose_dir" --env-file "$source_env" -f "$source_compose")
    fi
    "${control_compose[@]}" stop --timeout "$shutdown_timeout"
    ids="$("${control_compose[@]}" ps --all --quiet)"
    while IFS= read -r container; do
        [[ -n "$container" ]] || continue
        state="$(docker inspect --format '{{.State.Status}}' "$container")"
        [[ "$state" == 'exited' || "$state" == 'created' ]] || fail "容器 $container 尚未停止（当前状态：$state）"
    done <<< "$ids"
    [[ ! -e "$compose_dir/data" ]] || mv -- "$compose_dir/data" "$checkpoint/data"
    mv -- "$stage/data" "$compose_dir/data"
    cp -a -- "$stage/docker-compose.yml" "$compose_file"
    for file in judge.yaml mount.yaml .env; do
        [[ ! -e "$compose_dir/$file" ]] || mv -- "$compose_dir/$file" "$checkpoint/$file"
        if [[ -f "$stage/$file" ]]; then
            mv -- "$stage/$file" "$compose_dir/$file"
        fi
    done
fi
docker image tag "$image_id" "$target_image"
docker image rm --force --no-prune "$temporary_tag"
tag_loaded=false
if [[ "$mode" == image ]]; then
    "${compose[@]}" up -d --no-deps --force-recreate --pull never --no-build \
        --wait --wait-timeout "$wait_timeout" oj-backend
else
    # 重建所有容器，使其绑定挂载指向恢复后的 data/ 目录。
    "${compose[@]}" up -d --force-recreate --pull never --no-build --wait --wait-timeout "$wait_timeout"
fi
complete=true
if [[ "$mode" == all ]]; then
    log "全部恢复完成：$target_image"
else
    log "仅镜像恢复完成：$target_image"
fi
