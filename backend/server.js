// Ranger Radio Training - Backend Server
// Fixed version with proper socket event handling

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = socketIO(server, {
    cors: {
        origin: "https://ranger-training-radio.onrender.com",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors({
    origin: "https://ranger-training-radio.onrender.com",
    methods: ["GET", "POST"],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// In-memory storage for connected rangers
const connectedRangers = new Map();
const activeTransmissions = new Set();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);
    
    // Handle ranger joining the network
    socket.on('join', (data) => {
        const { callsign } = data;
        
        if (!callsign) {
            socket.emit('error', { message: 'Callsign is required' });
            return;
        }
        
        // Check if callsign is already in use
        const existingRanger = Array.from(connectedRangers.values())
            .find(ranger => ranger.callsign === callsign);
        
        if (existingRanger) {
            socket.emit('error', { message: 'Callsign already in use' });
            return;
        }
        
        // Add ranger to connected list
        const ranger = {
            id: socket.id,
            callsign: callsign,
            joinedAt: new Date(),
            isTransmitting: false
        };
        
        connectedRangers.set(socket.id, ranger);
        
        // Join a room with their callsign (useful for direct messaging)
        socket.join(callsign);
        
        // IMPORTANT: Emit 'joined' event to confirm successful join
        socket.emit('joined', {
            callsign: callsign,
            rangerId: socket.id,
            timestamp: new Date()
        });
        
        // Notify all other rangers
        socket.broadcast.emit('ranger-joined', {
            callsign: callsign,
            timestamp: new Date()
        });
        
        // Send current user list to all connected clients
        io.emit('user-list', Array.from(connectedRangers.values()).map(r => ({
            callsign: r.callsign,
            isTransmitting: r.isTransmitting
        })));
        
        console.log(`Ranger ${callsign} joined the network`);
    });
    
    // Handle transmission start
    socket.on('transmission-start', () => {
        const ranger = connectedRangers.get(socket.id);
        
        if (!ranger) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }
        
        // Check if channel is busy
        if (activeTransmissions.size > 0) {
            socket.emit('channel-busy');
            return;
        }
        
        // Mark ranger as transmitting
        ranger.isTransmitting = true;
        activeTransmissions.add(socket.id);
        
        // Notify all clients about transmission start
        io.emit('transmission-start', {
            callsign: ranger.callsign,
            timestamp: new Date()
        });
        
        console.log(`${ranger.callsign} started transmitting`);
    });
    
    // Handle audio data transmission
    socket.on('audio-data', (data) => {
        const ranger = connectedRangers.get(socket.id);
        
        if (!ranger || !ranger.isTransmitting) {
            return;
        }
        
        // Broadcast audio to all other connected clients
        socket.broadcast.emit('audio-data', {
            callsign: ranger.callsign,
            audio: data.audio,
            timestamp: new Date()
        });
    });
    
    // Handle transmission end
    socket.on('transmission-end', () => {
        const ranger = connectedRangers.get(socket.id);
        
        if (!ranger) {
            return;
        }
        
        // Mark ranger as not transmitting
        ranger.isTransmitting = false;
        activeTransmissions.delete(socket.id);
        
        // Notify all clients about transmission end
        io.emit('transmission-end', {
            callsign: ranger.callsign,
            timestamp: new Date()
        });
        
        console.log(`${ranger.callsign} ended transmission`);
    });
    
    // Handle preset message transmission (TTS)
    socket.on('transmit-preset', async (data) => {
        const ranger = connectedRangers.get(socket.id);
        
        if (!ranger) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }
        
        // Check if channel is busy
        if (activeTransmissions.size > 0) {
            socket.emit('channel-busy');
            return;
        }
        
        // In a real implementation, you would:
        // 1. Call OpenAI TTS API to generate audio
        // 2. Broadcast the audio to all clients
        // For now, we'll just broadcast the text
        
        io.emit('preset-message', {
            callsign: ranger.callsign,
            message: data.message,
            voice: data.voice || 'alloy',
            timestamp: new Date()
        });
        
        console.log(`${ranger.callsign} sent preset message: ${data.message}`);
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        const ranger = connectedRangers.get(socket.id);
        
        if (ranger) {
            // Remove from active transmissions if transmitting
            if (ranger.isTransmitting) {
                activeTransmissions.delete(socket.id);
                
                // Notify others that transmission ended
                io.emit('transmission-end', {
                    callsign: ranger.callsign,
                    timestamp: new Date()
                });
            }
            
            // Remove from connected rangers
            connectedRangers.delete(socket.id);
            
            // Leave their callsign room
            socket.leave(ranger.callsign);
            
            // Notify all other rangers
            socket.broadcast.emit('ranger-left', {
                callsign: ranger.callsign,
                timestamp: new Date()
            });
            
            // Send updated user list
            io.emit('user-list', Array.from(connectedRangers.values()).map(r => ({
                callsign: r.callsign,
                isTransmitting: r.isTransmitting
            })));
            
            console.log(`Ranger ${ranger.callsign} left the network`);
        }
    });
    
    // Handle errors
    socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        connectedRangers: connectedRangers.size,
        activeTransmissions: activeTransmissions.size,
        timestamp: new Date()
    });
});

// Get connected rangers
app.get('/api/rangers', (req, res) => {
    const rangers = Array.from(connectedRangers.values()).map(r => ({
        callsign: r.callsign,
        isTransmitting: r.isTransmitting,
        joinedAt: r.joinedAt
    }));
    
    res.json({ rangers });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: err.message
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Ranger Radio Training server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'Not configured'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    
    // Notify all connected clients
    io.emit('server-shutdown', {
        message: 'Server is shutting down',
        timestamp: new Date()
    });
    
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server, io };