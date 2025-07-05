#!/bin/bash
mkdir -p /opt/render/project/src/data
touch /opt/render/project/src/data/users.db
chmod 600 /opt/render/project/src/data/users.db
gunicorn --bind 0.0.0.0:$PORT app:app