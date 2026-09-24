<#
.SYNOPSIS
  Motion self-check for a rendered segment or sample.
  Produces: one overview contact sheet, still-interval statistics, optional dense strips.
  It only LOCATES suspicious spans for a human/agent to look at. It is never a pass/fail verdict.

.EXAMPLE
  pwsh -NoProfile -File tools/motion-check.ps1 -Video 'renders/D01_sample.mp4' -OutDir '_work/motion-check/D01_v01' -Ranges '2.5-4.2','6.5-7.5'

.NOTES
  Requires ffmpeg and ffprobe on PATH. Runs locally; no model calls.
  Outputs: overview.png, strip_NN_<a>-<b>.png, summary.txt, summary.json and _filters\ in -OutDir.
  Same-name outputs in -OutDir are overwritten; nothing is deleted. Use a fresh -OutDir per version.
#>
param(
  [Parameter(Mandatory = $true)][string]$Video,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string[]]$Ranges = @(),
  [int]$Cells = 48,
  [double]$StillMin = 0.75,
  [string]$Noise = '-55dB',
  [double]$FlagSeconds = 2.0,
  [int]$StripFps = 10,
  [int]$StripMaxCells = 50
)

$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture
function F([double]$x, [string]$fmt = '0.000') { $x.ToString($fmt, $inv) }

foreach ($tool in 'ffmpeg', 'ffprobe') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool not found on PATH" }
}
if (-not (Test-Path -LiteralPath $Video)) { throw "Video not found: $Video" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path -LiteralPath $OutDir).Path

$durText = (& ffprobe -v error -show_entries format=duration -of csv=p=0 -- $Video | Select-Object -First 1)
$dur = [double]::Parse($durText.Trim(), $inv)
if ($dur -le 0) { throw "Cannot read duration: $Video" }

$fontPath = 'C:/Windows/Fonts/arial.ttf'
$label = ''
if (Test-Path -LiteralPath $fontPath) {
  $label = ",drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':text='%{pts\:hms}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.7"
}

# Filter scripts are kept in <OutDir>\_filters for reproduction. The script never deletes files.
$filterDir = Join-Path $OutDir '_filters'
New-Item -ItemType Directory -Force -Path $filterDir | Out-Null

function Invoke-Sheet([string]$filter, [string]$outPng) {
  $script = Join-Path $filterDir ([IO.Path]::GetFileNameWithoutExtension($outPng) + '.txt')
  [IO.File]::WriteAllText($script, $filter, [Text.UTF8Encoding]::new($false))
  & ffmpeg -hide_banner -loglevel error -y -i $Video -filter_script:v $script -frames:v 1 $outPng
  if (-not (Test-Path -LiteralPath $outPng)) { throw "Failed to write $outPng" }
}

# 1) Overview: about $Cells evenly spaced frames, 6 columns.
$cols = 6
$rows = [int][Math]::Ceiling($Cells / $cols)
$ovFps = [Math]::Min(10.0, ($Cells - 1) / $dur)
$overview = Join-Path $OutDir 'overview.png'
Invoke-Sheet ("fps=" + (F $ovFps '0.######') + ",scale=480:270" + $label + ",tile=${cols}x${rows}:padding=4:color=black") $overview

# 2) Still intervals via freezedetect on a downscaled stream.
$log = & ffmpeg -hide_banner -nostats -i $Video -vf ("scale=480:-2,freezedetect=n=" + $Noise + ":d=" + (F $StillMin '0.###')) -map 0:v -f null - 2>&1
$stills = New-Object System.Collections.Generic.List[object]
$start = $null
foreach ($line in $log) {
  $s = "$line"
  if ($s -match 'freeze_start:\s*([\d\.]+)') { $start = [double]::Parse($Matches[1], $inv) }
  elseif ($s -match 'freeze_end:\s*([\d\.]+)' -and $null -ne $start) {
    $end = [double]::Parse($Matches[1], $inv)
    $stills.Add([pscustomobject]@{ start = $start; end = $end; seconds = $end - $start })
    $start = $null
  }
}
if ($null -ne $start) { $stills.Add([pscustomobject]@{ start = $start; end = $dur; seconds = $dur - $start }) }

