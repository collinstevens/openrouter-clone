param(
    [ValidateSet("all", "openai", "anthropic")]
    [string]$Provider = "all"
)

$ErrorActionPreference = "Stop"
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    & mise.exe exec -- node --env-file-if-exists=.env --import tsx src/scripts/verify-providers.ts $Provider
    $verificationExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}
exit $verificationExitCode
