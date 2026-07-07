# shellcheck shell=bash
# Shared logging + step-summary helpers for deploy scripts.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/deploy_log.sh"
#   log::section "Publishing tarball"
#   log::info "Uploading to ${URL}"
#   summary::start "gitlab-lsp deploy"
#   summary::add "Generic package upload" "ok"   "uploaded ${URL}"
#   summary::add "NPM publish"            "skip" "dry-run"
#   summary::add "Release asset link"     "fail" "HTTP 500"
#   summary::print   # prints summary table; exits 1 if anything failed

# ---- ANSI colors (disabled when not a TTY and NO_COLOR isn't forced) --------
if [[ -t 1 ]] || [[ -n "$CI" ]]; then
  __C_RESET=$'\033[0m'
  __C_BOLD=$'\033[1m'
  __C_DIM=$'\033[2m'
  __C_RED=$'\033[31m'
  __C_GREEN=$'\033[32m'
  __C_YELLOW=$'\033[33m'
  __C_BLUE=$'\033[34m'
  __C_CYAN=$'\033[36m'
else
  __C_RESET=""; __C_BOLD=""; __C_DIM=""
  __C_RED=""; __C_GREEN=""; __C_YELLOW=""; __C_BLUE=""; __C_CYAN=""
fi

__log::ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

log::section() {
  printf '\n%s%s==== %s ====%s\n' "$__C_BOLD" "$__C_BLUE" "$*" "$__C_RESET"
}

log::info()  { printf '%s[INFO ]%s %s %s\n' "$__C_CYAN"   "$__C_RESET" "$(__log::ts)" "$*"; }
log::ok()    { printf '%s[OK   ]%s %s %s\n' "$__C_GREEN"  "$__C_RESET" "$(__log::ts)" "$*"; }
log::warn()  { printf '%s[WARN ]%s %s %s\n' "$__C_YELLOW" "$__C_RESET" "$(__log::ts)" "$*"; }
log::error() { printf '%s[ERROR]%s %s %s\n' "$__C_RED"    "$__C_RESET" "$(__log::ts)" "$*" >&2; }
log::debug() { [[ -n "$DEBUG" ]] && printf '%s[DEBUG]%s %s %s\n' "$__C_DIM" "$__C_RESET" "$(__log::ts)" "$*"; }

# Run a command, log it, and time it. Returns the command's exit code.
log::run() {
  log::info "\$ $*"
  local __start __end __rc
  __start=$(date +%s)
  "$@"
  __rc=$?
  __end=$(date +%s)
  if [[ $__rc -eq 0 ]]; then
    log::ok "(exit 0, $((__end - __start))s) $1"
  else
    log::error "(exit $__rc, $((__end - __start))s) $*"
  fi
  return $__rc
}

# ---- Summary table ----------------------------------------------------------
# Each entry is "STATUS|STEP|DETAIL" stored in __SUMMARY_ENTRIES.
__SUMMARY_TITLE=""
__SUMMARY_ENTRIES=()
__SUMMARY_HAS_FAIL=0
__SUMMARY_DRY_RUN="false"

summary::start() {
  __SUMMARY_TITLE="$1"
  __SUMMARY_DRY_RUN="${2:-false}"
  __SUMMARY_ENTRIES=()
  __SUMMARY_HAS_FAIL=0
}

# summary::add <step> <status: ok|fail|skip|info> [detail...]
summary::add() {
  local step="$1"; shift
  local status="$1"; shift
  local detail="${*:-}"
  case "$status" in
    fail) __SUMMARY_HAS_FAIL=1 ;;
  esac
  __SUMMARY_ENTRIES+=("${status}|${step}|${detail}")
  case "$status" in
    ok)   log::ok    "[summary] ${step}${detail:+ — $detail}" ;;
    fail) log::error "[summary] ${step}${detail:+ — $detail}" ;;
    skip) log::warn  "[summary] ${step} (skipped)${detail:+ — $detail}" ;;
    *)    log::info  "[summary] ${step}${detail:+ — $detail}" ;;
  esac
}

summary::print() {
  printf '\n%s%s===== %s — summary%s =====%s\n' \
    "$__C_BOLD" "$__C_BLUE" "$__SUMMARY_TITLE" \
    "$([[ "$__SUMMARY_DRY_RUN" == "true" ]] && echo " (dry-run)")" \
    "$__C_RESET"

  local fmt="  %-7s  %-40s  %s\n"
  # shellcheck disable=SC2059
  printf "$fmt" "STATUS" "STEP" "DETAIL"
  # shellcheck disable=SC2059
  printf "$fmt" "------" "----" "------"

  local entry status step detail color label
  for entry in "${__SUMMARY_ENTRIES[@]}"; do
    status="${entry%%|*}"
    step="${entry#*|}"; step="${step%%|*}"
    detail="${entry#*|*|}"
    case "$status" in
      ok)   color="$__C_GREEN";  label="OK"   ;;
      fail) color="$__C_RED";    label="FAIL" ;;
      skip) color="$__C_YELLOW"; label="SKIP" ;;
      *)    color="$__C_CYAN";   label="INFO" ;;
    esac
    # shellcheck disable=SC2059
    printf "  ${color}%-7s${__C_RESET}  %-40s  %s\n" "$label" "$step" "$detail"
  done

  echo
  if [[ $__SUMMARY_HAS_FAIL -eq 1 ]]; then
    printf '%s%sResult: FAILURE%s — one or more steps failed\n\n' "$__C_BOLD" "$__C_RED" "$__C_RESET"
    return 1
  fi
  printf '%s%sResult: SUCCESS%s%s\n\n' "$__C_BOLD" "$__C_GREEN" \
    "$([[ "$__SUMMARY_DRY_RUN" == "true" ]] && echo " (dry-run)")" "$__C_RESET"
  return 0
}
