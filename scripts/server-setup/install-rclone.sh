#!/bin/bash
# Install rclone on Linux server
set -e

if command -v rclone &> /dev/null; then
    echo "rclone already installed: $(rclone version | head -n1)"
    exit 0
fi

echo "Installing rclone..."
curl https://rclone.org/install.sh | sudo bash
echo "rclone installed: $(rclone version | head -n1)"