$stillTotal = ($stills | Measure-Object -Property seconds -Sum).Sum
if ($null -eq $stillTotal) { $stillTotal = 0 }
$longest = ($stills | Sort-Object seconds -Descending | Select-Object -First 1)
$flagged = @($stills | Where-Object { $_.seconds -ge $FlagSeconds })

# 3) Dense strips for requested ranges, e.g. '2.5-4.2'.
$strips = New-Object System.Collections.Generic.List[object]
$n = 0
foreach ($r in $Ranges) {
  if ($r -notmatch '^\s*([\d\.]+)\s*-\s*([\d\.]+)\s*$') { Write-Warning "Skip bad range: $r"; continue }
  $a = [double]::Parse($Matches[1], $inv); $b = [double]::Parse($Matches[2], $inv)
  if ($b -le $a) { Write-Warning "Skip empty range: $r"; continue }
  $n++
  $fps = [Math]::Min([double]$StripFps, ($StripMaxCells - 1) / ($b - $a))
  $count = [int][Math]::Floor(($b - $a) * $fps) + 1
  $sr = [int][Math]::Max(1, [Math]::Ceiling($count / 5))
  $png = Join-Path $OutDir ('strip_{0:D2}_{1}-{2}.png' -f $n, (F $a '0.###'), (F $b '0.###'))
  Invoke-Sheet ("trim=start=" + (F $a) + ":end=" + (F $b) + ",fps=" + (F $fps '0.######') + ",scale=640:360" + $label + ",tile=5x${sr}:padding=4:color=black") $png
  $strips.Add([pscustomobject]@{ range = $r.Trim(); fps = [Math]::Round($fps, 3); file = $png })
}

# 4) Summary.
$pct = if ($dur -gt 0) { 100.0 * $stillTotal / $dur } else { 0 }
$lines = @()
$lines += "video: $Video"
$lines += ("duration_s: " + (F $dur) + "   overview_fps: " + (F $ovFps '0.###') + "   still_rule: >= " + (F $StillMin '0.##') + "s at " + $Noise)
$lines += ("still_total_s: " + (F $stillTotal '0.00') + "   still_percent: " + (F $pct '0.0') + "%   intervals: " + $stills.Count)
if ($longest) { $lines += ("longest_still: " + (F $longest.seconds '0.00') + "s at " + (F $longest.start '0.00') + "-" + (F $longest.end '0.00')) }
$lines += ("flagged (>= " + (F $FlagSeconds '0.#') + "s, confirm each has a reading or expressive purpose):")
if ($flagged.Count -eq 0) { $lines += "  none" } else { foreach ($f in $flagged) { $lines += ("  " + (F $f.start '0.00') + "-" + (F $f.end '0.00') + "  (" + (F $f.seconds '0.00') + "s)") } }
$lines += "all still intervals:"
foreach ($st in $stills) { $lines += ("  " + (F $st.start '0.00') + "-" + (F $st.end '0.00') + "  (" + (F $st.seconds '0.00') + "s)") }
$lines += "overview: $overview"
foreach ($s in $strips) { $lines += ("strip " + $s.range + " @" + $s.fps + "fps: " + $s.file) }
$lines += "note: locating aid only. Still spans can be valid reading time; motion share never proves quality."

[IO.File]::WriteAllLines((Join-Path $OutDir 'summary.txt'), $lines, [Text.UTF8Encoding]::new($false))
[pscustomobject]@{
  video = $Video; duration_s = [Math]::Round($dur, 3); still_total_s = [Math]::Round($stillTotal, 3)
  still_percent = [Math]::Round($pct, 1); longest_still = $longest; flagged = $flagged; stills = $stills
  overview = $overview; strips = $strips; still_rule = @{ min_s = $StillMin; noise = $Noise }
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutDir 'summary.json') -Encoding utf8
$lines | ForEach-Object { Write-Output $_ }
