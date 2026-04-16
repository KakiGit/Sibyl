#!/bin/bash
cd /home/kaki/Github/Sibyl/python
rm -f /tmp/sibyl-ipc.sock
exec python -m sibyl_ipc_server