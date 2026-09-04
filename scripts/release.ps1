#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch",
    [string]$Version,
    [string]$Remote = "origin",
    [switch]$NoPush,
    [switch]$NoRelease
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$PackagePath = Join-Path $RepoRoot "package.json"
$CardPath = Join-Path $RepoRoot "dist/opentdb-card.js"
foreach ($path in @($PackagePath, $CardPath)) {
    if (-not (Test-Path $path)) { throw "Required file not found: $path" }
}

$package = Get-Content $PackagePath -Raw | ConvertFrom-Json
$current = $package.version
if ($Version) {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must be X.Y.Z" }
    $new = $Version
} else {
    $parts = $current.Split("."); [int]$major = $parts[0]; [int]$minor = $parts[1]; [int]$patch = $parts[2]
    switch ($Bump) { "major" { $major++; $minor = 0; $patch = 0 } "minor" { $minor++; $patch = 0 } "patch" { $patch++ } }
    $new = "$major.$minor.$patch"
}
if ($new -eq $current) { throw "New version matches current version" }
$dirty = git -C $RepoRoot status --porcelain
if ($dirty) { throw "Working tree is not clean:`n$dirty" }
$package.version = $new
$package | ConvertTo-Json | Set-Content $PackagePath
npm --prefix $RepoRoot run build
git -C $RepoRoot add package.json dist/opentdb-card.js
$tag = "v$new"
git -C $RepoRoot commit -m "Release $tag"
git -C $RepoRoot tag $tag
if ($NoPush) { Write-Host "Created $tag locally."; return }
$branch = git -C $RepoRoot rev-parse --abbrev-ref HEAD
git -C $RepoRoot push $Remote $branch
git -C $RepoRoot push $Remote $tag
if ($NoRelease) { return }
$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) { Write-Warning "gh not found; tag pushed without a GitHub release."; return }
gh release create $tag --repo andrewbackway/hacs-opentdb-card --title $tag --generate-notes
