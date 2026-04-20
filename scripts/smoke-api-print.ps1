param(
    [string]$BaseUrl = 'http://127.0.0.1:6806',
    [string]$Token,
    [string]$Workspace,
    [switch]$SkipTypecheck,
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string[]]$Command
    )

    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor DarkGray
    Write-Host $Title -ForegroundColor Cyan
    Write-Host ('$ ' + ($Command -join ' ')) -ForegroundColor DarkGray

    $exe = $Command[0]
    $args = if ($Command.Length -gt 1) { $Command[1..($Command.Length - 1)] } else { @() }
    & $exe @args
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $Title (exit code: $LASTEXITCODE)"
    }
}

function New-TargetArgs {
    $targetArgs = @()
    if ($Workspace) {
        $targetArgs += '--workspace'
        $targetArgs += $Workspace
    }
    else {
        $targetArgs += '--baseUrl'
        $targetArgs += $BaseUrl
        if ($Token) {
            $targetArgs += '--token'
            $targetArgs += $Token
        }
    }
    return $targetArgs
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$targetArgs = New-TargetArgs
$cli = @('node', 'dist/cli.mjs')
$query = "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 3"

Write-Host "Repo root: $repoRoot" -ForegroundColor Green
if ($Workspace) {
    Write-Host "Target workspace: $Workspace" -ForegroundColor Green
}
else {
    Write-Host "Target baseUrl: $BaseUrl" -ForegroundColor Green
}

if (-not $SkipTypecheck) {
    Invoke-Step 'Typecheck' @('pnpm', 'typecheck')
}

if (-not $SkipBuild) {
    Invoke-Step 'Build' @('pnpm', 'build')
}

Invoke-Step 'Help: query.sql' ($cli + @('api', 'query.sql', '--help'))
Invoke-Step 'Describe: system.version' ($cli + @('api', 'describe', 'system.version'))
Invoke-Step 'Compact: system.version' ($cli + @('api', 'system.version') + $targetArgs)
Invoke-Step 'JSON: system.version' ($cli + @('api', 'system.version', '--print', 'json') + $targetArgs)
Invoke-Step 'Compact: query.sql' ($cli + @('api', 'query.sql', $query) + $targetArgs)
Invoke-Step 'JSON: query.sql' ($cli + @('api', 'query.sql', $query, '--print', 'json') + $targetArgs)
Invoke-Step 'Compact: system.currentTime' ($cli + @('api', 'system.currentTime', '--yes') + $targetArgs)
Invoke-Step 'JSON: system.currentTime' ($cli + @('api', 'system.currentTime', '--print', 'json', '--yes') + $targetArgs)

Write-Host "" 
Write-Host 'Smoke run completed.' -ForegroundColor Green
