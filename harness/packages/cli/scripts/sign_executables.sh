#!/usr/bin/env bash
set -euo pipefail

# ========================================
# This script signs the duo-cli executables for distribution.
# It handles both Windows and macOS binaries with appropriate signing methods.
# ========================================

# ========================================
# Configuration
# ========================================
BIN_DIR="./bin"
ENTITLEMENTS_FILE="../../macos-entitlements.xml"
APP_NAME="duo"

# ========================================
# Helper Functions
# ========================================
log_step() {
    echo "===> $1"
}

log_error() {
    echo "Error: $1" >&2
}

check_binary_exists() {
    local binary="$1"
    if [[ ! -f "$binary" ]]; then
        log_error "Binary not found: $binary"
        return 1
    fi
    return 0
}

get_windows_binaries() {
    local binaries=()
    local windows_patterns=("${BIN_DIR}/${APP_NAME}-windows-x64-modern.exe" "${BIN_DIR}/${APP_NAME}-windows-x64-baseline.exe" "${BIN_DIR}/${APP_NAME}-windows-arm64.exe")

    for pattern in "${windows_patterns[@]}"; do
        if [[ -f "$pattern" ]]; then
            binaries+=("$pattern")
        fi
    done

    echo "${binaries[@]}"
}

get_macos_binaries() {
    local binaries=()
    local macos_patterns=("${BIN_DIR}/${APP_NAME}-darwin-arm64" "${BIN_DIR}/${APP_NAME}-darwin-x64-baseline")

    for pattern in "${macos_patterns[@]}"; do
        if [[ -f "$pattern" ]]; then
            binaries+=("$pattern")
        fi
    done

    echo "${binaries[@]}"
}

sign_with_cloud_hsm() {
    log_step "Running on protected branch with full signing capabilities"

    # Get binaries to sign
    local windows_binaries=($(get_windows_binaries))
    local macos_binaries=($(get_macos_binaries))

    # Sign Windows binaries if present
    if [[ ${#windows_binaries[@]} -gt 0 ]]; then
        log_step "Signing ${#windows_binaries[@]} Windows binaries..."
        if ! sign-windows-binaries --overwrite "${windows_binaries[@]}"; then
            log_error "Failed to sign Windows binaries"
            return 1
        fi
        log_step "Windows binaries signed successfully"
    else
        log_step "No Windows binaries found to sign"
    fi

    # Sign and notarize macOS binaries if present
    if [[ ${#macos_binaries[@]} -gt 0 ]]; then
        log_step "Signing and notarizing ${#macos_binaries[@]} macOS binaries..."
        if ! sign-macos-binaries --rcodesign-args "--entitlements-xml-file $ENTITLEMENTS_FILE" --overwrite "${macos_binaries[@]}"; then
            log_error "Failed to sign and notarize macOS binaries"
            return 1
        fi
        log_step "macOS binaries signed and notarized successfully"
    else
        log_step "No macOS binaries found to sign"
    fi
}

sign_local() {
    log_step "Running in local/fork environment - signing macOS binaries with entitlements only"

    # Get macOS binaries
    local macos_binaries=($(get_macos_binaries))

    if [[ ${#macos_binaries[@]} -eq 0 ]]; then
        log_step "No macOS binaries found to sign"
        return 0
    fi

    # Check if entitlements file exists
    if [[ ! -f "$ENTITLEMENTS_FILE" ]]; then
        log_error "Entitlements file not found: $ENTITLEMENTS_FILE"
        return 1
    fi

    # Sign each macOS binary with entitlements
    for binary in "${macos_binaries[@]}"; do
        log_step "Signing $(basename "$binary") with entitlements..."
        if ! rcodesign sign "$binary" --code-signature-flags runtime --entitlements-xml-file "$ENTITLEMENTS_FILE"; then
            log_error "Failed to sign $binary"
            return 1
        fi
    done

    log_step "macOS binaries signed with entitlements successfully"
}

# ========================================
# Main Script
# ========================================
main() {
    log_step "Starting duo-cli binary signing process"

    log_step "Changing working directory to ./packages/cli"
    cd ./packages/cli

    # Validate bin directory exists
    if [[ ! -d "$BIN_DIR" ]]; then
        log_error "Bin directory not found: $BIN_DIR"
        log_error "Please run compile_executables.ts first to generate binaries"
        exit 1
    fi

    # Check which signing mode to use
    if [[ "${CI_COMMIT_REF_PROTECTED:-}" == "true" ]] && \
       [[ "${CI_SERVER_HOST:-}" == "gitlab.com" ]] && \
       [[ "${CI_PROJECT_PATH:-}" == "gitlab-org/editor-extensions/gitlab-lsp" ]]; then
        sign_with_cloud_hsm
    else
        sign_local
    fi

    log_step "Signing process completed successfully!"
}

main "$@"
