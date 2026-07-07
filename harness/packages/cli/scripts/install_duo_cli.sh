#!/usr/bin/env bash
set -euo pipefail

# ========================================
# GitLab Duo CLI Installation Script
# ========================================
# This script installs the GitLab Duo CLI binary for macOS and Linux.
# It automatically detects your platform, downloads the latest version,
# and installs it to ~/.local/bin with PATH configuration.
# ========================================

# ========================================
# Configuration
# ========================================
GITLAB_PROJECT_ID="46519181"
PACKAGE_NAME="duo-cli"
INSTALL_DIR="$HOME/.local/bin"
BINARY_NAME="duo"
API_BASE_URL="https://gitlab.com/api/v4"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Debug mode
DEBUG=${DEBUG:-0}

# Non-interactive mode
NON_INTERACTIVE=false

# ========================================
# Helper Functions
# ========================================
log_info() {
    echo -e "${BLUE}==>${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1" >&2
}

log_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

log_debug() {
    if [[ "$DEBUG" == "1" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $1" >&2
    fi
}

command_exists() {
    command -v "$1" &> /dev/null
}

# Format bytes to human readable format (MB)
format_bytes() {
    local bytes="$1"
    if [[ $bytes -lt 1048576 ]]; then
        echo "$((bytes / 1024))KB"
    else
        echo "$((bytes / 1048576))MB"
    fi
}

# Extract a field value from a JSON string
# Usage: extract_json_field "$json_string" "field_name"
# Works for both string fields ("field":"value") and number fields ("field":123)
extract_json_field() {
    local json="$1"
    local field_name="$2"

    # Check if it's a string field (has quotes around value) or number field
    if echo "$json" | grep -q "\"${field_name}\":\""; then
        # String field: "field":"value"
        echo "$json" | grep -o "\"${field_name}\":\"[^\"]*\"" | head -1 | sed "s/\"${field_name}\":\"\([^\"]*\)\"/\1/"
    else
        # Number field: "field":123
        echo "$json" | grep -o "\"${field_name}\":[0-9]*" | head -1 | sed "s/\"${field_name}\":\([0-9]*\)/\1/"
    fi
}

# ========================================
# Platform Detection
# ========================================
# Auto-detect whether the current x86_64 Linux CPU supports Bun's "modern" x64
# build. Bun's modern target requires AVX2 (Haswell/Excavator and newer);
# without it the binary will SIGILL on hot paths. We err toward "baseline"
# whenever detection is ambiguous (no /proc/cpuinfo, no flags line, etc.) —
# false negatives cost a bit of perf, false positives crash the binary.
detect_linux_x64_variant() {
    if [[ ! -r /proc/cpuinfo ]]; then
        log_debug "/proc/cpuinfo not readable; selecting baseline"
        echo "baseline"
        return
    fi

    local flags_line=""
    flags_line=$(grep -m1 -E '^flags[[:space:]]*:' /proc/cpuinfo 2>/dev/null || true)
    # Drop the "flags : " prefix and pad with spaces so word-boundary matches work.
    local flags=" ${flags_line#*:} "

    log_debug "CPU flags (first 200 chars): ${flags:0:200}"

    if [[ "$flags" == *" avx2 "* ]]; then
        log_debug "AVX2 detected; selecting modern"
        echo "modern"
    else
        log_debug "AVX2 not detected; selecting baseline"
        echo "baseline"
    fi
}

detect_platform() {
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)

    log_debug "Raw OS: $os"
    log_debug "Raw architecture: $arch"

    # Normalize OS name
    case "$os" in
        darwin)
            os="darwin"
            ;;
        linux)
            os="linux"
            ;;
        *)
            log_error "Unsupported operating system: $os"
            log_error "This script supports macOS (Darwin) and Linux only."
            exit 1
            ;;
    esac

    # Normalize architecture
    case "$arch" in
        x86_64|amd64)
            if [[ "$os" == "darwin" ]]; then
                arch="x64-baseline"
            elif [[ "$os" == "linux" ]]; then
                # On Linux x86_64, pick modern (AVX2) or baseline based on CPU support.
                local linux_variant
                linux_variant=$(detect_linux_x64_variant)
                log_info "Auto-detected Linux x64 variant: $linux_variant"
                if [[ "$linux_variant" == "modern" ]]; then
                    arch="x64-modern"
                else
                    arch="x64"
                fi
            else
                arch="x64"
            fi
            ;;
        arm64|aarch64)
            arch="arm64"
            ;;
        *)
            log_error "Unsupported architecture: $arch"
            log_error "Supported architectures: x86_64, arm64"
            exit 1
            ;;
    esac

    local platform="${os}-${arch}"
    log_debug "Normalized platform: $platform"
    echo "$platform"
}

