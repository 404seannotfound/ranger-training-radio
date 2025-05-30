const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIO(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Store connected rangers
const connectedRangers = new Map();
let currentTransmitter = null;

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Ranger Radio Server Active',
    connectedRangers: connectedRangers.size,
    channelBusy: currentTransmitter !== null
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Handle ranger joining
  socket.on('join', (data) => {
    const { rangerName } = data;
    
    // Check if callsign is already in use
    const existingRanger = Array.from(connectedRangers.values()).find(r => r.rangerName === rangerName);
    if (existingRanger) {
      socket.emit('join-error', { message: 'Callsign already in use' });
      return;
    }

    // Add ranger to connected list
    connectedRangers.set(socket.id, {
      socketId: socket.id,
      rangerName: rangerName,
      joinedAt: new Date()
    });

    // Join the main radio channel
    socket.join('radio-channel');

    // Notify the ranger they've joined successfully
    socket.emit('joined', {
      rangerName: rangerName,
      connectedRangers: Array.from(connectedRangers.values()).map(r => r.rangerName),
      channelBusy: currentTransmitter !== null,
      currentTransmitter: currentTransmitter
    });

    // Notify all other rangers
    socket.to('radio-channel').emit('ranger-joined', {
      rangerName: rangerName,
      totalRangers: connectedRangers.size
    });

    console.log(`${rangerName} joined the radio network`);
  });

  // Handle transmission request
  socket.on('request-transmission', () => {
    const ranger = connectedRangers.get(socket.id);
    if (!ranger) return;

    // Check if channel is busy
    if (currentTransmitter !== null) {
      socket.emit('transmission-denied', {
        reason: 'channel-busy',
        currentTransmitter: connectedRangers.get(currentTransmitter)?.rangerName
      });
      return;
    }

    // Grant transmission
    currentTransmitter = socket.id;
    
    // Notify the transmitting ranger
    socket.emit('transmission-granted');

    // Notify all other rangers that someone is transmitting
    socket.to('radio-channel').emit('transmission-started', {
      rangerName: ranger.rangerName,
      socketId: socket.id
    });

    console.log(`${ranger.rangerName} started transmitting`);
  });

  // Handle audio data streaming
  socket.on('audio-data', (data) => {
    const ranger = connectedRangers.get(socket.id);
    if (!ranger || currentTransmitter !== socket.id) return;

    // Broadcast audio to all other rangers
    socket.to('radio-channel').emit('audio-stream', {
      rangerName: ranger.rangerName,
      audioData: data.audioData,
      timestamp: data.timestamp
    });
  });

  // Handle transmission end
  socket.on('end-transmission', () => {
    const ranger = connectedRangers.get(socket.id);
    if (!ranger || currentTransmitter !== socket.id) return;

    // Clear current transmitter
    currentTransmitter = null;

    // Notify all rangers
    io.to('radio-channel').emit('transmission-ended', {
      rangerName: ranger.rangerName
    });

    console.log(`${ranger.rangerName} ended transmission`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const ranger = connectedRangers.get(socket.id);
    
    if (ranger) {
      // If this ranger was transmitting, end their transmission
      if (currentTransmitter === socket.id) {
        currentTransmitter = null;
        io.to('radio-channel').emit('transmission-ended', {
          rangerName: ranger.rangerName,
          reason: 'disconnected'
        });
      }

      // Remove from connected rangers
      connectedRangers.delete(socket.id);

      // Notify other rangers
      socket.to('radio-channel').emit('ranger-left', {
        rangerName: ranger.rangerName,
        totalRangers: connectedRangers.size
      });

      console.log(`${ranger.rangerName} left the radio network`);
    }
  });

  // Handle status request
  socket.on('status-request', () => {
    socket.emit('status-update', {
      connectedRangers: Array.from(connectedRangers.values()).map(r => r.rangerName),
      channelBusy: currentTransmitter !== null,
      currentTransmitter: currentTransmitter ? connectedRangers.get(currentTransmitter)?.rangerName : null
    });
  });

  // Handle emergency broadcast (overrides current transmission)
  socket.on('emergency-broadcast', () => {
    const ranger = connectedRangers.get(socket.id);
    if (!ranger) return;

    // Clear current transmitter
    if (currentTransmitter && currentTransmitter !== socket.id) {
      io.to(currentTransmitter).emit('transmission-interrupted', {
        reason: 'emergency',
        interruptedBy: ranger.rangerName
      });
    }

    currentTransmitter = socket.id;

    // Notify all rangers of emergency broadcast
    io.to('radio-channel').emit('emergency-broadcast-started', {
      rangerName: ranger.rangerName
    });

    console.log(`EMERGENCY: ${ranger.rangerName} initiated emergency broadcast`);
  });
});

// Error handling
io.on('error', (error) => {
  console.error('Socket.IO error:', error);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Ranger Radio Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'Not configured'}`);
});