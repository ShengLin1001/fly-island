# Plugin (API version 2): shows the playing song on the island when its
# command runs, and, when the "notifyOnChange" setting is on (off by default: the
# island's music page and collapsed bar already show the song), when the track
# changes. media:read is a sensitive permission, so the first call that uses it
# waits until the user answers on the island; a refusal comes back as an error
# and is logged. The message names the song and artist beside the player's icon,
# inline (notifyStyle), with the island's previous / play-pause / next beside it
# (notifyControls: the island runs them, so no media:control is needed); older
# islands show the same text with the plugin icon and no buttons.
. "$PSScriptRoot\lib\focusd.ps1"

function Show-Playing($now) {
    if ($null -eq $now -or -not $now.title) {
        Write-FocusdLog 'nothing is playing'
        return
    }
    $title = [string]$now.title
    $body = if ($now.artist) { [string]$now.artist } else { '' }
    $answer = Invoke-FocusdMethod 'island.notify' @{ title = $title; body = $body; durationMs = 6000; icon = 'media'; layout = 'inline'; controls = 'media' }
    if ($answer.muted) { Write-FocusdLog "now playing: $title (messages are muted)" }
}

$script:NotifyOnChange = $false
$script:Watching = $false

function Watch-Media {
    if ($script:Watching) { return }
    try {
        [void](Invoke-FocusdMethod 'events.subscribe' @{ events = @('media.changed') })
        $script:Watching = $true
        Write-FocusdLog 'watching the player'
    } catch {
        Write-FocusdLog "not allowed to see the player: $($_.Exception.Message)"
    }
}

while ($true) {
    $message = Receive-FocusdNotification 60000
    if ($null -eq $message) {
        continue
    }
    try {
        switch ($message.method) {
            'initialize' {
                if (@($message.params.capabilities) -notcontains 'events') {
                    Write-FocusdLog 'this FocuSD Island is too old for this plugin (needs plugin API version 2)'
                } else {
                    $script:NotifyOnChange = [bool]$message.params.settings.notifyOnChange
                    # Without the setting there is nothing to watch, and no permission to ask for.
                    if ($script:NotifyOnChange) { Watch-Media }
                }
            }
            'settings.changed' {
                $script:NotifyOnChange = [bool]$message.params.settings.notifyOnChange
                if ($script:NotifyOnChange) { Watch-Media }
            }
            'event' {
                if ($script:NotifyOnChange -and $message.params.name -eq 'media.changed' -and $message.params.payload.status -eq 'playing') {
                    Show-Playing $message.params.payload
                }
            }
            'command' {
                if ($message.params.id -eq 'show') {
                    Show-Playing (Invoke-FocusdMethod 'media.nowPlaying')
                }
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
