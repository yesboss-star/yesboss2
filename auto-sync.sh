#!/bin/bash

# YesBoss Auto-Sync Script
# Automatically pulls latest code every 30 seconds
# Run this while working on the project

INTERVAL=30

echo "========================================"
echo "  YesBoss Auto-Sync (Git Pull Script)"
echo "========================================"
echo ""
echo "Pulling every $INTERVAL seconds..."
echo "Press Ctrl+C to stop"
echo ""
echo "Starting sync..."

# Change to script directory
cd "$(dirname "$0")"

while true; do
    # Fetch latest changes
    git fetch origin 2>/dev/null
    
    # Check if there are changes to pull
    BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null)
    
    if [ -n "$BEHIND" ] && [ "$BEHIND" -gt 0 ]; then
        echo ""
        echo "[$(date +%H:%M:%S)] Found $BEHIND new commit(s)!"
        
        # Show what changed
        echo "Changes:"
        git log HEAD..origin/main --oneline -3 | while read line; do
            echo "  - $line"
        done
        
        # Pull the changes
        echo "Pulling..."
        git pull origin main
        
        if [ $? -eq 0 ]; then
            echo "✓ Updated successfully!"
            echo "  New HEAD: $(git rev-parse --short HEAD)"
        else
            echo "⚠ Pull failed"
        fi
    else
        echo "[$(date +%H:%M:%S)] No changes (up to date)"
    fi
    
    sleep $INTERVAL
done