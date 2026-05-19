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

# Change to project directory
Set-Location $projectPath

while ($true) {
    try {
        $beforeHash = git rev-parse HEAD 2>$null
        
        # Fetch latest changes from remote
        git fetch origin
        
        # Check if there are changes to pull
        $behind = git rev-list HEAD..origin/main --count 2>$null
        
        if ($behind -and [int]$behind -gt 0) {
            Write-Host ""
            Write-Host "["$(Get-Date -Format "HH:mm:ss")"] Found $behind new commit(s)!" -ForegroundColor Green
            
            # Show what changed
            $commits = git log HEAD..origin/main --oneline -3 2>$null
            if ($commits) {
                Write-Host "Changes:" -ForegroundColor Cyan
                $commits | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
            }
            
            # Pull the changes
            Write-Host "Pulling..." -ForegroundColor Yellow
            $pullResult = git pull origin main 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✓ Updated successfully!" -ForegroundColor Green
                
                # Show notification if possible
                if (-not $Silent) {
                    try {
                        # Windows toast notification (if BurntToast module exists)
                        Write-Host "  Code is now up to date!" -ForegroundColor Green
                    } catch {
                        # Silently ignore notification errors
                    }
                }
                
                $afterHash = git rev-parse HEAD 2>$null
                if ($beforeHash -ne $afterHash) {
                    Write-Host "  New HEAD: $($afterHash.Substring(0,7))" -ForegroundColor Gray
                }
            } else {
                Write-Host "⚠ Pull failed: $pullResult" -ForegroundColor Red
            }
        } else {
            Write-Host "["$(Get-Date -Format "HH:mm:ss")"] No changes (up to date)" -ForegroundColor DarkGray
        }
        
    } catch {
        Write-Host "["$(Get-Date -Format "HH:mm:ss")"] Error: $_" -ForegroundColor Red
    }
    
    # Wait for next interval
    Start-Sleep -Seconds $IntervalSeconds
}