#!/bin/bash
# Optimized Sibyl IPC Server startup script
# Uses smaller model (qwen2.5:0.5b) for low-resource hardware

cd /home/kaki/Github/Sibyl

# Reduce HuggingFace Hub overhead
export HF_HUB_DISABLE_TELEMETRY=1
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export SENTENCE_TRANSFORMERS_HOME=/home/kaki/.cache/torch/sentence_transformers

# Clean up old socket
rm -f /tmp/sibyl-ipc.sock

# Kill old processes
pkill -f "run_optimized_server.py" 2>/dev/null

echo "Starting Sibyl IPC Server (optimized)..."
echo "Using qwen2.5:0.5b for LLM"
echo "FalkorDB: localhost:6379"
echo "OpenCode: http://127.0.0.1:4096"

# Start server
nohup python run_optimized_server.py > /tmp/sibyl_server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for socket
sleep 10
if [ -S /tmp/sibyl-ipc.sock ]; then
    echo "IPC socket ready: /tmp/sibyl-ipc.sock"
    echo "Server is running!"
    tail -3 /tmp/sibyl_server.log
else
    echo "ERROR: Socket not created. Check logs:"
    tail -10 /tmp/sibyl_server.log
    exit 1
fi