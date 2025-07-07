#!/bin/bash
set -e
echo "Starting backup at $(date -u)"

# Set AWS credentials and region
export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION=us-west-2

# Ensure data directory exists
mkdir -p data

# Check if users.db_latest exists in S3
echo "Copying users.db from S3"
if aws s3api head-object --bucket onemchart-backup --key users.db_latest >/dev/null 2>&1; then
    aws s3 cp s3://onemchart-backup/users.db_latest data/users.db
    echo "users.db size: $(stat -c%s data/users.db) bytes"
else
    echo "No users.db_latest in S3"
    if [ ! -f data/users.db ]; then
        echo "No local users.db found, skipping backup"
        exit 0
    fi
fi

# Backup to timestamped file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
echo "Backing up users.db to s3://onemchart-backup/users.db_$TIMESTAMP"
aws s3 cp data/users.db s3://onemchart-backup/users.db_$TIMESTAMP

# Update latest backup
echo "Backing up users.db to s3://onemchart-backup/users.db_latest"
aws s3 cp data/users.db s3://onemchart-backup/users.db_latest

echo "Backup complete at $(date -u)"