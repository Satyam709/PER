#!/bin/bash
# Setup bidirectional sync for project directory
set -e

REMOTE_PATH="$1"  # e.g., "drive:/projects/proj1"
LOCAL_PATH="$2"   # e.g., "/content/project"

# Create local directory
mkdir -p "$LOCAL_PATH"

# Initial sync from remote to local
echo "Syncing from remote to local..."
rclone sync "$REMOTE_PATH" "$LOCAL_PATH" -v --exclude ".git/**"

echo "Sync complete!"
