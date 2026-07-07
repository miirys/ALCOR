#!/usr/bin/env bash
set -euo pipefail

# ========================================
# Compiles single-file executables for the GitLab Language Server using
# Bun's `bun build --compile` instead of Node.js SEA.
#
# Usage:
#   ./scripts/compile_lsp_executables.sh
#
# Environment variables:
#   PACKAGE_VERSION       Override the version baked into the binary.
#                         Falls back to root package.json `version`.
#   SUPPORTED_TARGETS     Space-separated list of bun targets to build.
#   SKIP_RIPGREP_BUNDLE   Set to "1" to skip embedding ripgrep. The binary
#                         falls back to system rg via NullRgBinaryProvider.
# ========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy_log.sh
source "$SCRIPT_DIR/lib/deploy_log.sh"

# Run from the repo root regardless of where the script is invoked from.
cd "$SCRIPT_DIR/.."

# ========================================
# Configuration
# ========================================
BIN_DIR="./bin"
APP_NAME="gitlab-lsp"
MAIN_SOURCE_FILE="./src/node/main.ts"
# The sandbox worker is embedded into the main binary via the
# '@gitlab-org/sandbox/worker' side-effect import in src/node/main.ts.
# DefaultWorkerProcessManager re-execs `process.execPath` with GITLAB_SANDBOX_WORKER=true
# instead of spawning a separate executable. No second compile step is required.
ROOT_PACKAGE_JSON="./package.json"
RG_DIR="./rg-binaries"
RG_SHIM_FILE="./src/node/rg_binary_embed.ts"
SUPPORTED_TARGETS="${SUPPORTED_TARGETS:-bun-linux-x64 bun-linux-arm64 bun-windows-x64-baseline bun-windows-arm64 bun-darwin-arm64 bun-darwin-x64-baseline}"
SKIP_RIPGREP_BUNDLE="${SKIP_RIPGREP_BUNDLE:-}"
if [[ "${SKIP_RIPGREP_BUNDLE}" != "1" ]]; then
    RG_POSTINSTALL="./node_modules/@vscode/ripgrep/lib/postinstall.js"
    RG_VERSION="$(grep "^const VERSION" "$RG_POSTINSTALL" | sed "s/.*'\(.*\)'.*/\1/")"
fi

# ========================================
# Helper Functions
# ========================================
restore_stub_shim() {
    cat > "$RG_SHIM_FILE" << 'STUB'
// This file is overwritten by scripts/compile_lsp_executables.sh for each target.
// In dev/npm mode it returns an empty string - DefaultRgBinaryProvider is not
// registered and NullRgBinaryProvider falls back to system rg.
export default '';
STUB
}

# Ensure stub shim is restored on exit (success, failure, or interrupt).
trap 'restore_stub_shim' EXIT

get_version_from_package_json() {
    local package_json="$1"
    if command -v node &> /dev/null; then
        node -p "require('$package_json').version"
    fi
}

ensure_clean_directory() {
    local dir="$1"
    log::info "Creating empty directory: $dir"
    rm -rf "$dir"
    mkdir -p "$dir"
}

get_rg_triple_from_target() {
    local target="$1"
    case "$target" in
        bun-linux-x64)             echo "x86_64-unknown-linux-musl" ;;
        bun-linux-arm64)           echo "aarch64-unknown-linux-musl" ;;
        bun-windows-x64-modern)    echo "x86_64-pc-windows-msvc" ;;
        bun-windows-x64-baseline)  echo "x86_64-pc-windows-msvc" ;;
        bun-windows-arm64)         echo "aarch64-pc-windows-msvc" ;;
        bun-darwin-arm64)          echo "aarch64-apple-darwin" ;;
        bun-darwin-x64-baseline)   echo "x86_64-apple-darwin" ;;
        *) log::error "Unknown target: $target"; return 1 ;;
    esac
}

