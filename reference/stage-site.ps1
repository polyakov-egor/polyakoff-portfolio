<#
.SYNOPSIS
Prepare the existing Sites checkout's dist without changing its hosting identity.
.DESCRIPTION
Copies buildless runtime files and assets only. Retired animation modules remain
in the local source/history but are removed by exact path from dist. Original
photo exports remain as unloaded error fallbacks for the responsive WebPs: they
are not fetched unless a WebP cannot load/decode. No tests, reference material,
local server, documentation, Git metadata or source manifests are deployed.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Destination,
    [string]$NodeExecutable = 'node'
)

$ErrorActionPreference = 'Stop'
$stageSourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stageDestinationRoot = [IO.Path]::GetFullPath($Destination)
if (-not (Test-Path -LiteralPath $stageDestinationRoot -PathType Container)) {
    throw "Destination must be an existing opened Sites checkout: $stageDestinationRoot"
}
if ($stageDestinationRoot.TrimEnd([char]92, [char]47) -eq $stageSourceRoot.TrimEnd([char]92, [char]47)) {
    throw 'Source and destination must be different directories.'
}
$stageManifestPath = Join-Path $stageDestinationRoot '.openai/hosting.json'
$stageManifest = Get-Content -LiteralPath $stageManifestPath -Raw | ConvertFrom-Json
if ($stageManifest.project_id -ne 'appgprj_6ae1f25966b0819193fe6d3b5b8ac7a7' -or $stageManifest.static.directory -ne 'dist') {
    throw 'The destination manifest must belong to the existing portfolio Site and declare dist.'
}
$stageManifestHash = (Get-FileHash -LiteralPath $stageManifestPath -Algorithm SHA256).Hash
$stageDistRoot = [IO.Path]::GetFullPath((Join-Path $stageDestinationRoot 'dist'))
$stageDestinationPrefix = $stageDestinationRoot.TrimEnd([char]92, [char]47) + [IO.Path]::DirectorySeparatorChar
if (-not $stageDistRoot.StartsWith($stageDestinationPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Resolved publication directory is outside the destination checkout.'
}
if (Test-Path -LiteralPath $stageDistRoot) {
    if ((Get-Item -LiteralPath $stageDistRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Refusing to stage through a reparse-point dist directory.'
    }
}
$stageRetired = @(
    'background-lines.js', 'background-line-warp.js', 'background-lines.css',
    'inspiration-glass.js', 'assets/images/line-masks.js'
)
function Confirm-StagedTarget([string]$Target) {
    $stageAbsoluteTarget = [IO.Path]::GetFullPath($Target)
    $stageDistPrefix = $stageDistRoot.TrimEnd([char]92, [char]47) + [IO.Path]::DirectorySeparatorChar
    if (-not $stageAbsoluteTarget.StartsWith($stageDistPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Target escapes publication directory: $stageAbsoluteTarget"
    }
    # Lexical containment alone is insufficient if an existing parent is a
    # symlink/junction. Reject reparse points on the complete destination path.
    $stageAncestor = $stageAbsoluteTarget
    while ($stageAncestor.Length -ge $stageDistRoot.Length) {
        if ((Test-Path -LiteralPath $stageAncestor) -and
            ((Get-Item -LiteralPath $stageAncestor).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Publication target passes through a reparse point: $stageAncestor"
        }
        if ($stageAncestor -eq $stageDistRoot) { break }
        $stageAncestor = Split-Path -Parent $stageAncestor
    }
}
$stageChecker = Join-Path $stageSourceRoot 'reference/production-source-check.cjs'
& $NodeExecutable $stageChecker $stageSourceRoot
if ($LASTEXITCODE -ne 0) { throw 'Source validation failed; destination was not modified.' }

New-Item -ItemType Directory -Path $stageDistRoot -Force | Out-Null
$stageRuntime = @(Get-ChildItem -LiteralPath $stageSourceRoot -File | Where-Object {
    $_.Extension -in '.html', '.css', '.js' -and $_.Name -notin $stageRetired
})
foreach ($stageFile in $stageRuntime) {
    if ($stageFile.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Source runtime file is a reparse point.' }
    $stageTarget = Join-Path $stageDistRoot $stageFile.Name
    Confirm-StagedTarget $stageTarget
    Copy-Item -LiteralPath $stageFile.FullName -Destination $stageTarget -Force
}
$stageAssetsRoot = Join-Path $stageSourceRoot 'assets'
$stageAssetCount = 0
foreach ($stageFile in Get-ChildItem -LiteralPath $stageAssetsRoot -File -Recurse) {
    if ($stageFile.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Source asset is a reparse point.' }
    $stageRelative = [IO.Path]::GetRelativePath($stageSourceRoot, $stageFile.FullName).Replace([char]92, [char]47)
    if ($stageRelative -in $stageRetired) { continue }
    $stageTarget = [IO.Path]::GetFullPath((Join-Path $stageDistRoot $stageRelative))
    Confirm-StagedTarget $stageTarget
    $stageParent = Split-Path -Parent $stageTarget
    New-Item -ItemType Directory -Path $stageParent -Force | Out-Null
    Copy-Item -LiteralPath $stageFile.FullName -Destination $stageTarget -Force
    $stageAssetCount++
}
# Remove only these verified legacy files. No recursive deletion or shell hops.
foreach ($stageRelative in $stageRetired) {
    $stageTarget = [IO.Path]::GetFullPath((Join-Path $stageDistRoot $stageRelative))
    Confirm-StagedTarget $stageTarget
    if (Test-Path -LiteralPath $stageTarget) {
        if (-not (Test-Path -LiteralPath $stageTarget -PathType Leaf)) { throw "Retired target is not a file: $stageTarget" }
        if ((Get-Item -LiteralPath $stageTarget).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Refusing to remove a retired reparse-point target: $stageTarget"
        }
        Remove-Item -LiteralPath $stageTarget -Force
    }
}
& $NodeExecutable $stageChecker $stageDistRoot --staged
if ($LASTEXITCODE -ne 0) { throw 'Staged static tree failed validation.' }
if ((Get-FileHash -LiteralPath $stageManifestPath -Algorithm SHA256).Hash -ne $stageManifestHash) {
    throw 'The hosting manifest changed unexpectedly.'
}
[pscustomobject]@{
    Source = $stageSourceRoot
    Destination = $stageDistRoot
    RuntimeFiles = $stageRuntime.Count
    AssetFiles = $stageAssetCount
    HostingManifestPreserved = $true
}
