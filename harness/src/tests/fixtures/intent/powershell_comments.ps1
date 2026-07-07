<#
.SYNOPSIS
    This script greets the user and provides additional information.

.DESCRIPTION
    A simple PowerShell script to demonstrate basic commands such as displaying a greeting message,
    showing the current date and time, and displaying the current directory.
#>

# Display a greeting message with the current user's username

Write-Host "Hello, $env:USERNAME!"

# Provide a brief description of the script's purpose
Write-Host "This script is designed to greet you and show some information."

# Display the current date and time
Write-Host "Today's date and time is: $(Get-Date)"

# Show the current directory
#

Write-Host "You are currently in the directory: $(Get-Location)"

function Greet {
    # Add your custom greeting logic here

}
