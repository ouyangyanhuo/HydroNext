#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() {
    cat <<'USAGE'
Usage: maintenance.sh (--manual|--scheduled) [options]

Back up the images used by existing Compose containers, restart those
containers, and retain only the latest successful image backup.

Options:
  --compose-file FILE   Compose file (default: ./docker-compose.yml)
  --backup-dir DIR      Backup directory (default: COMPOSE_DIR/image-backups)
  --timeout SECONDS     Container shutdown timeout (default: 60)
  --wait-timeout SEC    Readiness timeout after restart (default: 300)
  --help               Show this help

Scheduling is configured separately with cron, in the server's time zone.
This does not deploy new images or back up databases/bind-mounted files.
USAGE
}

log() { printf '[%s] %s\n' "$(date '+%F %T %z')" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

mode=''
compose_file='./docker-compose.yml'
backup_dir=''
shutdown_timeout=60
wait_timeout=300
while (($#)); do
    case "$1" in
        --manual|--scheduled) mode="${1#--}"; shift ;;
        --compose-file|--backup-dir|--timeout|--wait-timeout)
            (($# >= 2)) || fail "Missing value for $1"
            case "$1" in
                --compose-file) compose_file="$2" ;;
                --backup-dir) backup_dir="$2" ;;
                --timeout) shutdown_timeout="$2" ;;
                --wait-timeout) wait_timeout="$2" ;;
            esac
            shift 2
            ;;
        --help|-h) usage; exit 0 ;;
        *) usage >&2; fail "Unknown argument: $1" ;;
    esac
done
[[ -n "$mode" ]] || { usage >&2; exit 2; }
[[ "$shutdown_timeout" =~ ^[1-9][0-9]*$ && "$wait_timeout" =~ ^[1-9][0-9]*$ ]] \
    || fail 'Timeouts must be positive integers'
for command in docker flock gzip realpath sha256sum mktemp; do
    command -v "$command" >/dev/null || fail "Required command not found: $command"
done
[[ -f "$compose_file" ]] || fail "Compose file not found: $compose_file"
compose_file="$(realpath -- "$compose_file")"
compose_dir="$(dirname -- "$compose_file")"
backup_dir="$(realpath -m -- "${backup_dir:-$compose_dir/image-backups}")"
cd -- "$compose_dir"

# The lock is tied to the Compose file, even when --backup-dir is different.
exec 9>"${compose_file}.maintenance.lock"
flock -n 9 || { log 'Another maintenance run is active; skipping'; exit 75; }
compose=(docker compose -f "$compose_file")
"${compose[@]}" version >/dev/null
"${compose[@]}" config --quiet
services_output="$("${compose[@]}" config --services)"
[[ -n "$services_output" ]] || fail 'No Compose services found'
mapfile -t services <<< "$services_output"
containers=()
declare -A seen_containers=()
for service in "${services[@]}"; do
    ids="$("${compose[@]}" ps --all --quiet "$service")"
    while IFS= read -r container; do
        [[ -n "$container" ]] || continue
        if [[ -z "${seen_containers[$container]:-}" ]]; then
            containers+=("$container")
            seen_containers[$container]=1
        fi
    done <<< "$ids"
done
((${#containers[@]})) || fail 'No existing Compose containers; nothing to restart'

mkdir -p -- "$backup_dir"
project_hash="$(printf '%s' "$compose_file" | sha256sum)"
project_hash="${project_hash:0:16}"
repository="hydro-maintenance-$project_hash"
work_dir="$(mktemp -d "$backup_dir/.work-XXXXXXXX")"
run_id="$(date '+%Y%m%dT%H%M%S')-${work_dir##*/.work-}"
snapshot="$backup_dir/snapshot-$run_id"
tags=()
published=false
cleanup() {
    local status=$?
    trap - EXIT
    if [[ "$published" == false ]]; then
        for tag in "${tags[@]}"; do
            docker image rm --no-prune "$tag" >/dev/null 2>&1 || true
        done
        [[ ! -d "$work_dir" ]] || rm -rf -- "$work_dir"
    fi
    if ((status != 0)); then
        log 'Maintenance failed; previous backups have been retained' >&2
    fi
    exit "$status"
}
trap cleanup EXIT
printf '%s\n' "$project_hash" > "$work_dir/project-id"
printf 'container\tservice\timage_id\toriginal_reference\tbackup_tag\n' > "$work_dir/containers.tsv"
declare -A image_tags=()
log "Starting $mode maintenance for $compose_file"
for container in "${containers[@]}"; do
    info="$(docker inspect --format '{{.Image}}{{printf "\t"}}{{.Config.Image}}{{printf "\t"}}{{index .Config.Labels "com.docker.compose.service"}}' "$container")"
    IFS=$'\t' read -r image_id original_reference service <<< "$info"
    [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "Invalid image ID for $container"
    if [[ -z "${image_tags[$image_id]:-}" ]]; then
        tag="$repository:$run_id-${#tags[@]}"
        docker image tag "$image_id" "$tag"
        tags+=("$tag")
        image_tags[$image_id]="$tag"
    fi
    printf '%s\t%s\t%s\t%s\t%s\n' "$container" "$service" "$image_id" \
        "$original_reference" "${image_tags[$image_id]}" >> "$work_dir/containers.tsv"
done
printf '%s\n' "${tags[@]}" > "$work_dir/image-tags.txt"
log "Saving ${#tags[@]} image(s) before restart"
docker image save "${tags[@]}" | gzip > "$work_dir/images.tar.gz"
gzip -t "$work_dir/images.tar.gz"
mv -- "$work_dir" "$snapshot"
published=true
log "Image backup completed: $snapshot"

# restart uses existing container images; it does not apply a new latest tag.
"${compose[@]}" restart --no-deps --timeout "$shutdown_timeout" "${services[@]}"
deadline=$((SECONDS + wait_timeout))
while true; do
    ready=true
    for container in "${containers[@]}"; do
        state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")"
        case "$state" in
            'running healthy'|'running none') ;;
            *) ready=false ;;
        esac
    done
    [[ "$ready" == false ]] || break
    ((SECONDS < deadline)) || fail "Containers did not become ready within ${wait_timeout}s"
    sleep 2
done
touch "$snapshot/success"
log 'Containers are running; configured health checks have passed'

# Only delete directories and tags created by this script for this Compose file.
# Never prune the daemon or force-remove an image used by another container.
for previous in "$backup_dir"/snapshot-*; do
    [[ -d "$previous" && ! -L "$previous" && "$previous" != "$snapshot" ]] || continue
    [[ -f "$previous/project-id" && -f "$previous/image-tags.txt" ]] || continue
    [[ "$(cat "$previous/project-id")" == "$project_hash" ]] || continue
    removable=true
    while IFS= read -r tag; do
        if [[ "$tag" != "$repository:"* || ! "$tag" =~ ^[a-zA-Z0-9._:-]+$ ]]; then
            log "Invalid backup tag; retaining $previous" >&2
            removable=false
            break
        fi
        if ! existing_image="$(docker image ls --quiet --filter "reference=$tag")"; then
            log "Could not query $tag; retaining $previous" >&2
            removable=false
            continue
        fi
        if [[ -n "$existing_image" ]]; then
            if ! docker image rm --no-prune "$tag"; then
                log "Could not remove $tag; retaining $previous" >&2
                removable=false
            fi
        fi
    done < "$previous/image-tags.txt"
    if [[ "$removable" == true ]]; then
        rm -rf -- "$previous"
        log "Removed previous backup: $previous"
    fi
done
log "Maintenance completed; latest backup: $snapshot/images.tar.gz"