get_binary_name() {
    local platform="$1"
    echo "duo-${platform}"
}

# ========================================
# Version Discovery
# ========================================
get_latest_package_info() {
    local api_url="${API_BASE_URL}/projects/${GITLAB_PROJECT_ID}/packages"
    # it's important to order by created_at instead of version so "8.99.0" would not rank above "8.101.0". Latest-published is the source of truth.
    local params="package_name=${PACKAGE_NAME}&package_type=generic&order_by=created_at&sort=desc&per_page=1"
    local full_url="${api_url}?${params}"

    log_info "Fetching latest package information from GitLab..."
    log_debug "API URL: $full_url"

    local response
    local http_code

    # Capture both response and HTTP code
    if ! response=$(curl -sSf -w "\n%{http_code}" "${full_url}" 2>&1); then
        log_error "Failed to fetch package information from GitLab"
        log_debug "curl exit code: $?"
        log_debug "Response: $response"
        exit 1
    fi

    # Extract HTTP code from last line
    http_code=$(echo "$response" | tail -n1)
    response=$(echo "$response" | sed '$d')

    log_debug "HTTP response code: $http_code"
    log_debug "Response body (first 200 chars): ${response:0:200}"

    # Parse version and package ID from JSON response
    local version
    local package_id
    log_debug "Using grep/sed for JSON parsing"

    # Extract the first object from the array and get version and id
    # The response is an array, so we take everything between first [ and first }
    local first_object=$(echo "$response" | tr -d '\n' | sed 's/^\[//' | sed 's/\[{/{/' | sed 's/},{.*/}/')
    log_debug "First object (first 300 chars): ${first_object:0:300}"

    version=$(extract_json_field "$first_object" "version")
    package_id=$(extract_json_field "$first_object" "id")

    log_debug "Parsed version: '$version'"
    log_debug "Parsed package_id: '$package_id'"

    if [[ -z "$version" || "$version" == "null" ]]; then
        log_error "Failed to determine latest version"
        log_debug "Full response: $response"
        exit 1
    fi

    if [[ -z "$package_id" || "$package_id" == "null" ]]; then
        log_error "Failed to determine package ID"
        log_debug "Full response: $response"
        exit 1
    fi

    # Return both version and package_id separated by a pipe
    echo "${version}|${package_id}"
}

get_package_info_by_version() {
    local target_version="$1"
    local api_url="${API_BASE_URL}/projects/${GITLAB_PROJECT_ID}/packages"
    local params="package_name=${PACKAGE_NAME}&package_type=generic"
    local full_url="${api_url}?${params}"

    log_info "Fetching package information for version ${target_version}..."
    log_debug "API URL: $full_url"

    local response
    if ! response=$(curl -sSf "${full_url}" 2>&1); then
        log_error "Failed to fetch package information from GitLab"
        log_debug "Response: $response"
        exit 1
    fi

    log_debug "Response body (first 200 chars): ${response:0:200}"

    # Find the package with matching version
    local package_id
    log_debug "Using grep/sed for JSON parsing"

    # Split objects and find the one with matching version
    local matching_object=$(echo "$response" | tr -d '\n' | sed 's/},{/}\n{/g' | grep "\"version\":\"${target_version}\"")
    log_debug "Matching object (first 200 chars): ${matching_object:0:200}"

    package_id=$(extract_json_field "$matching_object" "id")

    log_debug "Parsed package_id: '$package_id'"

    if [[ -z "$package_id" || "$package_id" == "null" ]]; then
        log_error "Failed to find package with version ${target_version}"
        exit 1
    fi

    echo "${target_version}|${package_id}"
}

