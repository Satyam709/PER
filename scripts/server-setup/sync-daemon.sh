#!/bin/bash
# Background sync daemon with bidirectional sync
set -e

REMOTE_PATH="$1"
LOCAL_PATH="$2"
INTERVAL="${3:-300}"  # Default 5 minutes

while true; do
    echo "[$(date)] Starting sync..."
    
    # Sync local changes to remote
    rclone sync "$LOCAL_PATH" "$REMOTE_PATH" -v --exclude ".git/**"
    
    # Sync remote changes to local
    rclone sync "$REMOTE_PATH" "$LOCAL_PATH" -v --exclude ".git/**"
    
    echo "[$(date)] Sync complete. Sleeping for ${INTERVAL}s..."
    sleep "$INTERVAL"
done
