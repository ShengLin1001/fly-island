# The dev task board (roadmap F10): the tasks in docs/tasks of the fly-island
# repo on an island page, from `node scripts/tasks/tasks.mjs --json`, so the
# board, stale claims and handoffs are worked out in one place (tasks.mjs).
# The collapsed bar shows how many tasks wait for the user. Installed by
# `pnpm tasks:plugin`, which copies lib/focusd.ps1 next to this file and records
# the repo folder in repo.txt.
. "$PSScriptRoot\lib\focusd.ps1"

# Windows PowerShell 5.1 reads a script without a BOM as ANSI, so this file stays
# ASCII and writes Chinese text as \u escapes.
function Text([string]$Escaped) { [regex]::Unescape($Escaped) }
function Both([string]$Zh, [string]$En) { @{ 'zh-CN' = (Text $Zh); en = $En } }

$script:Repo = ''
$script:Minutes = 2
$script:Visible = $false
$script:FetchedAt = [DateTime]::MinValue
$script:Tasks = @()
$script:LoadError = $null
$script:CanShow = $false
$script:ShownStatus = $null

function Read-Settings($settings) {
    $repo = ([string]$settings.repo).Trim()
    if (-not $repo) {
        $recorded = Join-Path $PSScriptRoot 'repo.txt'
        if (Test-Path $recorded) { $repo = (Get-Content $recorded -Raw).Trim() }
    }
    $script:Repo = $repo
    $script:Minutes = [Math]::Max(1, [int]$settings.minutes)
}

function Get-Field($task, [string]$Name) { [string]$task.$Name }

# "12 minutes ago" for a claim made today, else the date: the board says how fresh a claim is.
function Format-Ago([string]$Claimed) {
    try { $at = [DateTime]::ParseExact($Claimed, 'yyyy-MM-dd HH:mm', [Globalization.CultureInfo]::InvariantCulture) } catch { return $Claimed }
    $minutes = [int][Math]::Floor(([DateTime]::Now - $at).TotalMinutes)
    if ($minutes -lt 1) { return (Text '\u521a\u521a') }
    if ($minutes -lt 60) { return "$minutes$(Text '\u5206\u949f\u524d')" }
    if ($minutes -lt 1440) { return "$([int][Math]::Floor($minutes / 60))$(Text '\u5c0f\u65f6\u524d')" }
    $at.ToString('M-d')
}

# One row: the title alone on top; under it the id, who and where, how long ago, and what it
# waits on; on the right one short mark (children done, its issue, or a handoff). The icon
# says which group it is in, so a row read on its own still says what it is.
function New-Item-Row($task, [string]$Icon) {
    $parts = @(Get-Field $task 'id')
    if (Get-Field $task 'owner') { $parts += Get-Field $task 'owner' }
    if (Get-Field $task 'lane') { $parts += "lane $(Get-Field $task 'lane')" }
    if (Get-Field $task 'claimed') { $parts += Format-Ago (Get-Field $task 'claimed') }
    if ($task.stale) { $parts += [string]$task.stale }
    if (@($task.blockedBy).Count -gt 0) { $parts += "$(Text '\u7b49') $(@($task.blockedBy) -join ', ')" }
    if ((Get-Field $task 'needs') -eq 'user') { $parts += (Text '\u9700\u8981\u4f60\u672c\u4eba') }
    $row = @{
        id = "task-$(Get-Field $task 'id')"
        title = Get-Field $task 'title'
        subtitle = $parts -join " $([char]0x00B7) "
        icon = $Icon
        action = 'open'
    }
    if ($task.children) { $row.note = "$($task.children.done)/$($task.children.total)" }
    elseif (Get-Field $task 'issue') { $row.note = "#$(Get-Field $task 'issue')" }
    elseif ($task.handoff) { $row.note = (Text '\u6709\u4ea4\u63a5') }
    $row
}

