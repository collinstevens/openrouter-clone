param(
    [Parameter(Mandatory)]
    [string]$Model,
    [string]$Message = "Reply with OK.",
    [string]$BaseUrl = "http://127.0.0.1:3000",
    [ValidateRange(1, 4096)]
    [int]$MaxTokens = 64,
    [ValidateRange(1, 300)]
    [int]$TimeoutSeconds = 30,
    [switch]$Stream
)

$ErrorActionPreference = "Stop"
$request = @{
    model = $Model
    messages = @(@{ role = "user"; content = $Message })
    max_tokens = $MaxTokens
    stream = $Stream.IsPresent
} | ConvertTo-Json -Depth 5 -Compress

$request | & curl.exe --silent --show-error --fail-with-body --no-buffer --max-time $TimeoutSeconds --header "Content-Type: application/json" --data-binary '@-' "$($BaseUrl.TrimEnd('/'))/v1/chat/completions"
exit $LASTEXITCODE
