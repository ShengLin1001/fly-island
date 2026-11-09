# GitHub calls for main.ps1: the REST API with the rate limit headers, and the
# device flow sign-in of a GitHub App (no client secret in the plugin).

$script:Agent = 'FocuSD-Island-github-issues'
# Tests point these at a local server (FOCUSD_GITHUB_API); nothing else sets it.
$script:ApiBase = 'https://api.github.com'
$script:WebBase = 'https://github.com'
if ($env:FOCUSD_GITHUB_API) { $script:ApiBase = $env:FOCUSD_GITHUB_API; $script:WebBase = $env:FOCUSD_GITHUB_API }

function Get-UnixNow { [long][Math]::Floor(([DateTime]::UtcNow - [DateTime]'1970-01-01').TotalSeconds) }

function Read-RateHeaders($Result, $Headers) {
    if ($null -eq $Headers) { return }
    $remaining = $Headers['X-RateLimit-Remaining']
    if ($remaining) {
        $Result.Remaining = [int]$remaining
        $Result.Limit = [int]$Headers['X-RateLimit-Limit']
        $Result.Reset = [long]$Headers['X-RateLimit-Reset']
    }
}

# GET a REST API URL. Returns @{ Status; Data; ETag; Remaining; Limit; Reset; Message }:
# Status 0 when no answer came back (network), 304 when ETag still matches.
function Invoke-GitHub([string]$Url, [string]$Token = '', [string]$ETag = '') {
    $headers = @{ 'User-Agent' = $script:Agent; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
    if ($Token) { $headers.Authorization = "Bearer $Token" }
    if ($ETag) { $headers['If-None-Match'] = $ETag }
    $result = @{ Status = 0; Data = $null; ETag = ''; Remaining = $null; Limit = $null; Reset = $null; Message = '' }
    try {
        # Invoke-RestMethod in PowerShell 5.1 hides the response headers, which carry the rate limit.
        $response = Invoke-WebRequest -Uri $Url -Headers $headers -UseBasicParsing -TimeoutSec 15
        $result.Status = [int]$response.StatusCode
        Read-RateHeaders $result $response.Headers
        $result.ETag = [string]$response.Headers['ETag']
        $result.Data = [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()) | ConvertFrom-Json
    } catch [System.Net.WebException] {
        $web = $_.Exception.Response
        $result.Message = $_.Exception.Message
        if ($null -ne $web) {
            $result.Status = [int]$web.StatusCode
            Read-RateHeaders $result $web.Headers
            try {
                $reader = New-Object IO.StreamReader($web.GetResponseStream(), [Text.Encoding]::UTF8)
                $message = ($reader.ReadToEnd() | ConvertFrom-Json).message
                if ($message) { $result.Message = [string]$message }
            } catch { }
        }
    } catch {
        $result.Message = $_.Exception.Message
    }
    $result
}

function Invoke-GitHubForm([string]$Url, [hashtable]$Body) {
    Invoke-RestMethod -Method Post -Uri $Url -Headers @{ Accept = 'application/json'; 'User-Agent' = $script:Agent } -Body $Body -TimeoutSec 15
}

# Starts the device flow: { device_code, user_code, verification_uri, expires_in, interval } or { error }.
function Start-DeviceLogin([string]$ClientId) {
    Invoke-GitHubForm "$($script:WebBase)/login/device/code" @{ client_id = $ClientId }
}

# Asks for the token of a started device flow; { error = 'authorization_pending' } until the user agrees.
function Request-DeviceToken([string]$ClientId, [string]$DeviceCode) {
    Invoke-GitHubForm "$($script:WebBase)/login/oauth/access_token" @{
        client_id = $ClientId; device_code = $DeviceCode; grant_type = 'urn:ietf:params:oauth:grant-type:device_code'
    }
}

# Swaps a refresh token for a new access token (GitHub Apps whose user tokens expire).
function Request-RefreshedToken([string]$ClientId, [string]$RefreshToken) {
    Invoke-GitHubForm "$($script:WebBase)/login/oauth/access_token" @{
        client_id = $ClientId; refresh_token = $RefreshToken; grant_type = 'refresh_token'
    }
}

# The record kept in the Credential Manager for a token answer. Expiry times are
# Unix seconds; 0 means the token does not expire.
function New-TokenRecord($Answer, [string]$Login = '') {
    $now = Get-UnixNow
    $record = @{ token = [string]$Answer.access_token; expiresAt = 0; refresh = ''; refreshExpiresAt = 0; login = $Login }
    if ($Answer.expires_in) { $record.expiresAt = $now + [long]$Answer.expires_in }
    if ($Answer.refresh_token) {
        $record.refresh = [string]$Answer.refresh_token
        if ($Answer.refresh_token_expires_in) { $record.refreshExpiresAt = $now + [long]$Answer.refresh_token_expires_in }
    }
    $record
}

function ConvertFrom-TokenRecord([string]$Json) {
    if (-not $Json) { return $null }
    try { $value = $Json | ConvertFrom-Json } catch { return $null }
    if (-not $value.token) { return $null }
    @{
        token = [string]$value.token; expiresAt = [long]$value.expiresAt; refresh = [string]$value.refresh
        refreshExpiresAt = [long]$value.refreshExpiresAt; login = [string]$value.login
    }
}
