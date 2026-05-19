# YesBoss Auto-Sync Script
# Automatically pulls latest code every 30 seconds
# Run this while working on the project

param(
    [int]$IntervalSeconds = 30,
    [switch]$Silent
)

$ErrorActionPreference = "Continue"
$projectPath = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  YesBoss Auto-Sync (Git Pull Script)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pulling every $IntervalSeconds seconds..."
Write-Host "Press Ctrl+C to stop"
Write-Host ""
Write-Host "Starting sync..." -ForegroundColor Yellow

Set-Location $projectPath

while ($true) {
    try {
        $beforeHash = git rev-parse HEAD 2>$null
        
        git fetch origin
        
        $behind = git rev-list HEAD..origin/main --count 2>$null
        
        if ($behind -and [int]$behind -gt 0) {
            Write-Host ""
            Write-Host "Found $behind new commit(s)!" -ForegroundColor Green
            
            $commits = git log HEAD..origin/main --oneline -3 2>$null
            if ($commits) {
                Write-Host "Changes:" -ForegroundColor Cyan
                $commits | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
            }
            
            Write-Host "Pulling..." -ForegroundColor Yellow
            $pullResult = git pull origin main 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Updated successfully!" -ForegroundColor Green
                
                $afterHash = git rev-parse HEAD 2>$null
                if ($beforeHash -ne $afterHash) {
                    Write-Host "New HEAD: $($afterHash.Substring(0,7))" -ForegroundColor Gray
                }
            } else {
                Write-Host "Pull failed" -ForegroundColor Red
            }
        } else {
            Write-Host "No changes (up to date)" -ForegroundColor DarkGray
        }
        
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
    }
    
    Start-Sleep -Seconds $IntervalSeconds
}