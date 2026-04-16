#!/bin/bash
rm -f /tmp/sibyl-ipc.sock
cd /home/kaki/Github/Sibyl/python
nohup python -u -m sibyl_ipc_server.__main_optimized__ > /tmp/sibyl-server.log 2>&1 &
disown
echo "Server PID: $!"
sleep 1