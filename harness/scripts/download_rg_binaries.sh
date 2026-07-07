#!/usr/bin/env bash
set -euo pipefail

# ========================================
# Download ripgrep binaries for all supported targets
# This script is called by both CLI and language server builds
# ========================================

# ========================================
# Configuration
# ========================================
# Find the root directory (where node_modules is)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RG_POSTINSTALL="${ROOT_DIR}/node_modules/@vscode/ripgrep/lib/postinstall.js"

# Check if @vscode/ripgrep is installed
if [[ ! -f "$RG_POSTINSTALL" ]]; then
    echo "Error: @vscode/ripgrep not found at $RG_POSTINSTALL" >&2
    echo "Run 'bun install' first to install dependencies." >&2
    exit 1
fi

RG_VERSION="$(grep "^const VERSION" "$RG_POSTINSTALL" | sed "s/.*'\(.*\)'.*/\1/")"
RG_DIR="${ROOT_DIR}/rg-binaries"
SUPPORTED_TARGETS="${SUPPORTED_TARGETS:-bun-linux-x64 bun-linux-arm64 bun-windows-x64-modern bun-windows-x64-baseline bun-windows-arm64 bun-darwin-arm64 bun-darwin-x64-baseline}"

# ========================================
# Helper Functions
# ========================================
log_step() {
    echo "===> $1"
}

get_rg_triple_from_target() {
    local target="$1"
    case "$target" in
        # Bun targets (CLI)
        bun-linux-x64)             echo "x86_64-unknown-linux-musl" ;;
        bun-linux-arm64)           echo "aarch64-unknown-linux-musl" ;;
        bun-windows-x64-modern)    echo "x86_64-pc-windows-msvc" ;;
        bun-windows-x64-baseline)  echo "x86_64-pc-windows-msvc" ;;
        bun-windows-arm64)         echo "aarch64-pc-windows-msvc" ;;
        bun-darwin-arm64)          echo "aarch64-apple-darwin" ;;
        bun-darwin-x64-baseline)   echo "x86_64-apple-darwin" ;;
        # SEA targets (Language Server)
        linux-x64)                 echo "x86_64-unknown-linux-musl" ;;
        linux-arm64)               echo "aarch64-unknown-linux-musl" ;;
        win-x64)                   echo "x86_64-pc-windows-msvc" ;;
        win-arm64)                 echo "aarch64-pc-windows-msvc" ;;
        darwin-x64)                echo "x86_64-apple-darwin" ;;
        darwin-arm64)              echo "aarch64-apple-darwin" ;;
        *) echo "Error: Unknown target: $target" >&2; return 1 ;;
    esac
}

get_rg_binary_name() {
    local target="$1"
    if [[ "$target" == "bun-windows-"* ]] || [[ "$target" == "win-"* ]]; then
        echo "rg.exe"
    else
        echo "rg"
    fi
}

# Download rg binary for a triple (shared across targets with same triple)
download_rg_for_triple() {
    local triple="$1"
    local binary_name="rg"
    local archive_ext="tar.gz"

    if [[ "$triple" == *"-windows-"* ]]; then
        binary_name="rg.exe"
        archive_ext="zip"
    fi

    local triple_dir="${RG_DIR}/${RG_VERSION}/${triple}"
    local dest="${triple_dir}/${binary_name}"

    # Skip if already downloaded
    if [[ -f "$dest" ]]; then
        log_step "rg ${RG_VERSION} already downloaded for ${triple}, skipping"
        return 0
    fi

    mkdir -p "$triple_dir"

    local archive_name="ripgrep-${RG_VERSION}-${triple}.${archive_ext}"
    local url="https://github.com/microsoft/ripgrep-prebuilt/releases/download/${RG_VERSION}/${archive_name}"
    local tmp_archive="${triple_dir}/${archive_name}"

    log_step "Downloading rg for ${triple} from ${url}"

    local start_time=$SECONDS
    if ! curl -fsSL "$url" -o "$tmp_archive"; then
        echo "Error: Failed to download rg for triple $triple" >&2
        return 1
    fi

    if [[ "$archive_ext" == "zip" ]]; then
        unzip -q -o "$tmp_archive" "$binary_name" -d "$triple_dir"
    else
        tar -xzf "$tmp_archive" -C "$triple_dir" "$binary_name"
    fi

    rm -f "$tmp_archive"

    local elapsed=$(( SECONDS - start_time ))
    log_step "rg downloaded to ${dest} (${elapsed}s)"
}

download_all_rg_binaries() {
    log_step "Downloading rg binaries for all targets (rg ${RG_VERSION})"
    mkdir -p "$RG_DIR"

    local failed=""
    for target in $SUPPORTED_TARGETS; do
        local triple
        triple=$(get_rg_triple_from_target "$target")
        if ! download_rg_for_triple "$triple"; then
            failed="$failed $triple"
        fi
    done

    if [[ -n "$failed" ]]; then
        echo "Error: Failed to download rg for triples:$failed" >&2
        return 1
    fi

    log_step "All rg binaries downloaded successfully"
}

# ========================================
# Main
# ========================================
main() {
    log_step "Starting rg binary download process"

    # Validate rg version was resolved
    if [[ -z "$RG_VERSION" ]]; then
        echo "Error: Failed to resolve rg version from $RG_POSTINSTALL" >&2
        exit 1
    fi
    log_step "Using rg version: $RG_VERSION"

    download_all_rg_binaries
}

main "$@"
