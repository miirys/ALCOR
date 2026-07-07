#!/usr/bin/env bash
set -euo pipefail

# ========================================
# Produces single-file executables for the GitLab Language Server using
# Bun's `bun build --compile` (replaces the previous Node.js SEA pipeline).
#
# This script:
#   1. Compiles per-target binaries via scripts/compile_lsp_executables.sh
#      (main `gitlab-lsp-<platform>` + sibling `sandbox_worker-<platform>`).
#   2. Copies shared assets (tree-sitter WASM, grammars, webviews) into ./bin/
#      so they sit next to the compiled binary, matching the layout that
#      getAssetsRootPath() expects at runtime.
# ========================================

# ========================================
# Configuration
# ========================================
BIN_DIR="./bin"
OUT_DIR="./out"

# ========================================
# Helper Functions
# ========================================
log_step() {
    echo "===> $1"
}

ensure_directory() {
    if [[ ! -d "$1" ]]; then
        log_step "Creating directory: $1"
        mkdir -p "$1"
    fi
}

copy_assets() {
    log_step "Copying shared assets"

    # Copy tree-sitter.wasm
    log_step "Copying tree-sitter WASM file"
    cp "${OUT_DIR}/tree-sitter.wasm" "${BIN_DIR}/"

    # Copy tree-sitter WASM grammar files
    log_step "Copying tree-sitter grammar WASM files"
    ensure_directory "${BIN_DIR}/vendor/grammars"
    cp ${OUT_DIR}/vendor/grammars/*.wasm "${BIN_DIR}/vendor/grammars/"

    # Copy webview assets
    log_step "Copying webviews assets"
    ensure_directory "${BIN_DIR}/webviews"
    cp -r ${OUT_DIR}/webviews/* "${BIN_DIR}/webviews/"

    log_step "Assets copied successfully"
}

# ========================================
# Main
# ========================================
main() {
    # Compile binaries via the shared compile script. It clears ./bin/ on its own.
    bash ./scripts/compile_lsp_executables.sh all

    # Copy WASM/webview assets next to the compiled binaries.
    copy_assets

    log_step "All builds completed successfully!"
}

main