# ========================================
# Download Binary
# ========================================
get_download_url() {
    local package_id="$1"
    local binary_filename="$2"

    local api_url="${API_BASE_URL}/projects/${GITLAB_PROJECT_ID}/packages/${package_id}/package_files"
    log_debug "Fetching package files from: $api_url"

    local response
    if ! response=$(curl -sSf "${api_url}" 2>&1); then
        log_error "Failed to fetch package files from GitLab"
        log_debug "Response: $response"
        exit 1
    fi

    log_debug "Package files response (first 500 chars): ${response:0:500}"

    # Find the file that matches our binary_filename
    local file_id
    local file_sha256

    log_debug "Using grep/sed to find matching file"

    # Strategy: Extract the JSON object containing our filename
    # We look for the pattern: {..., "file_name":"our-file", ...}
    # Then extract the "id" and "file_sha256" fields from that same object

    # Extract just the object that contains our file_name by looking for the pattern:
    # {"id":NUMBER,...,"file_name":"our-filename",...,"file_sha256":"hash",...}
    local object_line=$(echo "$response" | tr -d '\n' | sed 's/},{/}\n{/g' | grep "\"file_name\":\"${binary_filename}\"")
    log_debug "Object line (first 200 chars): ${object_line:0:200}"

    # Now extract the id and file_sha256 fields from this object
    file_id=$(extract_json_field "$object_line" "id")
    file_sha256=$(extract_json_field "$object_line" "file_sha256")

    log_debug "Found file_id: '$file_id'"
    log_debug "Found file_sha256: '$file_sha256'"

    if [[ -z "$file_id" ]]; then
        log_error "Could not find file ${binary_filename} in package"
        log_debug "Available files in package:"
        echo "$response" | grep -o '"file_name":"[^"]*"' | sed 's/"file_name":"\([^"]*\)"/\1/' >&2
        exit 1
    fi

    if [[ -z "$file_sha256" ]]; then
        log_warning "Could not find SHA256 hash for file, skipping verification"
    fi

    # Construct the download URL using the package file ID
    # Format: https://gitlab.com/{namespace}/{project}/-/package_files/{file_id}/download
    local download_url="https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/package_files/${file_id}/download"
    log_debug "Constructed download URL: $download_url"

    # Return both URL and SHA256 separated by pipe
    echo "${download_url}|${file_sha256}"
}

