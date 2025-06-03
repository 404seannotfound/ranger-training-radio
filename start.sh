#!/bin/bash

# Get the current IP address
IP_ADDRESS=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || hostname -I | awk '{print $1}')

echo "Starting servers with IP: $IP_ADDRESS"

# Start backend server
cd backend
npm install
node server.js &
BACKEND_PID=$!

# Start frontend server
cd ../frontend
python3 serve.py &
FRONTEND_PID=$!

# Function to handle script termination
cleanup() {
    echo "Shutting down servers..."
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit 0
}

# Register the cleanup function for when script is terminated
trap cleanup SIGINT SIGTERM

echo "Servers started!"
echo "Frontend: https://$IP_ADDRESS:5500"
echo "Backend: https://$IP_ADDRESS:3000"
echo "Press Ctrl+C to stop the servers"

# Keep script running
wait 