# ========================================
# GitLab Duo CLI Installation Script (PowerShell)
# ========================================
# This script installs the GitLab Duo CLI binary for Windows.
# It automatically detects your architecture, downloads the latest version,
# and installs it to a local directory with PATH configuration.
# ========================================
#
# IMPORTANT: PowerShell Execution Policy
# ----------------------------------------
# If you get an error about "running scripts is disabled", run the script using:
#
#   PowerShell -ExecutionPolicy Bypass -File .\install_duo_cli.ps1
#
# Or unblock the file first:
#
#   Unblock-File -Path .\install_duo_cli.ps1
#   .\install_duo_cli.ps1
#
# ========================================

#Requires -Version 5.1

param(
    [string]$Version = "",
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$GITLAB_PROJECT_ID = "46519181"
$PACKAGE_NAME = "duo-cli"
$BINARY_NAME = "duo.exe"
$API_BASE_URL = "https://gitlab.com/api/v4"
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "Programs\Duo"
$DebugEnabled = $env:DEBUG -eq "1"

function Write-ColorOutput {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message,
        [Parameter(Mandatory=$false)]
        [string]$Type = "Info"
    )

    switch ($Type) {
        "Info" {
            Write-Host "==> " -ForegroundColor Blue -NoNewline
            Write-Host $Message
        }
        "Success" {
            Write-Host "checkmark " -ForegroundColor Green -NoNewline
            Write-Host $Message
        }
        "Warning" {
            Write-Host "warning " -ForegroundColor Yellow -NoNewline
            Write-Host $Message
        }
        "Error" {
            Write-Host "error " -ForegroundColor Red -NoNewline
            Write-Host $Message
        }
        "Debug" {
            if ($DebugEnabled) {
                Write-Host "[DEBUG] " -ForegroundColor Cyan -NoNewline
                Write-Host $Message
            }
        }
    }
}

function Write-Debug-Log {
    param([string]$Message)
    Write-ColorOutput -Message $Message -Type "Debug"
}

function command_exists {
    param([string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Get-PlatformInfo {
    Write-Debug-Log "Detecting platform..."
    $arch = $env:PROCESSOR_ARCHITECTURE
    Write-Debug-Log "Processor architecture: $arch"

    # Use windows-arm64 for ARM64, otherwise windows-x64-baseline
    if ($arch -eq "ARM64") {
        $binaryVariant = "windows-arm64"
        $architecture = "arm64"
    } else {
        $binaryVariant = "windows-x64-baseline"
        $architecture = "x64"
    }

    Write-Debug-Log "Binary variant: $binaryVariant"

    return @{
        Architecture = $architecture
        BinaryVariant = $binaryVariant
        FallbackVariant = $null
    }
}

function Get-BinaryName {
    param([string]$Platform)
    return "duo-$Platform.exe"
}

function Get-LatestPackageInfo {
    Write-ColorOutput -Message "Fetching latest package information from GitLab..." -Type "Info"

    # it's important to order by created_at instead of version so "8.99.0" would not rank above "8.101.0". Latest-published is the source of truth.
    $params = "package_name=$PACKAGE_NAME" + '&' + "package_type=generic" + '&' + "order_by=created_at" + '&' + "sort=desc" + '&' + "per_page=1"
    $url = "$API_BASE_URL/projects/$GITLAB_PROJECT_ID/packages?" + $params
    Write-Debug-Log "API URL: $url"

    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -UseBasicParsing
        Write-Debug-Log "Response received, parsing..."

        if ($response.Count -eq 0) {
            throw "No packages found"
        }

        $package = $response[0]
        $version = $package.version
        $packageId = $package.id

        Write-Debug-Log "Parsed version: $version"
        Write-Debug-Log "Parsed package ID: $packageId"

        if (-not $version -or -not $packageId) {
            throw "Failed to parse package information"
        }

        return @{
            Version = $version
            PackageId = $packageId
        }
    }
    catch {
        Write-ColorOutput -Message "Failed to fetch package information from GitLab" -Type "Error"
        Write-Debug-Log "Error: $_"
        throw
    }
}

function Get-PackageInfoByVersion {
    param([string]$TargetVersion)

    Write-ColorOutput -Message "Fetching package information for version $TargetVersion..." -Type "Info"

    $params = "package_name=$PACKAGE_NAME" + '&' + "package_type=generic"
    $url = "$API_BASE_URL/projects/$GITLAB_PROJECT_ID/packages?" + $params
    Write-Debug-Log "API URL: $url"

    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -UseBasicParsing

        $package = $response | Where-Object { $_.version -eq $TargetVersion } | Select-Object -First 1

        if (-not $package) {
            throw "Package with version $TargetVersion not found"
        }

        $packageId = $package.id
        Write-Debug-Log "Parsed package ID: $packageId"

        return @{
            Version = $TargetVersion
            PackageId = $packageId
        }
    }
    catch {
        Write-ColorOutput -Message "Failed to fetch package information from GitLab" -Type "Error"
        Write-Debug-Log "Error: $_"
        throw
    }
}

function Get-DownloadUrl {
    param(
        [string]$PackageId,
        [string]$BinaryFilename
    )

    $url = "$API_BASE_URL/projects/$GITLAB_PROJECT_ID/packages/$PackageId/package_files"
    Write-Debug-Log "Fetching package files from: $url"

    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -UseBasicParsing
        Write-Debug-Log "Package files response received"

        $file = $response | Where-Object { $_.file_name -eq $BinaryFilename } | Select-Object -First 1

        if (-not $file) {
            Write-ColorOutput -Message "Could not find file $BinaryFilename in package" -Type "Error"
            Write-Debug-Log "Available files:"
            $response | ForEach-Object { Write-Debug-Log "  - $($_.file_name)" }
            return $null
        }

        $fileId = $file.id
        Write-Debug-Log "Found file_id: $fileId"

        $downloadUrl = "https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/package_files/$fileId/download"
        Write-Debug-Log "Constructed download URL: $downloadUrl"

        return $downloadUrl
    }
    catch {
        Write-ColorOutput -Message "Failed to fetch package files from GitLab" -Type "Error"
        Write-Debug-Log "Error: $_"
        throw
    }
}

