# Basic function without functionality
function Greet {
    param (
        [string]$Name
    )

}

# Function that prints the name to the console
function Greet2 {
    param (
        [string]$Name
    )
    Write-Host $Name
}

# Assigning a function to a variable
$Greet3 = {
    param (
        [string]$Name
    )
}

# Function assigned to a variable that prints the name to the console
$Greet4 = {
    param (
        [string]$Name
    )
    Write-Host $Name
}

# Arrow function-like syntax using script blocks (no direct equivalent in PowerShell)
$Greet5 = {
    param (
        [string]$Name
    )
}

# Function assigned to a variable that prints the name to the console
$Greet6 = {
    param (
        [string]$Name
    )
    Write-Host $Name
}