function Send-Model([bool]$Loading = $false) {
    # needsUser: waiting for the user's answer, or work only the user can do (needs: user).
    $done = Text '\u5df2\u5b8c\u6210'
    $dropped = Text '\u4e0d\u505a'
    $open = @($script:Tasks | Where-Object { $_.status -ne $done -and $_.status -ne $dropped })
    $waiting = @($open | Where-Object { $_.needsUser })
    $stale = @($open | Where-Object { $_.stale })
    $active = @($open | Where-Object { $_.status -eq (Text '\u8fdb\u884c\u4e2d') -and -not $_.stale })
    $todo = @($open | Where-Object { $_.status -eq (Text '\u5f85\u505a') -and -not $_.needsUser })
    $today = (Get-Date).ToString('yyyy-MM-dd')
    $finished = @($script:Tasks | Where-Object { $_.status -eq $done -and [string]$_.done -eq $today })

    $status = if ($waiting.Count -gt 0) { "$(Text '\u4efb\u52a1\u5f85\u5b9a') $($waiting.Count)" } else { '' }
    if ($status -ne $script:ShownStatus) {
        $script:ShownStatus = $status
        [void](Invoke-FocusdMethod 'status.update' @{ itemId = 'waiting'; text = $status; tone = 'warning'; tooltip = (Text '\u6709\u4efb\u52a1\u9700\u8981\u4f60') })
    }
    if (-not $script:CanShow -or -not $script:Visible) { return }

    $groups = @()
    foreach ($group in @(
        @{ title = (Text '\u9700\u8981\u4f60'); list = $waiting; icon = 'bell' },
        @{ title = (Text '\u8ba4\u9886\u5df2\u5931\u6548'); list = $stale; icon = 'flame' },
        @{ title = (Text '\u8fdb\u884c\u4e2d'); list = $active; icon = 'activity' },
        @{ title = (Text '\u5f85\u505a'); list = $todo; icon = 'list-todo' },
        @{ title = (Text '\u4eca\u5929\u5b8c\u6210'); list = $finished; icon = 'circle-check' }
    )) {
        if ($group.list.Count -gt 0) {
            $icon = $group.icon
            # A task still waiting on another shows a clock instead of the to-do mark.
            $items = @($group.list | ForEach-Object { New-Item-Row $_ $(if ($icon -eq 'list-todo' -and @($_.blockedBy).Count -gt 0) { 'clock' } else { $icon }) })
            $groups += @{ title = "$($group.title) $($group.list.Count)"; items = $items }
        }
    }
    $model = @{
        search = @{ placeholder = (Both '\u7b5b\u9009\u4efb\u52a1' 'Filter tasks') }
        groups = $groups
        empty = (Both '\u6ca1\u6709\u672a\u5b8c\u6210\u7684\u4efb\u52a1' 'No open tasks')
        loading = $Loading
    }
    if ($script:LoadError) { $model.error = $script:LoadError }
    [void](Invoke-FocusdMethod 'view.update' @{ viewId = 'tasks'; model = $model })
}

function Update-Tasks {
    $script:FetchedAt = [DateTime]::UtcNow
    $cli = Join-Path $script:Repo 'scripts\tasks\tasks.mjs'
    if (-not $script:Repo -or -not (Test-Path $cli)) {
        $script:Tasks = @()
        $script:LoadError = Both '\u5728\u63d2\u4ef6\u8bbe\u7f6e\u91cc\u586b fly-island \u4ed3\u5e93\u76ee\u5f55' 'Set the fly-island repository folder in the settings.'
        Send-Model
        return
    }
    try {
        Push-Location $script:Repo
        try { $json = & node $cli --json --all 2>$null | Out-String } finally { Pop-Location }
        if ($LASTEXITCODE -ne 0) { throw "tasks.mjs exited with $LASTEXITCODE" }
        $script:Tasks = @(($json | ConvertFrom-Json) | ForEach-Object { $_ })
        $script:LoadError = $null
    } catch {
        $reason = $_.Exception.Message
        $script:LoadError = @{ 'zh-CN' = "$(Text '\u8bfb\u53d6\u5931\u8d25\uff1a')$reason"; en = "Could not read the tasks: $reason" }
        Write-FocusdLog "read failed: $reason"
    }
    Send-Model
}

function Test-Stale { ([DateTime]::UtcNow - $script:FetchedAt).TotalMinutes -ge $script:Minutes }

while ($true) {
    $message = Receive-FocusdNotification 5000
    try {
        # The collapsed bar's count stays current while the page is closed too.
        if ($null -eq $message) {
            if (Test-Stale) { Update-Tasks }
            continue
        }
        switch ($message.method) {
            'initialize' {
                Read-Settings $message.params.settings
                $script:CanShow = @($message.params.capabilities) -contains 'views'
                Update-Tasks
            }
            'settings.changed' {
                Read-Settings $message.params.settings
                Update-Tasks
            }
            'view.visible' {
                $script:Visible = [bool]$message.params.visible
                if ($script:Visible) { Update-Tasks }
            }
            'view.action' {
                $id = ([string]$message.params.itemId) -replace '^task-', ''
                if ($id -match '^[A-Z][A-Za-z0-9.]*$') {
                    # Open tasks sit in the folder of their group, the id's first letter; closed ones in 0-archive.
                    foreach ($folder in @("docs\tasks\$($id.Substring(0, 1))", "docs\tasks\0-archive\$($id.Substring(0, 1))")) {
                        $file = Join-Path $script:Repo "$folder\$id.md"
                        if (Test-Path $file) { Invoke-Item $file; break }
                    }
                }
            }
            'command' {
                if ($message.params.id -eq 'refresh') { Update-Tasks }
            }
            'shutdown' {
                exit 0
            }
        }
    } catch {
        # Keep running: one failed call should not make the island restart the plugin.
        Write-FocusdLog "error: $($_.Exception.Message)"
    }
}
