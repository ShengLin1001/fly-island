# GitHub Issues (API version 2): an island page (list template) with the open
# issues of one or more GitHub repositories, one group per repository. Clicking
# an issue opens it in the browser (the island does that from the item's url).
# Issues are fetched only while the page is on screen. Without signing in GitHub
# allows 60 calls an hour per IP address, so the refresh interval grows with the
# number of repositories; the optional sign-in (a GitHub App, device flow) raises
# that to 5000 and keeps its token in the Windows Credential Manager.
. "$PSScriptRoot\lib\focusd.ps1"
. "$PSScriptRoot\github.ps1"

# Windows PowerShell 5.1 reads a script without a BOM as ANSI, so this file stays
# ASCII and writes Chinese text as \u escapes.
function Text([string]$Escaped) { [regex]::Unescape($Escaped) }
function Both([string]$Zh, [string]$En) { @{ 'zh-CN' = (Text $Zh); en = $En } }

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# The Client ID of the GitHub App the sign-in uses (not a secret). The clientId
# setting overrides it.
$script:BuiltInClientId = 'Iv23liVdmttEzBHuhzg5'
$script:TokenKey = 'github.token'
$script:MaxRepos = 20
# Calls an hour the refresh may use: most of the anonymous 60, less of the signed-in 5000.
$script:AnonymousBudget = 50
$script:SignedInBudget = 4000

$script:Repos = @()
$script:BadRepos = @()
$script:Minutes = 15
$script:LoginOn = $false
$script:ClientIdSetting = ''
$script:Visible = $false
$script:FetchedAt = [DateTime]::MinValue
$script:Cache = @{}
$script:Rate = $null
$script:Token = $null
$script:Device = $null
$script:AuthNote = $null
$script:CanShow = $false
$script:CanAsk = $false
$script:Permissions = @()

