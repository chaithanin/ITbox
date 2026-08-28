<#
  TECHCORE — Windows Endpoint Agent
  =================================
  Collects Windows Defender protection status (EDR posture) and local resource
  metrics (CPU / RAM / disk / uptime) from THIS machine and pushes them to the
  TECHCORE ingest APIs. Real data only — nothing is fabricated.

  No external modules required (uses built-in CIM + Defender cmdlets).

  Setup
  -----
  1. In TECHCORE: Settings -> Integrations -> generate an API key (shown once).
  2. Set the variables below (or the matching environment variables).
  3. Test once from PowerShell:
         powershell -ExecutionPolicy Bypass -File techcore_endpoint_agent.ps1
  4. Schedule every 15 min via Task Scheduler (see bottom of this file), pushed
     from every endpoint you want visibility on.

  Environment variables (override the defaults below)
  ---------------------------------------------------
    TECHCORE_BASE   https://<your-domain>       (base URL, NO trailing path)
    TECHCORE_KEY    the ingest API key (tck_...)
#>

$TechcoreBase = if ($env:TECHCORE_BASE) { $env:TECHCORE_BASE } else { "https://itbox-ppjbzqdu3q-as.a.run.app" }
$TechcoreKey  = if ($env:TECHCORE_KEY)  { $env:TECHCORE_KEY }  else { "" }

if ([string]::IsNullOrWhiteSpace($TechcoreKey)) {
  Write-Error "TECHCORE_KEY is required (generate one in Settings -> Integrations)."
  exit 1
}

$Hostname = $env:COMPUTERNAME
$Headers  = @{ Authorization = "Bearer $TechcoreKey"; "Content-Type" = "application/json" }

# ---------------- EDR / Defender posture ----------------
$edrHost = @{ hostname = $Hostname }
try {
  $mp = Get-MpComputerStatus -ErrorAction Stop
  $rtp        = [bool]$mp.RealTimeProtectionEnabled
  $avEnabled  = [bool]$mp.AntivirusEnabled
  $sigAgeDays = [int]$mp.AntivirusSignatureAge   # days since last signature update
  $protected  = $rtp -and $avEnabled -and ($sigAgeDays -le 7)
  $edrHost.protectionStatus = if ($protected) { "PROTECTED" } else { "AT_RISK" }
  $edrHost.agentVersion     = "$($mp.AMProductVersion)"
  if ($mp.QuickScanEndTime)  { $edrHost.lastScan = $mp.QuickScanEndTime.ToUniversalTime().ToString("o") }
  elseif ($mp.FullScanEndTime) { $edrHost.lastScan = $mp.FullScanEndTime.ToUniversalTime().ToString("o") }
} catch {
  # Defender not present / third-party AV — report UNKNOWN rather than guessing.
  $edrHost.protectionStatus = "UNKNOWN"
}
try {
  $threats = @(Get-MpThreatDetection -ErrorAction SilentlyContinue)
  $edrHost.threatsFound = $threats.Count
} catch { $edrHost.threatsFound = 0 }
try { $edrHost.osVersion = (Get-CimInstance Win32_OperatingSystem).Caption } catch {}

# ---------------- Monitoring metrics ----------------
$monHost = @{ hostname = $Hostname }
try {
  $os   = Get-CimInstance Win32_OperatingSystem
  $totalKb = [double]$os.TotalVisibleMemorySize
  $freeKb  = [double]$os.FreePhysicalMemory
  if ($totalKb -gt 0) { $monHost.mem = [int](($totalKb - $freeKb) / $totalKb * 100) }
  $monHost.uptime = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds
} catch {}
try {
  $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
  if ($null -ne $cpu) { $monHost.cpu = [int]$cpu }
} catch {}
try {
  $sys = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  if ($sys -and $sys.Size -gt 0) { $monHost.disk = [int](($sys.Size - $sys.FreeSpace) / $sys.Size * 100) }
} catch {}

# ---------------- Push ----------------
function Send-Ingest($path, $bodyObj) {
  $json = ($bodyObj | ConvertTo-Json -Depth 6 -Compress)
  try {
    $res = Invoke-RestMethod -Uri "$TechcoreBase$path" -Method Post -Headers $Headers -Body $json -TimeoutSec 30
    Write-Host "POST $path -> ok=$($res.ok) failed=$($res.failed)"
  } catch {
    Write-Warning "POST $path failed: $($_.Exception.Message)"
  }
}

Send-Ingest "/api/edr/ingest"        @{ hosts = @($edrHost) }
Send-Ingest "/api/monitoring/ingest" @{ hosts = @($monHost) }

<#
  Schedule every 15 minutes (run once, elevated):

    $ps = "powershell -NoProfile -ExecutionPolicy Bypass -File C:\techcore\techcore_endpoint_agent.ps1"
    schtasks /Create /TN "TECHCORE Endpoint Agent" /TR $ps /SC MINUTE /MO 15 /RU SYSTEM /F

  (Set TECHCORE_KEY as a SYSTEM environment variable, or hard-code it above.)
#>