download_binary() {
    local package_id="$1"
    local version="$2"
    local binary_filename="$3"
    local temp_file="$4"

    log_info "Finding download URL for ${binary_filename}..."
    local download_info=$(get_download_url "$package_id" "$binary_filename")

    # Split the response into URL and SHA256
    local download_url=$(echo "$download_info" | cut -d'|' -f1)
    local expected_sha256=$(echo "$download_info" | cut -d'|' -f2)

    log_info "Downloading ${binary_filename} version ${version}..."
    log_debug "Download URL: $download_url"
    log_debug "Expected SHA256: $expected_sha256"
    log_debug "Temp file: $temp_file"

    # Get the total file size to display stats
    local total_size
    total_size=$(curl -sI --http2 --compressed "$download_url" | grep -i content-length | tail -1 | awk '{print $2}' | tr -d '\r\n ')
    log_debug "Total file size: $total_size bytes"

    # Start download in background with optimizations:
    # --http2: Use HTTP/2 if available (faster)
    # --compressed: Request and decompress compressed content
    curl -sfL --http2 --compressed -o "$temp_file" "$download_url" &
    local curl_pid=$!

    # Show spinner with progress
    local spinner=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local spin_idx=0

    # Display progress while downloading
    while kill -0 $curl_pid 2>/dev/null; do
        if [[ -f "$temp_file" ]]; then
            local downloaded=$(stat -f%z "$temp_file" 2>/dev/null || stat -c%s "$temp_file" 2>/dev/null || echo "0")
            local percent=0

            if [[ -n "$total_size" && "$total_size" -gt 0 ]]; then
                percent=$((downloaded * 100 / total_size))
                local downloaded_fmt=$(format_bytes $downloaded)
                local total_fmt=$(format_bytes $total_size)
                printf "\r\033[K${spinner[$spin_idx]} Downloading: %s / %s (%d%%)" "$downloaded_fmt" "$total_fmt" "$percent" >&2
            else
                local downloaded_fmt=$(format_bytes $downloaded)
                printf "\r\033[K${spinner[$spin_idx]} Downloading: %s" "$downloaded_fmt" >&2
            fi
        else
            printf "\r\033[K${spinner[$spin_idx]} Downloading..." >&2
        fi

        spin_idx=$(( (spin_idx + 1) % ${#spinner[@]} ))
        sleep 0.1
    done

    # Wait for curl to finish and get exit code
    wait $curl_pid
    local curl_exit=$?

    # Clear the progress line
    printf "\r\033[K" >&2

    log_debug "curl exit code: $curl_exit"

    if [[ $curl_exit -ne 0 ]]; then
        log_error "Failed to download binary from: $download_url"
        log_debug "curl error code: $curl_exit"
        if [[ -f "$temp_file" ]]; then
            log_debug "Partial file contents (first 100 bytes): $(head -c 100 "$temp_file" 2>/dev/null)"
            rm -f "$temp_file"
        fi
        exit 1
    fi

    # Verify download
    if [[ ! -f "$temp_file" ]]; then
        log_error "Downloaded file not found: $temp_file"
        exit 1
    fi

    local file_size=$(stat -f%z "$temp_file" 2>/dev/null || stat -c%s "$temp_file" 2>/dev/null)
    log_debug "Downloaded file size: $file_size bytes"

    if [[ "$file_size" -eq 0 ]]; then
        log_error "Downloaded file is empty"
        rm -f "$temp_file"
        exit 1
    fi

    # Verify SHA256 hash
    if [[ -n "$expected_sha256" ]]; then
        log_info "Verifying file integrity..."
        local actual_sha256

        # Try different SHA256 commands (shasum on macOS/Linux, sha256sum on Linux)
        if command_exists shasum; then
            actual_sha256=$(shasum -a 256 "$temp_file" | awk '{print $1}')
        elif command_exists sha256sum; then
            actual_sha256=$(sha256sum "$temp_file" | awk '{print $1}')
        else
            log_warning "No SHA256 command found (shasum or sha256sum), skipping verification"
            actual_sha256=""
        fi

        if [[ -n "$actual_sha256" ]]; then
            log_debug "Actual SHA256: $actual_sha256"

            if [[ "$actual_sha256" == "$expected_sha256" ]]; then
                log_success "File integrity verified (SHA256 match)"
            else
                log_error "File integrity check failed!"
                log_error "Expected SHA256: $expected_sha256"
                log_error "Actual SHA256:   $actual_sha256"
                rm -f "$temp_file"
                exit 1
            fi
        fi
    else
        log_debug "No SHA256 hash available, skipping verification"
    fi

    log_success "Downloaded successfully ($(numfmt --to=iec-i --suffix=B "$file_size" 2>/dev/null || echo "${file_size} bytes"))"
}

# ========================================
# Installation
# ========================================
install_binary() {
    local temp_file="$1"
    local install_path="${INSTALL_DIR}/${BINARY_NAME}"

    log_debug "Install path: $install_path"
    log_debug "Install directory exists: $([ -d "$INSTALL_DIR" ] && echo "yes" || echo "no")"

    # Check if already installed
    if [[ -f "$install_path" ]]; then
        log_warning "GitLab Duo CLI is already installed at: $install_path"
        local existing_version
        if existing_version=$("$install_path" version 2>&1 || "$install_path" --version 2>&1 ); then
            log_info "Existing version: $existing_version"
        fi

        if [[ "$NON_INTERACTIVE" == "true" ]]; then
            log_info "Non-interactive mode: Overwriting existing installation"
        else
            read -p "Do you want to overwrite it? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Installation cancelled"
                rm -f "$temp_file"
                exit 0
            fi
        fi
    fi

    # Create installation directory if it doesn't exist
    if [[ ! -d "$INSTALL_DIR" ]]; then
        log_info "Creating installation directory: $INSTALL_DIR"
        log_debug "Running: mkdir -p $INSTALL_DIR"
        if ! mkdir -p "$INSTALL_DIR"; then
            log_error "Failed to create directory: $INSTALL_DIR"
            exit 1
        fi
    fi

    # Move binary to installation directory
    log_info "Installing to $install_path..."
    log_debug "Running: mv $temp_file $install_path"
    if ! mv "$temp_file" "$install_path"; then
        log_error "Failed to move binary to installation directory"
        exit 1
    fi

    log_debug "Running: chmod +x $install_path"
    if ! chmod +x "$install_path"; then
        log_error "Failed to make binary executable"
        exit 1
    fi

    log_success "Installed to: $install_path"
}

# ========================================
# PATH Configuration
# ========================================
is_in_path() {
    local dir="$1"
    case ":$PATH:" in
        *":$dir:"*) return 0 ;;
        *) return 1 ;;
    esac
}

detect_shell() {
    # Try to detect the current shell
    local current_shell=$(basename "$SHELL")
    echo "$current_shell"
}

get_shell_config_file() {
    local shell_name="$1"
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')

    case "$shell_name" in
        bash)
            if [[ "$os" == "darwin" ]]; then
                # macOS prefers .bash_profile for login shells
                if [[ -f "$HOME/.bash_profile" ]]; then
                    echo "$HOME/.bash_profile"
                else
                    echo "$HOME/.bashrc"
                fi
            else
                echo "$HOME/.bashrc"
            fi
            ;;
        zsh)
            echo "$HOME/.zshrc"
            ;;
        fish)
            echo "$HOME/.config/fish/config.fish"
            ;;
        *)
            # Default to .profile as a fallback
            echo "$HOME/.profile"
            ;;
    esac
}

