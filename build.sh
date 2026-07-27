#!/usr/bin/env bash
# Build the console plugin image on this machine and push it to a registry.
#
# No cluster required: this builds with local Docker and pushes to a normal registry,
# which is also the answer to the in-cluster path (`bin/pluginctl image-build|deploy`)
# having its build pod evicted whenever the node is short of ephemeral storage.
# `oc` is only touched for --rollout, and for the special case of pushing into a
# cluster's own internal registry.
#
#   ./build.sh                       build + push the default target (ocp-4.22)
#   ./build.sh ocp-4.20              build + push one other target
#   ./build.sh --all                 build + push every target
#   ./build.sh --rollout             ...and restart the plugin deployment (needs oc)
#   ./build.sh --no-push             build only, leave it in the local image store
#   ./build.sh selftest              pure-logic asserts, no cluster and no build
#
# Config (all overridable via env):
#   REGISTRY_BASE   <host>/<project> to push to (default: ghcr.io/rummens). Credentials
#                   come from whatever `docker login` already holds.
#   IMAGE_NAME      image name under REGISTRY_BASE (default: dcs-academy-console-plugin)
#   DEFAULT_TARGET  target built when none is named (default: ocp-4.22, tag 0.1.0-ocp4.22)
#   NAMESPACE       plugin namespace, used by --rollout
#   DEPLOYMENT      deployment --rollout restarts (default: academy-guidance, the chart's
#                   name — which is not the image name)
#   PLATFORMS       buildx platform list, default linux/amd64,linux/arm64. A push that
#                   omits the consumer's architecture fails its pull with "no image found
#                   in image index for architecture ...". Pushing into a cluster's own
#                   registry instead defaults to that cluster's node architecture.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IMAGE_NAME="${IMAGE_NAME:-dcs-academy-console-plugin}"
NAMESPACE="${NAMESPACE:-academy-console-plugin}"
# The tag comes from the target's own target.env, so naming the default target here is
# what fixes the default tag at 0.1.0-ocp4.22.
DEFAULT_TARGET="${DEFAULT_TARGET:-ocp-4.22}"
# The chart names the deployment after the plugin, not after the image repository.
DEPLOYMENT="${DEPLOYMENT:-academy-guidance}"
PLATFORMS_EXPLICIT="${PLATFORMS+yes}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
REGISTRY_BASE="${REGISTRY_BASE:-ghcr.io/rummens}"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mERR\033[0m %s\n' "$*" >&2; exit 1; }

# ---- pure helpers (covered by selftest) ------------------------------------

# Every directory under targets/ that carries a target.env.
all_targets() {
  local dir
  for dir in "$ROOT"/targets/*/; do
    [ -f "${dir}target.env" ] && basename "$dir"
  done
}

# The image tag a target ships under, from its own target.env — the single source of
# truth the chart and the ArgoCD application also read.
target_tag() {
  local env_file="$ROOT/targets/$1/target.env" tag
  [ -f "$env_file" ] || die "unknown target: $1 (have: $(all_targets | tr '\n' ' '))"
  tag="$(sed -n 's/^IMAGE_TAG=//p' "$env_file" | head -1)"
  [ -n "$tag" ] || die "IMAGE_TAG is not set in $env_file"
  printf '%s' "$tag"
}

# Host part of a <host>/<path> reference, for deciding whether to log in with the
# cluster's token.
registry_host() { printf '%s' "${1%%/*}"; }

# ---- registry --------------------------------------------------------------

# All three of these answer "nothing" without oc or without a cluster, which is the
# standalone case: the script then behaves like any other registry push.
have_oc() { command -v oc >/dev/null 2>&1; }

cluster_registry_host() {
  have_oc || return 0
  oc get route default-route -n openshift-image-registry \
    -o jsonpath='{.spec.host}' 2>/dev/null || true
}

cluster_arch() {
  oc get nodes -o jsonpath='{.items[0].status.nodeInfo.architecture}' 2>/dev/null || true
}

# True when the push target is the connected cluster's own registry.
pushing_to_cluster() {
  local host
  host="$(cluster_registry_host)"
  [ -n "$host" ] && [ "$(registry_host "$REGISTRY_BASE")" = "$host" ]
}

# Only the cluster's own registry gets an automatic login; an external registry uses
# whatever credentials docker already holds, so nothing here touches them.
ensure_login() {
  pushing_to_cluster || return 0
  local host
  host="$(registry_host "$REGISTRY_BASE")"
  log "logging in to $host as the current oc user"
  oc whoami -t | docker login -u "$(oc whoami)" --password-stdin "$host" >/dev/null
}

# ---- build -----------------------------------------------------------------

build_one() {
  local target="$1" push="$2" via_daemon="$3" reference
  reference="$REGISTRY_BASE/$IMAGE_NAME:$(target_tag "$target")"

  # pluginctl owns the build context: shared src/ plus that target's adapters and deps.
  log "assembling the build context for $target"
  "$ROOT/bin/pluginctl" prepare "$target" >/dev/null

  log "building $reference for $PLATFORMS"
  local output=(--push)
  if [ "$via_daemon" = "true" ]; then
    # buildx runs the build in its own container, which cannot reach a registry that the
    # workstation resolves to 127.0.0.1 — every CRC route does. Hand the image to the
    # docker daemon instead and let that push it.
    output=(--load)
  elif [ "$push" != "true" ]; then
    # buildx cannot load a multi-platform result into the local store, so a --no-push run
    # of a two-architecture list would silently produce nothing to keep.
    case "$PLATFORMS" in
      *,*) output=(--output=type=cacheonly) ;;
      *) output=(--load) ;;
    esac
  fi
  docker buildx build --platform "$PLATFORMS" "${output[@]}" \
    -t "$reference" -f "$ROOT/.build/$target/Dockerfile" "$ROOT/.build/$target"
  if [ "$via_daemon" = "true" ] && [ "$push" = "true" ]; then
    log "pushing $reference"
    docker push "$reference"
  fi
  log "done: $reference"
}

rollout() {
  have_oc || die "--rollout needs oc on PATH and a logged-in cluster"
  log "restarting deployment/$DEPLOYMENT in $NAMESPACE"
  oc rollout restart "deployment/$DEPLOYMENT" -n "$NAMESPACE"
  oc rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=5m
}

# ---- selftest --------------------------------------------------------------

selftest() {
  local targets
  targets="$(all_targets)"
  grep -qx 'ocp-4.22' <<<"$targets" || die "all_targets missed ocp-4.22 ($targets)"
  [ "$(target_tag ocp-4.22)" = "0.1.0-ocp4.22" ] || die "target_tag ocp-4.22"
  [ "$(target_tag ocp-4.20)" = "0.1.0-ocp4.20" ] || die "target_tag ocp-4.20"
  [ "$(registry_host 'ghcr.io/rummens')" = "ghcr.io" ] || die "registry_host with path"
  [ "$(registry_host 'localhost:5000')" = "localhost:5000" ] || die "registry_host bare"
  # The default target is what fixes the default tag; a rename must not slip past.
  [ "$(target_tag "$DEFAULT_TARGET")" = "0.1.0-ocp4.22" ] || die "default tag"
  ( target_tag nope 2>/dev/null ) && die "target_tag accepted an unknown target"
  echo "selftest OK"
}

# ---- dispatch --------------------------------------------------------------

push=true
do_rollout=false
build_all=false
targets=()
while [ $# -gt 0 ]; do
  case "$1" in
    selftest) selftest; exit 0 ;;
    --no-push) push=false ;;
    --rollout) do_rollout=true ;;
    --all) build_all=true ;;
    -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 0 ;;
    -*) die "unknown flag: $1" ;;
    *) targets+=("$1") ;;
  esac
  shift
done

command -v docker >/dev/null || die "docker with buildx is required
  (podman users: bin/pluginctl container-build <target> builds a single-arch image locally)"
docker buildx version >/dev/null 2>&1 || die "docker buildx is required"

# No mapfile: macOS ships bash 3.2, where it does not exist.
if [ "$build_all" = "true" ]; then
  targets=()
  while read -r t; do targets+=("$t"); done < <(all_targets)
elif [ ${#targets[@]} -eq 0 ]; then
  targets=("$DEFAULT_TARGET")
fi
for target in "${targets[@]}"; do target_tag "$target" >/dev/null; done

via_daemon=false
if [ "$push" = "true" ]; then
  [ -n "$REGISTRY_BASE" ] || die "REGISTRY_BASE is empty; set <host>/<project>"
  ensure_login
  if pushing_to_cluster; then
    via_daemon=true
    # One cluster, one architecture: a dev-loop image does not need the other, and
    # --load takes a single platform anyway.
    if [ -z "$PLATFORMS_EXPLICIT" ]; then
      arch="$(cluster_arch)"
      [ -n "$arch" ] || die "cannot read the cluster's node architecture; set PLATFORMS"
      PLATFORMS="linux/$arch"
      log "PLATFORMS defaulted to the cluster's own architecture: $PLATFORMS"
    fi
    case "$PLATFORMS" in
      *,*) die "the cluster registry is pushed through the docker daemon, which takes one
  platform at a time. Drop PLATFORMS, or push a multi-architecture image to an external
  registry instead." ;;
    esac
  fi
else
  REGISTRY_BASE="${REGISTRY_BASE:-local}"
fi

for target in "${targets[@]}"; do build_one "$target" "$push" "$via_daemon"; done
[ "$do_rollout" = "true" ] && rollout
exit 0
