$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$rootPackage = Get-Content (Join-Path $repoRoot "package.json") | ConvertFrom-Json
$version = $rootPackage.version
$releaseDir = Join-Path $repoRoot "release"
$extensionDist = Join-Path $repoRoot "apps\extension\dist"
$zipPath = Join-Path $releaseDir ("browser-code-extension-" + $version + ".zip")

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $extensionDist "*") -DestinationPath $zipPath
Write-Output ("Created " + $zipPath)
