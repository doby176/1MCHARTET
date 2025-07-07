#!/bin/bash

# Define data directory (non-persistent storage from GitHub repository)
DATA_DIR="/opt/render/project/src/data"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Restore users.db from S3 if available
AWS_S3_BUCKET="onemchart-backup"
if aws s3 cp "s3://$AWS_S3_BUCKET/users.db_latest" "$DATA_DIR/users.db"; then
    echo "Successfully restored users.db from S3"
else
    echo "No users.db found in S3, creating new one"
    touch "$DATA_DIR/users.db"
fi
chmod 600 "$DATA_DIR/users.db"

# Debug: List contents of data directory
echo "Contents of $DATA_DIR:"
ls -la "$DATA_DIR"
echo "Contents of $DATA_DIR/db:"
ls -la "$DATA_DIR/db"

# Start the application
gunicorn --bind 0.0.0.0:$PORT app:app