update_path() {
    log_debug "Current PATH: $PATH"
    log_debug "Checking if $INSTALL_DIR is in PATH"

    if is_in_path "$INSTALL_DIR"; then
        log_success "$INSTALL_DIR is already in your PATH"
        return 0
    fi

    log_warning "$INSTALL_DIR is not in your PATH"

    local shell_name=$(detect_shell)
    local config_file=$(get_shell_config_file "$shell_name")

    log_info "Detected shell: $shell_name"
    log_info "Config file: $config_file"
    log_debug "Config file exists: $([ -f "$config_file" ] && echo "yes" || echo "no")"

    if [[ "$NON_INTERACTIVE" == "true" ]]; then
        log_info "Non-interactive mode: Adding to PATH automatically"
    else
        read -p "Do you want to add it to your PATH automatically? (Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            log_info "Skipping PATH update"
            echo
            log_info "To use the GitLab Duo CLI, add this to your shell configuration:"
            echo -e "${YELLOW}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}" >&2
            return 0
        fi
    fi

    # Create config file if it doesn't exist
    if [[ ! -f "$config_file" ]]; then
        log_debug "Creating config file: $config_file"
        local config_dir=$(dirname "$config_file")
        if [[ ! -d "$config_dir" ]]; then
            log_debug "Creating config directory: $config_dir"
            mkdir -p "$config_dir"
        fi
        touch "$config_file"
    fi

    # Check if already added (avoid duplicates)
    log_debug "Checking for existing PATH configuration in $config_file"
    if grep -q "export PATH=\"\$HOME/.local/bin:\$PATH\"" "$config_file" 2>/dev/null || \
       grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$config_file" 2>/dev/null; then
        log_info "PATH already configured in $config_file"
    else
        # Add PATH export to config file
        log_debug "Adding PATH export to $config_file"
        echo "" >> "$config_file"
        echo "# Added by GitLab Duo CLI installer" >> "$config_file"
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$config_file"
        log_success "Added $INSTALL_DIR to PATH in $config_file"
    fi

    echo >&2
    log_info "To apply changes immediately, run:"
    echo -e "${YELLOW}source $config_file${NC}" >&2
    log_info "Or restart your terminal"
}

# ========================================
# Verification
# ========================================
verify_installation() {
    local install_path="${INSTALL_DIR}/${BINARY_NAME}"

    log_info "Verifying installation..."
    log_debug "Binary path: $install_path"
    log_debug "Binary exists: $([ -f "$install_path" ] && echo "yes" || echo "no")"
    log_debug "Binary is executable: $([ -x "$install_path" ] && echo "yes" || echo "no")"

    if [[ ! -x "$install_path" ]]; then
        log_error "Binary is not executable: $install_path"
        local perms=$(ls -l "$install_path" 2>/dev/null)
        log_debug "Permissions: $perms"
        exit 1
    fi

    # Try to run the binary
    log_debug "Attempting to run: $install_path version"
    local version_output
    local exit_code=0

    if version_output=$("$install_path" version 2>&1); then
        exit_code=$?
        log_debug "Command exit code: $exit_code"
        log_debug "Version output: $version_output"
        log_success "Installation verified successfully"
        echo -e "  Version: ${GREEN}${version_output}${NC}" >&2
    elif version_output=$("$install_path" --version 2>&1); then
        exit_code=$?
        log_debug "Command exit code: $exit_code"
        log_debug "Version output: $version_output"
        log_success "Installation verified successfully"
        echo -e "  Version: ${GREEN}${version_output}${NC}" >&2
    elif "$install_path" -v &> /dev/null; then
        log_success "Installation verified successfully"
    else
        log_warning "Could not verify binary version (this may be normal)"
        log_debug "All version commands failed"
    fi
}

