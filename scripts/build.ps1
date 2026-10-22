# 本地构建（Windows）
#
#   .\scripts\build.ps1
#   .\scripts\build.ps1 -Version 0.1.0
#
# 产物在 dist/ 下。

[CmdletBinding()]
param(
    [string]$Version = "0.1.0",
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $RepoRoot "dist" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Step($msg) { Write-Host "  > $msg" -ForegroundColor Cyan }

Push-Location $RepoRoot
try {
    Write-Host ""
    Write-Host "  SectionLab 构建  v$Version" -ForegroundColor White
    Write-Host "  -----------------------------"

    if (Get-Command node -ErrorAction SilentlyContinue) {
        Step "跑几何内核测试"
        & node test/geometry.test.js
        if ($LASTEXITCODE -ne 0) { throw "测试没通过，不继续构建" }
    } else {
        Write-Host "  (没装 node，跳过测试)" -ForegroundColor Yellow
    }

    Step "编译 windows/amd64"
    $env:CGO_ENABLED = "0"
    $env:GOOS = "windows"
    $env:GOARCH = "amd64"
    $out = Join-Path $OutDir "SectionLab.exe"
    & go build -trimpath -ldflags "-s -w -X sectionlab/web.Version=$Version" -o $out ./cmd/sectionlab
    if ($LASTEXITCODE -ne 0) { throw "go build 失败" }

    $size = [math]::Round((Get-Item $out).Length / 1MB, 2)
    Write-Host ""
    Write-Host "  OK  $out  ($size MB)" -ForegroundColor Green
    Write-Host ""
} finally {
    Pop-Location
}