get_rg_binary_name() {
    local target="$1"
    if [[ "$target" == "bun-windows-"* ]]; then
        echo "rg.exe"
    else
        echo "rg"
    fi
}

# Convert bun target -> output platform suffix used in binary names.
# Keeps backwards compatibility with the previous SEA pipeline:
#   linux-*  : kept as-is
#   windows-*: renamed to win-* (matches old SEA naming)
#   darwin-* : renamed to macos-* (matches old SEA naming)
# Drops the bun-specific "-modern" / "-baseline" suffix; both windows-x64
# variants map to the same `win-x64` output name, so only one of them should
# be enabled at a time via SUPPORTED_TARGETS in CI (default: ship -baseline).
get_output_suffix_from_target() {
    local target="$1"
    case "$target" in
        bun-linux-x64)             echo "linux-x64" ;;
        bun-linux-arm64)           echo "linux-arm64" ;;
        bun-windows-x64-modern)    echo "win-x64" ;;
        bun-windows-x64-baseline)  echo "win-x64" ;;
        bun-windows-arm64)         echo "win-arm64" ;;
        bun-darwin-arm64)          echo "macos-arm64" ;;
        bun-darwin-x64-baseline)   echo "macos-x64" ;;
        *) log::error "Unknown target: $target"; return 1 ;;
    esac
}

get_executable_name() {
    local app_name="$1"
    local target="$2"
    local suffix
    suffix=$(get_output_suffix_from_target "$target")
    local exe_ext=""
    if [[ "$target" == "bun-windows-"* ]]; then
        exe_ext=".exe"
    fi
    echo "${app_name}-${suffix}${exe_ext}"
}

generate_rg_shim() {
    local target="$1"
    local triple
    triple=$(get_rg_triple_from_target "$target")
    local binary_name
    binary_name=$(get_rg_binary_name "$target")
    local rg_path="${RG_DIR}/${RG_VERSION}/${triple}/${binary_name}"

    # Path relative to the shim file location (./src/node/).
    local rel_rg_path="../../${rg_path}"

    log::info "Generating rg shim for ${target} (triple: ${triple}): ${RG_SHIM_FILE}"
    cat > "$RG_SHIM_FILE" << EOF
// AUTO-GENERATED by scripts/compile_lsp_executables.sh — do not edit.
// Embeds the rg binary for target: ${target} (triple: ${triple}).
import rgBinaryPath from '${rel_rg_path}' with { type: 'file' };
export default rgBinaryPath;
EOF
}

# Core bun build invocation shared between binary compilation and source map
# generation. The --define flags are defined once here; callers must not
# duplicate them.
#
# When target is a specific platform (e.g. bun-linux-x64) the output is a
# compiled binary (--compile, --sourcemap=inline, --outfile).
# When target is the generic "bun" the output is a plain JS bundle with
# external source maps (--sourcemap=external, --outdir), used for Sentry uploads.
#
# Args:
#   $1 source file
#   $2 output       --outfile path (platform target) or --outdir path (bun target)
#   $3 target       bun platform target, e.g. bun-linux-x64, or "bun" for bundles
#   $4 version
#   $5 environment  production | development
run_bun_build() {
    local source_file="$1"
    local output="$2"
    local target="$3"
    local version="$4"
    local environment="$5"

    local cmd=(
        bun build "$source_file"
        --minify
        --target="$target"
        --define "BUNDLER_INJECTED_GITLAB_LANGUAGE_SERVER_VERSION=\"${version}\""
        --define "BUNDLER_INJECTED_ENVIRONMENT=\"${environment}\""
        --define 'BUNDLER_INJECTED_DISTRIBUTION="binary"'
        --define 'process.env.BUNDLE_ENVIRONMENT="bun"'
        --define 'process.env.IS_BUNDLED="true"'
    )

    if [[ "$target" != "bun" ]]; then
        cmd+=(--compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig --compile-exec-argv="--use-system-ca" --sourcemap=inline --outfile "$output")
    else
        cmd+=(--sourcemap=external --outdir "$output")
    fi

    "${cmd[@]}"
}