function Download-Binary {
    param(
        [string]$PackageId,
        [string]$Version,
        [string]$BinaryFilename,
        [string]$OutputPath
    )

    Write-ColorOutput -Message "Finding download URL for $BinaryFilename..." -Type "Info"
    $downloadUrl = Get-DownloadUrl -PackageId $PackageId -BinaryFilename $BinaryFilename

    if (-not $downloadUrl) {
        return $false
    }

    Write-ColorOutput -Message "Downloading $BinaryFilename version $Version..." -Type "Info"
    Write-Debug-Log "Download URL: $downloadUrl"
    Write-Debug-Log "Output path: $OutputPath"

    try {
        $webClient = New-Object System.Net.WebClient
        Register-ObjectEvent -InputObject $webClient -EventName DownloadProgressChanged -Action {
            $percent = $EventArgs.ProgressPercentage
            Write-Progress -Activity "Downloading binary" -Status "$percent% Complete" -PercentComplete $percent
        } | Out-Null

        $webClient.DownloadFile($downloadUrl, $OutputPath)
        $webClient.Dispose()
        Write-Progress -Activity "Downloading binary" -Completed

        if (-not (Test-Path $OutputPath)) {
            throw "Downloaded file not found: $OutputPath"
        }

        $fileSize = (Get-Item $OutputPath).Length
        Write-Debug-Log "Downloaded file size: $fileSize bytes"

        if ($fileSize -eq 0) {
            throw "Downloaded file is empty"
        }

        $fileHeader = Get-Content $OutputPath -Encoding Byte -TotalCount 2
        if ($fileHeader[0] -eq 0x4D -and $fileHeader[1] -eq 0x5A) {
            Write-Debug-Log "File is a valid PE executable (MZ header detected)"
        } else {
            Write-Debug-Log "Warning: File may not be a valid executable"
        }

        $fileSizeFormatted = "{0:N2} MB" -f ($fileSize / 1MB)
        Write-ColorOutput -Message "Downloaded successfully ($fileSizeFormatted)" -Type "Success"

        return $true
    }
    catch {
        Write-ColorOutput -Message "Failed to download binary" -Type "Error"
        Write-Debug-Log "Error: $_"

        if (Test-Path $OutputPath) {
            Remove-Item $OutputPath -Force
        }

        return $false
    }
}

function Install-Binary {
    param(
        [string]$SourcePath,
        [string]$TargetDir
    )

    $installPath = Join-Path $TargetDir $BINARY_NAME

    Write-Debug-Log "Install path: $installPath"
    Write-Debug-Log "Install directory exists: $(Test-Path $TargetDir)"

    if (Test-Path $installPath) {
        Write-ColorOutput -Message "GitLab Duo CLI is already installed at: $installPath" -Type "Warning"

        try {
            $existingVersion = & $installPath version 2>&1
            Write-ColorOutput -Message "Existing version: $existingVersion" -Type "Info"
        } catch {
            try {
                $existingVersion = & $installPath --version 2>&1
                Write-ColorOutput -Message "Existing version: $existingVersion" -Type "Info"
            } catch {
            }
        }

        $response = Read-Host "Do you want to overwrite it? (y/N)"
        if ($response -notmatch '^[Yy]$') {
            Write-ColorOutput -Message "Installation cancelled" -Type "Info"
            exit 0
        }
    }

    if (-not (Test-Path $TargetDir)) {
        Write-ColorOutput -Message "Creating installation directory: $TargetDir" -Type "Info"
        Write-Debug-Log "Running: New-Item -ItemType Directory -Path $TargetDir"
        New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    }

    Write-ColorOutput -Message "Installing to $installPath..." -Type "Info"
    Write-Debug-Log "Running: Copy-Item $SourcePath $installPath"

    try {
        Copy-Item $SourcePath $installPath -Force
        Write-ColorOutput -Message "Installed to: $installPath" -Type "Success"
    }
    catch {
        Write-ColorOutput -Message "Failed to copy binary to installation directory" -Type "Error"
        Write-Debug-Log "Error: $_"
        throw
    }
}

