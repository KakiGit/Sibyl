#!/bin/bash

echo "Starting Sibyl Server and Web UI..."

bun run packages/server/src/bin/server.ts &
SERVER_PID=$!

bun run --cwd packages/web vite &
WEB_PID=$!

echo "Server PID: $SERVER_PID"
echo "Web UI PID: $WEB_PID"

wait $SERVER_PID $WEB_PID