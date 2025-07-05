# C:\Users\ASUS\1mchartet\1mland\start.sh
#!/bin/bash
mkdir -p /opt/render/project/src/data
touch /opt/render/project/src/data/users.db
chmod 600 /opt/render/project/src/data/users.db
python app.py