# ========================================
# Usage Information
# ========================================
show_usage() {
    cat << EOF
GitLab Duo CLI Installation Script

Usage: $0 [OPTIONS]

Options:
    --version VERSION    Install a specific version instead of the latest
    -y, --yes           Non-interactive mode (assume yes to all prompts)
    --help              Show this help message

Environment Variables:
    DEBUG=1             Enable debug logging for troubleshooting

Examples:
    $0                          # Install latest version
    $0 --version 1.2.3         # Install version 1.2.3
    $0 -y                       # Install in non-interactive mode
    DEBUG=1 $0                  # Install with debug logging

Notes:
    On Linux x86_64, the installer auto-detects whether the host CPU supports
    AVX2 and picks either the modern (faster) or baseline (broad compat) build.

This script will:
  1. Detect your platform (OS and architecture)
  2. Download the appropriate GitLab Duo CLI binary
  3. Install it to ~/.local/bin/duo
  4. Update your PATH if needed

EOF
}

# ========================================
# Main Script
# ========================================
main() {
    local version=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --version)
                version="$2"
                shift 2
                ;;
            -y|--yes)
                NON_INTERACTIVE=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}" >&2
    echo -e "${BLUE}║       GitLab Duo CLI Installation      ║${NC}" >&2
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}" >&2
    echo >&2

    if [[ "$DEBUG" == "1" ]]; then
        log_debug "Debug mode enabled"
        log_debug "Script version: 1.0"
        log_debug "Working directory: $(pwd)"
        log_debug "User: $(whoami)"
        log_debug "Home: $HOME"
    fi

    if [[ "$NON_INTERACTIVE" == "true" ]]; then
        log_info "Running in non-interactive mode"
        log_debug "Non-interactive mode: -y flag was provided"
    fi

    # Check for required commands
    log_debug "Checking for required commands..."
    if ! command_exists curl; then
        log_error "curl is required but not installed"
        log_error "Please install curl and try again"
        exit 1
    fi
    log_debug "curl version: $(curl --version | head -n1)"

    # Detect platform
    log_info "Detecting platform..."
    local platform=$(detect_platform)
    local binary_filename=$(get_binary_name "$platform")
    log_success "Platform: $platform"
    log_success "Binary: $binary_filename"
    echo >&2

    # Get version and package ID
    local package_id
    if [[ -z "$version" ]]; then
        local package_info=$(get_latest_package_info)
        version=$(echo "$package_info" | cut -d'|' -f1)
        package_id=$(echo "$package_info" | cut -d'|' -f2)
        log_success "Latest version: $version"
        log_debug "Package ID: $package_id"
    else
        log_info "Using specified version: $version"
        log_debug "Version specified via --version flag"
        local package_info=$(get_package_info_by_version "$version")
        package_id=$(echo "$package_info" | cut -d'|' -f2)
        log_debug "Package ID: $package_id"
    fi
    echo >&2

    # Download binary
    local temp_file=$(mktemp)
    log_debug "Created temporary file: $temp_file"
    trap "log_debug 'Cleaning up temporary file: $temp_file'; rm -f $temp_file" EXIT

    download_binary "$package_id" "$version" "$binary_filename" "$temp_file"
    echo >&2

    # Install binary
    install_binary "$temp_file"
    echo >&2

    # Update PATH
    update_path
    echo >&2

    # Verify installation
    verify_installation
    echo >&2

    # Success message
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}" >&2
    echo -e "${GREEN}║  Installation completed successfully!  ║${NC}" >&2
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}" >&2
    echo >&2

    if is_in_path "$INSTALL_DIR"; then
        log_info "You can now run: ${GREEN}duo${NC}"
    else
        log_info "After restarting your terminal, you can run: ${GREEN}duo${NC}"
    fi
}

main "$@"