function Test-InPath {
    param([string]$Directory)
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $paths = $userPath -split ';'
    return $paths -contains $Directory
}

function Add-ToPath {
    param([string]$Directory)

    $currentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    Write-Debug-Log "Current User PATH: $currentUserPath"
    Write-Debug-Log "Checking if $Directory is in PATH"

    if (Test-InPath $Directory) {
        $msg = "$Directory is already in your PATH"
        Write-ColorOutput -Message $msg -Type "Success"
        return
    }

    $msg = "$Directory is not in your PATH"
    Write-ColorOutput -Message $msg -Type "Warning"

    $response = Read-Host "Do you want to add it to your PATH automatically? (Y/n)"
    if ($response -match '^[Nn]$') {
        Write-ColorOutput -Message "Skipping PATH update" -Type "Info"
        Write-Host ""
        Write-ColorOutput -Message "To use the GitLab Duo CLI, add this directory to your PATH:" -Type "Info"
        Write-Host $Directory -ForegroundColor Yellow
        Write-Host ""
        Write-Host "You can do this by running:" -ForegroundColor Blue
        $exampleCommand = '$env:Path = "' + $Directory + ';" + $env:Path'
        Write-Host $exampleCommand -ForegroundColor Yellow
        return
    }

    try {
        $pathVarName = 'Path'
        $userScope = 'User'
        $userPath = [Environment]::GetEnvironmentVariable($pathVarName, $userScope)

        if ($userPath -split ';' -contains $Directory) {
            Write-ColorOutput -Message "PATH already configured" -Type "Info"
            return
        }

        Write-Debug-Log "Adding $Directory to User PATH"
        $newPath = $Directory + ';' + $userPath
        [Environment]::SetEnvironmentVariable($pathVarName, $newPath, $userScope)
        $env:Path = $Directory + ';' + $env:Path

        Write-ColorOutput -Message "Added $Directory to PATH" -Type "Success"
        Write-Host ""
        Write-ColorOutput -Message "PATH updated for current session and future sessions" -Type "Info"
        Write-ColorOutput -Message "You may need to restart other terminal sessions for changes to take effect" -Type "Info"
    }
    catch {
        Write-ColorOutput -Message "Failed to update PATH" -Type "Error"
        Write-Debug-Log "Error: $_"
        Write-Host ""
        Write-ColorOutput -Message "Please add this directory to your PATH manually:" -Type "Info"
        Write-Host $Directory -ForegroundColor Yellow
    }
}

function Test-Installation {
    param([string]$InstallDir)

    $installPath = Join-Path $InstallDir $BINARY_NAME

    Write-ColorOutput -Message "Verifying installation..." -Type "Info"
    Write-Debug-Log "Binary path: $installPath"
    Write-Debug-Log "Binary exists: $(Test-Path $installPath)"

    if (-not (Test-Path $installPath)) {
        Write-ColorOutput -Message "Binary not found: $installPath" -Type "Error"
        throw "Installation verification failed"
    }

    Write-Debug-Log "Attempting to run: $installPath version"

    try {
        $versionOutput = & $installPath version 2>&1
        Write-Debug-Log "Command exit code: $LASTEXITCODE"
        Write-Debug-Log "Version output: $versionOutput"
        Write-ColorOutput -Message "Installation verified successfully" -Type "Success"
        Write-Host "  Version: " -NoNewline
        Write-Host $versionOutput -ForegroundColor Green
    }
    catch {
        try {
            $versionOutput = & $installPath --version 2>&1
            Write-Debug-Log "Command exit code: $LASTEXITCODE"
            Write-Debug-Log "Version output: $versionOutput"
            Write-ColorOutput -Message "Installation verified successfully" -Type "Success"
            Write-Host "  Version: " -NoNewline
            Write-Host $versionOutput -ForegroundColor Green
        }
        catch {
            Write-ColorOutput -Message "Could not verify binary version (this may be normal)" -Type "Warning"
            Write-Debug-Log "All version commands failed"
        }
    }
}