function Read-Settings($settings) {
    $names = @(([string]$settings.repo) -split '[,;\s]+' | Where-Object { $_ } | Select-Object -Unique)
    $script:Repos = @($names | Where-Object { $_ -match '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' } | Select-Object -First $script:MaxRepos)
    $script:BadRepos = @($names | Where-Object { $_ -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' })
    $script:Minutes = [Math]::Max(5, [int]$settings.minutes)
    $script:LoginOn = [bool]$settings.login
    $script:ClientIdSetting = ([string]$settings.clientId).Trim()
    foreach ($key in @($script:Cache.Keys)) { if ($script:Repos -notcontains $key) { $script:Cache.Remove($key) } }
}

function Get-ClientId { if ($script:ClientIdSetting) { $script:ClientIdSetting } else { $script:BuiltInClientId } }

# Minutes between refreshes: the setting, or longer when the repositories would use up the hourly calls.
function Get-Interval {
    $budget = if ($script:Token) { $script:SignedInBudget } else { $script:AnonymousBudget }
    [Math]::Max($script:Minutes, [int][Math]::Ceiling($script:Repos.Count * 60 / $budget))
}

function Format-Clock([long]$Unix) { ([DateTime]'1970-01-01').AddSeconds($Unix).ToLocalTime().ToString('HH:mm') }

function Test-RateUsedUp { [bool]($script:Rate -and $script:Rate.Remaining -le 0 -and $script:Rate.Reset -gt (Get-UnixNow)) }

function Get-UsedUpText {
    @{ 'zh-CN' = "$(Text '\u672c\u5c0f\u65f6\u7684\u8bf7\u6c42\u6b21\u6570\u7528\u5b8c\u4e86\uff0c')$(Format-Clock $script:Rate.Reset)$(Text ' \u540e\u518d\u8bd5')"; en = "No calls left this hour; tries again after $(Format-Clock $script:Rate.Reset)." }
}

# --- sign-in ---------------------------------------------------------------

function Test-Secrets { $script:Permissions -contains 'secrets' }

# Asks for the optional secrets permission once the user wants to sign in.
function Request-Secrets {
    if (Test-Secrets) { return $true }
    if (-not $script:CanAsk) { return $false }
    try { $answer = Request-FocusdPermission 'secrets' } catch { return $false }
    if (@($answer.granted) -contains 'secrets') { $script:Permissions += 'secrets'; return $true }
    $false
}

function Save-Token($Record) {
    $script:Token = $Record
    Set-FocusdSecret $script:TokenKey ($Record | ConvertTo-Json -Compress)
}

function Clear-Token([object]$Note = $null) {
    $script:Token = $null
    $script:Rate = $null
    $script:AuthNote = $Note
    if (Test-Secrets) { try { [void](Remove-FocusdSecret $script:TokenKey) } catch { } }
}

function Read-SavedToken {
    if (-not (Test-Secrets)) { return }
    try { $script:Token = ConvertFrom-TokenRecord (Get-FocusdSecret $script:TokenKey) } catch { $script:Token = $null }
}

function Start-Login {
    $script:AuthNote = $null
    if (-not $script:LoginOn) {
        $script:AuthNote = Both '\u5148\u5728\u63d2\u4ef6\u8bbe\u7f6e\u91cc\u6253\u5f00\u300c\u7528 GitHub \u8d26\u53f7\u767b\u5f55\u300d' 'Turn on "Sign in with GitHub" in the plugin settings first.'
    } elseif (-not (Get-ClientId)) {
        $script:AuthNote = Both '\u8fd8\u6ca1\u6709\u914d\u7f6e GitHub App \u7684 Client ID\uff0c\u6682\u65f6\u4e0d\u80fd\u767b\u5f55' 'No GitHub App Client ID is set, so signing in is not available yet.'
    } elseif (-not (Request-Secrets)) {
        $script:AuthNote = Both '\u767b\u5f55\u8981\u628a\u4ee4\u724c\u5b58\u8fdb Windows \u51ed\u636e\u7ba1\u7406\u5668\uff0c\u9700\u8981\u5141\u8bb8\u300c\u5bc6\u94a5\u300d\u6743\u9650' 'Signing in keeps the token in the Windows Credential Manager, which needs the secrets permission.'
    } else {
        Read-SavedToken
        if ($script:Token) { Update-Issues; return }
        try {
            $answer = Start-DeviceLogin (Get-ClientId)
            if ($answer.error) { throw [string]$answer.error_description }
            $now = Get-UnixNow
            $interval = [Math]::Max(5, [int]$answer.interval)
            $script:Device = @{
                Code = [string]$answer.user_code; Uri = [string]$answer.verification_uri; DeviceCode = [string]$answer.device_code
                Interval = $interval; NextPoll = $now + $interval + 1; ExpiresAt = $now + [long]$answer.expires_in; Copied = $false
            }
            # Tests (FOCUSD_GITHUB_API) leave the clipboard of whoever runs them alone.
            if (-not $env:FOCUSD_GITHUB_API) { try { Set-Clipboard -Value $script:Device.Code; $script:Device.Copied = $true } catch { } }
        } catch {
            $reason = $_.Exception.Message
            $script:AuthNote = @{ 'zh-CN' = "$(Text '\u767b\u5f55\u6ca1\u6709\u5f00\u59cb\uff1a')$reason"; en = "Could not start signing in: $reason" }
        }
    }
    Send-Model
}

# Polls a started device flow; called from the loop about once a second.
function Step-Login {
    $device = $script:Device
    $now = Get-UnixNow
    if ($null -eq $device -or $now -lt $device.NextPoll) { return }
    if ($now -ge $device.ExpiresAt) {
        $script:Device = $null
        $script:AuthNote = Both '\u9a8c\u8bc1\u7801\u8fc7\u671f\u4e86\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55' 'The code expired; sign in again.'
        Send-Model
        return
    }
    # A second to spare: the loop wakes about once a second and GitHub answers slow_down to
    # a poll that comes even a little early, adding 5 s to the interval each time.
    $device.NextPoll = $now + $device.Interval + 1
    try { $answer = Request-DeviceToken (Get-ClientId) $device.DeviceCode } catch { Write-FocusdLog "token poll failed: $($_.Exception.Message)"; return }
    if ([string]$answer.error -ne 'authorization_pending') { Write-FocusdLog "token poll: $(if ($answer.error) { $answer.error } else { 'token' })" }
    switch ([string]$answer.error) {
        '' { }
        'authorization_pending' { return }
        'slow_down' {
            # GitHub says the interval it now wants; the next poll waits that long from now.
            $device.Interval = if ($answer.interval) { [int]$answer.interval } else { $device.Interval + 5 }
            $device.NextPoll = (Get-UnixNow) + $device.Interval + 1
            return
        }
        'access_denied' { $script:Device = $null; $script:AuthNote = Both '\u4f60\u5728\u6d4f\u89c8\u5668\u91cc\u53d6\u6d88\u4e86\u6388\u6743' 'You declined in the browser.'; Send-Model; return }
        default {
            $script:Device = $null
            $script:AuthNote = @{ 'zh-CN' = "$(Text '\u767b\u5f55\u5931\u8d25\uff1a')$($answer.error_description)"; en = "Sign-in failed: $($answer.error_description)" }
            Send-Model
            return
        }
    }
    $script:Device = $null
    $user = Invoke-GitHub "$($script:ApiBase)/user" ([string]$answer.access_token)
    $login = if ($user.Status -eq 200) { [string]$user.Data.login } else { '' }
    Save-Token (New-TokenRecord $answer $login)
    $script:Rate = $null
    Update-Issues
}

# Renews an expiring token before a refresh; signs out when that fails.
function Update-TokenIfDue {
    $token = $script:Token
    if ($null -eq $token -or $token.expiresAt -eq 0 -or $token.expiresAt - (Get-UnixNow) -gt 300) { return }
    $renewed = $null
    if ($token.refresh -and ($token.refreshExpiresAt -eq 0 -or $token.refreshExpiresAt -gt (Get-UnixNow))) {
        try { $renewed = Request-RefreshedToken (Get-ClientId) $token.refresh } catch { $renewed = $null }
    }
    if ($renewed -and $renewed.access_token) { Save-Token (New-TokenRecord $renewed $token.login); return }
    Clear-Token (Both '\u767b\u5f55\u5df2\u8fc7\u671f\uff0c\u5df2\u6539\u56de\u533f\u540d\u8bbf\u95ee\uff1b\u8bf7\u91cd\u65b0\u767b\u5f55' 'The sign-in expired; back to anonymous access. Sign in again.')
}

# --- issues ------------------------------------------------------------------

function Get-Entry([string]$Repo) {
    if (-not $script:Cache.ContainsKey($Repo)) { $script:Cache[$Repo] = @{ Items = @(); ETag = ''; Error = $null; Loaded = $false } }
    $script:Cache[$Repo]
}

function ConvertTo-Items([string]$Repo, $Data) {
    # PowerShell 5.1 writes a JSON array as one object; piping enumerates it.
    # The issues API lists pull requests too; they have a pull_request field.
    @(@($Data | ForEach-Object { $_ }) | Where-Object { $null -eq $_.pull_request } | ForEach-Object {
        $item = @{
            id = "$($Repo):$($_.number)"
            title = [string]$_.title
            subtitle = "#$($_.number) - $($_.user.login) - $(([DateTime]$_.updated_at).ToString('yyyy-MM-dd'))"
            url = [string]$_.html_url
        }
        if ($_.comments -gt 0) { $item.note = "$($_.comments)" }
        $item
    })
}

function Update-Repo([string]$Repo) {
    $entry = Get-Entry $Repo
    if (Test-RateUsedUp) { $entry.Error = Get-UsedUpText; return }
    $url = "$($script:ApiBase)/repos/$Repo/issues?state=open&per_page=30"
    $token = if ($script:Token) { $script:Token.token } else { '' }
    $answer = Invoke-GitHub $url $token $entry.ETag
    if ($answer.Status -eq 401 -and $token) {
        Clear-Token (Both '\u767b\u5f55\u5931\u6548\u4e86\uff0c\u5df2\u6539\u56de\u533f\u540d\u8bbf\u95ee\uff1b\u8bf7\u91cd\u65b0\u767b\u5f55' 'The sign-in no longer works; back to anonymous access. Sign in again.')
        $answer = Invoke-GitHub $url '' ''
    }
    if ($null -ne $answer.Remaining) { $script:Rate = @{ Remaining = $answer.Remaining; Limit = $answer.Limit; Reset = $answer.Reset } }
    switch ($answer.Status) {
        200 { $entry.Items = ConvertTo-Items $Repo $answer.Data; $entry.ETag = $answer.ETag; $entry.Error = $null; $entry.Loaded = $true }
        304 { $entry.Error = $null }
        404 { $entry.Items = @(); $entry.Error = Both '\u627e\u4e0d\u5230\u8fd9\u4e2a\u4ed3\u5e93\uff1a\u540d\u5b57\u5199\u9519\u4e86\uff0c\u6216\u8005\u662f\u6ca1\u6709\u6743\u9650\u770b\u7684\u79c1\u6709\u4ed3\u5e93' 'Repository not found: a typo, or a private repository you cannot see.' }
        default {
            if (Test-RateUsedUp) { $entry.Error = Get-UsedUpText }
            else { $entry.Error = @{ 'zh-CN' = "$(Text '\u52a0\u8f7d\u5931\u8d25\uff1a')$($answer.Message)"; en = "Could not load the issues: $($answer.Message)" } }
        }
    }
    Write-FocusdLog "$Repo -> $($answer.Status), $(@($entry.Items).Count) open"
}

function Update-Issues {
    $script:FetchedAt = [DateTime]::UtcNow
    if ($script:Repos.Count -eq 0) { Send-Model; return }
    if (@($script:Repos | Where-Object { -not (Get-Entry $_).Loaded }).Count -gt 0) { Send-Model $true }
    Update-TokenIfDue
    foreach ($repo in $script:Repos) { Update-Repo $repo }
    Send-Model
}

# --- page ------------------------------------------------------------------

function Get-AccountRows {
    if ($script:Device) {
        $copied = if ($script:Device.Copied) { Text '\uff08\u5df2\u590d\u5236\uff09' } else { '' }
        return @(
            @{ id = 'login-code'; title = @{ 'zh-CN' = "$(Text '\u9a8c\u8bc1\u7801 ')$($script:Device.Code)$copied"; en = "Code $($script:Device.Code)" }
               subtitle = Both '\u70b9\u8fd9\u91cc\u6253\u5f00 GitHub\uff0c\u7c98\u8d34\u9a8c\u8bc1\u7801\u5e76\u6388\u6743\uff1b\u6388\u6743\u540e\u8fd9\u91cc\u4f1a\u81ea\u52a8\u66f4\u65b0' 'Click to open GitHub, paste the code and authorize; this page updates by itself.'
               url = $script:Device.Uri; icon = 'link' },
            @{ id = 'login-cancel'; title = Both '\u53d6\u6d88\u767b\u5f55' 'Cancel sign-in'; action = 'cancel' }
        )
    }
    $interval = Get-Interval
    $zh = @("$($script:Repos.Count) $(Text '\u4e2a\u4ed3\u5e93\uff0c\u6bcf') $interval $(Text '\u5206\u949f\u5237\u65b0')")
    $en = @("$($script:Repos.Count) repositories, refreshed every $interval min")
    if ($interval -gt $script:Minutes) { $zh += (Text '\u4ed3\u5e93\u591a\uff0c\u95f4\u9694\u5df2\u81ea\u52a8\u62c9\u957f'); $en += 'longer for this many repositories' }
    if (Test-RateUsedUp) { $zh += "$(Text '\u6b21\u6570\u7528\u5b8c\uff0c')$(Format-Clock $script:Rate.Reset) $(Text '\u91cd\u7f6e')"; $en += "used up, resets at $(Format-Clock $script:Rate.Reset)" }
    $left = if ($script:Rate) { " - $($script:Rate.Remaining)/$($script:Rate.Limit)" } else { '' }
    $row = @{ id = 'account'; icon = 'globe'; subtitle = @{ 'zh-CN' = ($zh -join (Text '\uff1b')); en = ($en -join '; ') } }
    if ($script:Token) {
        $who = if ($script:Token.login) { "@$($script:Token.login)" } else { 'GitHub' }
        $row.title = @{ 'zh-CN' = "$(Text '\u5df2\u767b\u5f55 ')$who$left"; en = "Signed in as $who$left" }
        $row.actions = @(@{ id = 'logout'; title = Both '\u9000\u51fa\u767b\u5f55' 'Sign out' })
    } else {
        $row.title = @{ 'zh-CN' = "$(Text '\u533f\u540d\u8bbf\u95ee')$left"; en = "Anonymous$left" }
        if ($script:LoginOn) { $row.actions = @(@{ id = 'login'; title = Both '\u767b\u5f55 GitHub' 'Sign in' }) }
    }
    $rows = @($row)
    if ($script:AuthNote) { $rows += @{ id = 'account-note'; title = $script:AuthNote; icon = 'info' } }
    $rows
}

function Send-Model([bool]$Loading = $false) {
    if (-not $script:CanShow -or -not $script:Visible) { return }
    $groups = @(@{ title = 'GitHub'; items = @(Get-AccountRows) })
    foreach ($repo in $script:Repos) {
        $entry = Get-Entry $repo
        $items = @($entry.Items)
        $title = "$repo - $($items.Count) open"
        if ($entry.Error) {
            $items = @(@{ id = "$($repo):error"; title = $entry.Error; icon = 'info' }) + $items
            if (-not $entry.Loaded) { $title = $repo }
        }
        $groups += @{ title = $title; items = $items }
    }
    if ($script:BadRepos.Count -gt 0) {
        $bad = @($script:BadRepos | ForEach-Object {
            @{ id = "bad:$($_ -replace '[^A-Za-z0-9_.:/-]', '_')"; title = "$_"; icon = 'info'
               subtitle = Both '\u8981\u5199\u6210 owner/name\uff0c\u591a\u4e2a\u7528\u9017\u53f7\u5206\u9694' 'Write owner/name; separate several with commas.' }
        })
        $groups += @{ title = Both '\u5199\u6cd5\u4e0d\u5bf9\u7684\u4ed3\u5e93' 'Not repository names'; items = $bad }
    }
    Update-FocusdView 'issues' @{
        search = @{ placeholder = Both '\u7b5b\u9009 issue' 'Filter issues' }
        groups = $groups
        empty = Both '\u5728\u63d2\u4ef6\u8bbe\u7f6e\u91cc\u586b\u5199\u4ed3\u5e93\uff0c\u683c\u5f0f\u662f owner/name' 'Set the repositories (owner/name) in the plugin settings.'
        loading = $Loading
    }
}

function Test-Stale { ([DateTime]::UtcNow - $script:FetchedAt).TotalMinutes -ge (Get-Interval) }

function Invoke-SignOut {
    Clear-Token (Both '\u5df2\u9000\u51fa\u767b\u5f55\uff0c\u4ee4\u724c\u5df2\u4ece\u51ed\u636e\u7ba1\u7406\u5668\u5220\u9664' 'Signed out; the token was removed from the Credential Manager.')
    Send-Model
}

$handlers = @{
    'initialize' = {
        param($params)
        Read-Settings $params.settings
        $script:CanShow = @($params.capabilities) -contains 'views'
        $script:CanAsk = @($params.capabilities) -contains 'permissions'
        $script:Permissions = @($params.permissions)
        if ($script:LoginOn) { Read-SavedToken }
        if (-not $script:CanShow) { Write-FocusdLog 'this FocuSD Island is too old for this plugin (needs island pages)' }
    }
    'settings.changed' = {
        param($params)
        $wasOn = $script:LoginOn
        Read-Settings $params.settings
        # Turning the sign-in off also deletes the saved token.
        if ($wasOn -and -not $script:LoginOn) { $script:Device = $null; Clear-Token }
        if ($script:Visible) { Update-Issues } else { $script:FetchedAt = [DateTime]::MinValue }
    }
    'view.visible' = {
        param($params)
        $script:Visible = [bool]$params.visible
        # A page opened again within the interval shows what was fetched.
        if ($script:Visible) { if (Test-Stale) { Update-Issues } else { Send-Model } }
    }
    'view.action' = {
        param($params)
        switch ([string]$params.actionId) {
            'login' { Start-Login }
            'logout' { Invoke-SignOut }
            'cancel' { $script:Device = $null; $script:AuthNote = $null; Send-Model }
        }
    }
    'command' = {
        param($params)
        switch ([string]$params.id) {
            'refresh' { Update-Issues }
            'login' { Start-Login }
            'logout' { Invoke-SignOut }
        }
    }
}

# A sign-in in progress is polled every second; otherwise the page is checked every 5 s.
while ($true) {
    $timeout = if ($script:Device) { 1000 } else { 5000 }
    $message = Receive-FocusdNotification $timeout
    try {
        if ($null -eq $message) {
            if ($script:Device) { Step-Login }
            elseif ($script:Visible -and (Test-Stale)) { Update-Issues }
            continue
        }
        $method = [string]$message.method
        if ($method -eq 'shutdown') { exit 0 }
        if ($handlers.ContainsKey($method)) { & $handlers[$method] $message.params }
    } catch {
        # Keep running: one failed call should not make the island restart the plugin.
        Write-FocusdLog "error: $($_.Exception.Message)"
    }
}
