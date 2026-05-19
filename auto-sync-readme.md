# Git Auto-Sync Script for YesBoss

## Purpose
Automatically pulls latest code from GitHub every 30 seconds.
Run this script while working on the project to stay updated.

## Setup Instructions

### Step 1: Navigate to Project Folder
```powershell
cd "C:\VSLLP\krisha\2\yesboss2"
```

### Step 2: Run the Script
```powershell
.\auto-sync.ps1
```

Or run in background:
```powershell
Start-Process powershell -ArgumentList "-File", ".\auto-sync.ps1" -WindowStyle Hidden
```

### Step 3: To Stop
Press `Ctrl+C` in the terminal running the script.

---

## What It Does
1. Checks for new changes on GitHub (git fetch)
2. Compares local vs remote
3. If changes exist → auto pulls
4. Shows notification when updated
5. Repeats every 30 seconds

## Notes
- Only pulls, never pushes
- Won't overwrite uncommitted local changes
- If conflicts exist, it will notify you
- Keep the script running while coding

## For Mac/Linux
Use the Bash version: `auto-sync.sh`

## Author
YesBoss Dev Team