function Show-Usage {
    Write-Host "GitLab Duo CLI Installation Script (PowerShell)"
    Write-Host ""
    Write-Host "Usage: .\install_duo_cli.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "    -Version VERSION      Install a specific version instead of the latest"
    Write-Host "    -Help                 Show this help message"
    Write-Host ""
    Write-Host "Environment Variables:"
    Write-Host "    `$env:DEBUG=1         Enable debug logging for troubleshooting"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "    .\install_duo_cli.ps1                       # Install latest version"
    Write-Host "    .\install_duo_cli.ps1 -Version 1.2.3       # Install version 1.2.3"
    Write-Host "    `$env:DEBUG=1; .\install_duo_cli.ps1        # Install with debug logging"
    Write-Host ""
    Write-Host "This script will:"
    Write-Host "  - Detect your platform (architecture)"
    Write-Host "  - Download the appropriate GitLab Duo CLI binary"
    Write-Host "  - Install it to $INSTALL_DIR"
    Write-Host "  - Update your PATH if needed"
    Write-Host ""
}

function Main {
    param(
        [string]$Version = "",
        [switch]$Help
    )

    if ($Help) {
        Show-Usage
        exit 0
    }

    Write-Host "============================================" -ForegroundColor Blue
    Write-Host "     GitLab Duo CLI Installation Script     " -ForegroundColor Blue
    Write-Host "============================================" -ForegroundColor Blue
    Write-Host ""

    if ($DebugEnabled) {
        Write-Debug-Log "Debug mode enabled"
        Write-Debug-Log "Script version: 1.0"
        Write-Debug-Log "PowerShell version: $($PSVersionTable.PSVersion)"
        Write-Debug-Log "Working directory: $(Get-Location)"
        Write-Debug-Log "User: $env:USERNAME"
        Write-Debug-Log "Computer: $env:COMPUTERNAME"
    }

    Write-ColorOutput -Message "Detecting platform..." -Type "Info"
    $platformInfo = Get-PlatformInfo
    $binaryFilename = Get-BinaryName -Platform $platformInfo.BinaryVariant
    Write-ColorOutput -Message "Platform: $($platformInfo.BinaryVariant)" -Type "Success"
    Write-ColorOutput -Message "Binary: $binaryFilename" -Type "Success"
    Write-Host ""

    $packageInfo = $null
    if ([string]::IsNullOrEmpty($Version)) {
        $packageInfo = Get-LatestPackageInfo
        $Version = $packageInfo.Version
        Write-ColorOutput -Message "Latest version: $Version" -Type "Success"
        Write-Debug-Log "Package ID: $($packageInfo.PackageId)"
    } else {
        Write-ColorOutput -Message "Using specified version: $Version" -Type "Info"
        Write-Debug-Log "Version specified via -Version parameter"
        $packageInfo = Get-PackageInfoByVersion -TargetVersion $Version
        Write-Debug-Log "Package ID: $($packageInfo.PackageId)"
    }
    Write-Host ""

    $tempFile = [System.IO.Path]::GetTempFileName()
    $tempFile = $tempFile -replace '\.tmp$', '.exe'
    Write-Debug-Log "Created temporary file: $tempFile"

    try {
        $downloadSuccess = Download-Binary -PackageId $packageInfo.PackageId -Version $Version -BinaryFilename $binaryFilename -OutputPath $tempFile

        if (-not $downloadSuccess) {
            throw "Failed to download binary"
        }

        Write-Host ""
        Install-Binary -SourcePath $tempFile -TargetDir $INSTALL_DIR
        Write-Host ""
        Add-ToPath -Directory $INSTALL_DIR
        Write-Host ""
        Test-Installation -InstallDir $INSTALL_DIR
        Write-Host ""

        Write-Host "============================================" -ForegroundColor Green
        Write-Host "  Installation completed successfully!     " -ForegroundColor Green
        Write-Host "============================================" -ForegroundColor Green
        Write-Host ""

        if (Test-InPath $INSTALL_DIR) {
            Write-ColorOutput -Message "You can now run: duo" -Type "Info"
        } else {
            Write-ColorOutput -Message "After restarting your terminal you can run: duo" -Type "Info"
        }
    }
    finally {
        if (Test-Path $tempFile) {
            Write-Debug-Log "Cleaning up temporary file: $tempFile"
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        }
    }
}

try {
    Main -Version $Version -Help:$Help
}
catch {
    Write-Host ""
    Write-ColorOutput -Message "Installation failed: $_" -Type "Error"
    Write-Debug-Log "Stack trace: $($_.ScriptStackTrace)"
    exit 1
}
