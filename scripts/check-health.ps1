param(
    [string]$BaseUrl = "http://127.0.0.1:3000",
    [ValidateRange(1, 60)]
    [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = "Stop"
$failed = $false

foreach ($probe in @("live", "ready")) {
    $uri = "$($BaseUrl.TrimEnd('/'))/healthz/$probe"
    try {
        $response = Invoke-WebRequest -Uri $uri -TimeoutSec $TimeoutSeconds -SkipHttpErrorCheck
        $body = $response.Content | ConvertFrom-Json
        $expected = if ($probe -eq "live") { "alive" } else { "ready" }
        $passed = $response.StatusCode -eq 200 -and $body.status -eq $expected
        if (-not $passed) { $failed = $true }
        [pscustomobject]@{
            Probe = $probe
            HttpStatus = $response.StatusCode
            Status = $body.status
            Passed = $passed
        }
    }
    catch {
        $failed = $true
        Write-Host "$probe failed: $($_.Exception.Message)"
    }
}

if ($failed) { exit 1 }
