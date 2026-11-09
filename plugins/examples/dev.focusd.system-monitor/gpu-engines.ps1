# The GPU from Windows' own counters (any vendor, no administrator rights): how busy each engine
# is (3D, copy, video decode and encode), the overall load Task Manager shows, the dedicated
# memory in use and the adapter's name. One read takes 0.3-1 s, too long for the page's
# one-second loop, so a second runspace reads every 2 s while the page wants it (Read-GpuEngines
# asked within the last 5 s) and sleeps otherwise. Dot-sourced by main.ps1; stays ASCII.

$script:GpuSync = [hashtable]::Synchronized(@{ WantedAt = [datetime]::MinValue; Result = $null })
$script:GpuReader = $null

$GpuEngineReader = {
    $name = $null
    try {
        $card = @(Get-CimInstance Win32_VideoController -Property Name, PNPDeviceID -ErrorAction Stop | Where-Object { $_.PNPDeviceID -like 'PCI\*' })[0]
        if ($null -ne $card) { $name = [string]$card.Name }
    } catch { }
    while ($true) {
        if (((Get-Date) - $sync.WantedAt).TotalSeconds -gt 5) { Start-Sleep -Milliseconds 500; continue }
        $started = Get-Date
        try {
            # Per engine (adapter + engine index): its type and the processes' shares added up.
            $engines = @{}
            foreach ($row in Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Property Name, UtilizationPercentage -ErrorAction Stop) {
                if ($row.Name -notmatch 'luid_(0x[0-9A-Fa-f]+_0x[0-9A-Fa-f]+)_phys_(\d+)_eng_(\d+)_engtype_(.*)$') { continue }
                $key = "$($Matches[1])_$($Matches[2])|$($Matches[3])"
                if (-not $engines.ContainsKey($key)) { $engines[$key] = @{ adapter = "luid_$($Matches[1])_phys_$($Matches[2])"; type = $Matches[4]; value = 0.0 } }
                $engines[$key].value += [double]$row.UtilizationPercentage
            }
            # The adapter that matters is the one with the most dedicated memory in use (virtual display adapters have none).
            $memory = @{}
            foreach ($row in Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -Property Name, DedicatedUsage -ErrorAction SilentlyContinue) {
                $memory[[string]$row.Name] = [double]$row.DedicatedUsage
            }
            $adapter = ($memory.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
            if (-not $adapter) { $adapter = (@($engines.Values)[0]).adapter }
            # Each type is as busy as its busiest engine; the GPU as busy as its busiest type.
            $types = @{}
            foreach ($engine in $engines.Values) {
                if ($engine.adapter -ne $adapter) { continue }
                $types[$engine.type] = [math]::Max([double]$types[$engine.type], [math]::Min(100.0, $engine.value))
            }
            $of = { param($prefix) $best = 0.0; foreach ($type in $types.Keys) { if ($type -like "$prefix*") { $best = [math]::Max($best, $types[$type]) } }; [math]::Round($best) }
            $usage = 0.0
            foreach ($value in $types.Values) { $usage = [math]::Max($usage, $value) }
            $sync.Result = @{
                At = Get-Date
                name = $name
                usage = [math]::Round($usage)
                memoryUsed = if ($memory.ContainsKey($adapter)) { [math]::Round($memory[$adapter] / 1MB) } else { $null }
                engines = @(
                    @{ id = '3d'; value = & $of '3D' },
                    @{ id = 'copy'; value = & $of 'Copy' },
                    @{ id = 'decode'; value = & $of 'VideoDecode' },
                    @{ id = 'encode'; value = & $of 'VideoEncode' }
                )
            }
        } catch {
            $sync.Result = $null
        }
        $rest = 2000 - ((Get-Date) - $started).TotalMilliseconds
        if ($rest -gt 0) { Start-Sleep -Milliseconds ([int]$rest) }
    }
}

# The latest GPU reading, or $null when there is none (yet, or this Windows has no GPU counters).
# -Want keeps the reader going; background recording only takes a reading the page asked for.
function Read-GpuEngines([switch]$Want) {
    if ($Want) {
        $script:GpuSync.WantedAt = Get-Date
        if ($null -eq $script:GpuReader) {
            try {
                $runspace = [runspacefactory]::CreateRunspace()
                $runspace.Open()
                $runspace.SessionStateProxy.SetVariable('sync', $script:GpuSync)
                $shell = [powershell]::Create()
                $shell.Runspace = $runspace
                [void]$shell.AddScript($GpuEngineReader)
                $script:GpuReader = @{ Shell = $shell; Handle = $shell.BeginInvoke() }
            } catch {
                Write-FocusdLog "GPU counters unavailable: $($_.Exception.Message)"
                $script:GpuReader = @{}
            }
        }
    }
    $result = $script:GpuSync.Result
    if ($null -ne $result -and ((Get-Date) - $result.At).TotalSeconds -lt 6) { return $result }
    $null
}
