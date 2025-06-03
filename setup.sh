#!/bin/bash

# Get the current IP address
IP_ADDRESS=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || hostname -I | awk '{print $1}')

echo "Detected IP address: $IP_ADDRESS"

# Create backend .env file
cat > backend/.env << EOL
PORT=3000
NODE_ENV=development
FRONTEND_URL=https://$IP_ADDRESS:5500
EOL

# Update backend config.json
cat > backend/config.json << EOL
{
  "BACKEND_URL": "https://$IP_ADDRESS:3000"
}
EOL

# Update frontend config.json
cat > frontend/config.json << EOL
{
  "BACKEND_URL": "https://$IP_ADDRESS:3000"
}
EOL

# Generate SSL certificates for the frontend
cd frontend
mkcert -install
mkcert localhost $IP_ADDRESS 127.0.0.1 ::1

# Find the latest mkcert certs
CERT_PEM=$(ls -t localhost+*-key.pem | head -1 | sed 's/-key.pem/.pem/')
KEY_PEM=$(ls -t localhost+*-key.pem | head -1)

# Copy to fixed names for both frontend and backend
cp "$CERT_PEM" server-cert.pem
cp "$KEY_PEM" server-key.pem
cd ../backend
cp ../frontend/server-cert.pem .
cp ../frontend/server-key.pem .
cd ..

echo "Setup complete! You can now run ./start.sh to start the servers." 