#!/usr/bin/env bash
set -euo pipefail

# ========================================
# This script publishes duo-cli binaries to GitLab Package Registry.
# Each binary is uploaded separately so clients can download individual files.
# ========================================

# ========================================
# Configuration
# ========================================
BIN_DIR="./packages/cli/bin"
PACKAGE_NAME="duo-cli"
GENERIC_PACKAGE_BASE_URL="https://gitlab.com/api/v4/projects/46519181/packages/generic"

# ========================================
# Helper Functions
# ========================================
log_step() {
    echo "===> $1"
}

log_error() {
    echo "Error: $1" >&2
}

check_required_env() {
    local var_name="$1"
    if [[ -z "${!var_name:-}" ]]; then
        log_error "Required environment variable $var_name is not set"
        exit 1
    fi
}

upload_binary() {
    local binary_path="$1"
    local binary_name=$(basename "$binary_path")
    local url="${GENERIC_PACKAGE_BASE_URL}/${PACKAGE_NAME}/${PACKAGE_VERSION}/${binary_name}"

    log_step "Checking if $binary_name already exists..."

    # Check if binary already exists
    local is_already_present="false"
    if curl --fail --header "JOB-TOKEN: $CI_JOB_TOKEN" "$url" -o /dev/null --silent 2>/dev/null; then
        echo "  $binary_name already present at $url"
        is_already_present="true"
    fi

    # Upload if not present
    if [[ "$is_already_present" == "false" ]]; then
        log_step "Uploading $binary_name to Package Registry..."
        echo "  URL: $url"

        if ! curl --fail --header "JOB-TOKEN: $CI_JOB_TOKEN" --upload-file "$binary_path" "$url"; then
            log_error "Failed to upload $binary_name"
            return 1
        fi

        log_step "Successfully uploaded $binary_name"
    fi

    return 0
}

# ========================================
# Main Script
# ========================================
main() {
    log_step "Starting duo-cli binaries publication to GitLab Package Registry"

    # Validate required environment variables
    check_required_env "CI_JOB_TOKEN"
    check_required_env "PACKAGE_VERSION"

    log_step "Publishing version: $PACKAGE_VERSION"

    # Validate bin directory exists
    if [[ ! -d "$BIN_DIR" ]]; then
        log_error "Bin directory not found: $BIN_DIR"
        exit 1
    fi

    # Find all duo binaries
    local binaries=("${BIN_DIR}"/duo-*)
    if [[ ! -e "${binaries[0]}" ]]; then
        log_error "No duo binaries found in $BIN_DIR"
        exit 1
    fi

    log_step "Found ${#binaries[@]} binaries to upload"

    # Upload each binary
    local failed_uploads=()
    for binary in "${binaries[@]}"; do
        if [[ -f "$binary" ]]; then
            if ! upload_binary "$binary"; then
                failed_uploads+=("$(basename "$binary")")
            fi
        fi
    done

    # Report results
    echo ""
    if [[ ${#failed_uploads[@]} -eq 0 ]]; then
        log_step "All binaries published successfully!"
        echo ""
        echo "Download URLs:"
        for binary in "${binaries[@]}"; do
            if [[ -f "$binary" ]]; then
                local binary_name=$(basename "$binary")
                echo "  - ${GENERIC_PACKAGE_BASE_URL}/${PACKAGE_NAME}/${PACKAGE_VERSION}/${binary_name}"
            fi
        done
    else
        log_error "Failed to upload: ${failed_uploads[*]}"
        exit 1
    fi
}

main "$@"