build_for_target() {
    local target="$1"
    local version="$2"
    local environment="$3"
    local main_output="$4"

    if [[ "${SKIP_RIPGREP_BUNDLE}" != "1" ]]; then
        generate_rg_shim "$target"
    fi

    log::info "Building for target: ${target}"

    if log::run run_bun_build "$MAIN_SOURCE_FILE" "$main_output" "$target" "$version" "$environment"; then
        log::ok "Built: $main_output"
        return 0
    else
        log::error "Failed to build for target $target"
        return 1
    fi
}

# ========================================
# Build Modes
# ========================================

# Builds an intermediate non-compiled bundle with external source maps and
# uploads them to Sentry. Uses the same entrypoint and defines as the binary
# build so the maps match the compiled output.
upload_sourcemaps() {
    local version="$1"
    local sourcemaps_dir
    sourcemaps_dir="$(mktemp -d)"

    log::section "Sentry source map upload"
    log::info "Building intermediate bundle for source map extraction"

    if log::run run_bun_build "$MAIN_SOURCE_FILE" "$sourcemaps_dir" "bun" "$version" "production"; then
        log::ok "Intermediate bundle built"
    else
        log::error "Intermediate bundle build failed"
        rm -rf "$sourcemaps_dir"
        return 1
    fi

    ./scripts/upload_binary_sourcemaps.sh --sourcemaps-dir "$sourcemaps_dir"
    local rc=$?

    rm -rf "$sourcemaps_dir"
    return $rc
}

build_all() {
    local version="$1"
    log::section "LSP compilation (all targets)"

    summary::start "gitlab-lsp compile ${version}"

    if [[ "${SENTRY_TRACKING_ENABLED:-}" != "true" ]]; then
        summary::add "sourcemap upload" "skip" "SENTRY_TRACKING_ENABLED != true"
    elif upload_sourcemaps "$version"; then
        summary::add "sourcemap upload" "ok"
    else
        summary::add "sourcemap upload" "fail" "see output above"
    fi

    ensure_clean_directory "$BIN_DIR"

    for target in $SUPPORTED_TARGETS; do
        local main_name
        main_name=$(get_executable_name "$APP_NAME" "$target")
        local main_output="${BIN_DIR}/${main_name}"

        if build_for_target "$target" "$version" "production" "$main_output"; then
            summary::add "$target" "ok" "$main_output"
        else
            summary::add "$target" "fail" "build failed"
        fi
    done

    summary::print
}

# ========================================
# Main Script
# ========================================
main() {
    if [[ ! -f "$MAIN_SOURCE_FILE" ]]; then
        log::error "Source file not found: $MAIN_SOURCE_FILE"
        exit 1
    fi
    if [[ ! -f "$ROOT_PACKAGE_JSON" ]]; then
        log::error "Root package.json not found: $ROOT_PACKAGE_JSON"
        exit 1
    fi

    local version="${PACKAGE_VERSION:-}"
    if [[ -n "$version" ]]; then
        log::info "Using version from PACKAGE_VERSION environment variable: $version"
    else
        version=$(get_version_from_package_json "$ROOT_PACKAGE_JSON")
        if [[ -z "$version" ]]; then
            log::error "Failed to extract version from $ROOT_PACKAGE_JSON"
            exit 1
        fi
        log::info "Using version from package.json: $version"
    fi

    if ! command -v bun &> /dev/null; then
        log::error "'bun' command not found. Please install Bun to compile executables."
        exit 1
    fi

    if [[ "${SKIP_RIPGREP_BUNDLE}" != "1" ]]; then
        bash ./scripts/download_rg_binaries.sh
    else
        log::info "Skipping ripgrep download (SKIP_RIPGREP_BUNDLE is set)"
    fi

    build_all "$version"
}

main "$@"
