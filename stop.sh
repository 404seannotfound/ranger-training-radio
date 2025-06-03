#!/bin/bash

echo "Stopping backend and frontend servers..."
pkill -f server.js
pkill -f serve.py
# Wait a moment for graceful shutdown
sleep 1
# Force kill any remaining processes
ps aux | grep -E 'server.js|serve.py' | grep -v grep | awk '{print $2}' | xargs -r kill -9
echo "All servers stopped." 