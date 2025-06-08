# 🎙️ Ranger Radio Training System

A realistic web-based radio communication training system for rangers, complete with push-to-talk functionality, radio effects, multi-user support, and command staff coordination.

## 🌟 Features

### Dual Interface System
- **Regular Radio Interface** (`index.html`) - Clean, simple radio for field personnel
- **🎖️ Khaki Command Network** (`khaki.html`) - Advanced command staff interface with recording and monitoring

### Radio Realism
- **Push-to-Talk (PTT)** - Click and hold or press spacebar to transmit
- **Access Tone** - Courtesy beep before transmission (trains proper radio etiquette)
- **Roger Beep** - End-of-transmission tone
- **Squelch Tail** - Brief static burst when transmission ends
- **Background Noise** - Realistic radio static when channel is clear
- **Radio Audio Effects** - Compression, filtering, and distortion for authentic sound

### Communication Features
- **Real-time Audio Streaming** - Voice transmissions broadcast to all connected users
- **Channel Management** - Only one person can transmit at a time
- **Busy Tone** - Plays when attempting to transmit while channel is occupied
- **Activity Log** - Track all transmissions and system events
- **Callsign-based System** - Ranger identification and auto-numbered Khaki callsigns

### 🎖️ Khaki Command Network Features
- **Auto-numbered Callsigns** - KHAKI, KHAKI-2, KHAKI-3, etc. for multiple command staff
- **Smart Conversation Recording** - Automatically captures radio conversations as session-based recordings
- **Intelligent Filtering** - Records meaningful transmissions (>2s), filters noise
- **Conversation Flow Tracking** - Shows transmission sequence and participants
- **Command Staff Styling** - Military brown/khaki theme with command branding
- **Session Management** - Manual finish button and smart timeout handling
- **Storage Management** - Prevents quota exceeded errors with automatic cleanup

### Advanced Audio Features
- **Mobile Audio Routing** - Actual device-specific audio routing for mobile devices
- **Device Selection** - Separate microphone and speaker/headphone selection
- **Mobile Testing Tools** - Platform-specific volume instructions and audio tests
- **Multi-device Support** - Enhanced compatibility across desktop and mobile platforms

### Recording & Analysis
- **Session-based Recording** - Groups related transmissions into conversation sessions
- **Conversation Detection** - Identifies patterns between field units and command
- **Smart Titles** - Auto-generates meaningful session names:
  - `"Radio Traffic: RANGER-1 ↔ RANGER-2"`
  - `"Command Coordination: RANGER-1 ↔ KHAKI"`
  - `"Radio Traffic: RANGER-1 ↔ RANGER-2 (+ Command)"`
- **Playback & Download** - WAV format downloads with proper file naming
- **Flow Visualization** - Shows conversation sequence with timing

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- Modern web browser with microphone access
- SSL certificate for HTTPS (required for microphone access on network)

## 🚀 Quick Start

### Option 1: Using the Start Script (Recommended)
```bash
git clone https://github.com/yourusername/ranger-radio-training.git
cd ranger-radio-training
./start.sh
```

This will automatically:
- Install backend dependencies
- Start the backend server (port 3000)
- Start the frontend server (port 5500)
- Display connection URLs

### Option 2: Manual Setup

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/ranger-radio-training.git
cd ranger-radio-training
```

### 2. Install Backend Dependencies
```bash
cd backend
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 4. Start the Backend Server
```bash
npm start
# Or for development with auto-reload:
npm run dev
```

### 5. Serve the Frontend
```bash
cd ../frontend
python -m http.server 8000
# Then navigate to:
# http://localhost:8000/index.html (Regular Radio)
# http://localhost:8000/khaki.html (Command Network)
```

## 🔧 Configuration

### Backend Configuration (.env file)
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:8000
```

### Frontend Configuration
Edit `frontend/app.js` and update the backend URL:
```javascript
const BACKEND_URL = 'http://localhost:3000'; // Change to your backend URL
```

## 🌐 Deployment

### Option 1: Deploy to Render.com (Recommended)

1. Create account at [render.com](https://render.com)
2. Create new Web Service
3. Connect your GitHub repository
4. Configure:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && node server.js`
5. Add environment variables in Render dashboard

### Option 2: Deploy to Railway

1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Initialize: `railway init`
4. Deploy: `railway up`

### Frontend Deployment (GitHub Pages)

1. Push code to GitHub
2. Go to Settings → Pages
3. Source: Deploy from branch (main)
4. Folder: `/frontend`
5. Update `BACKEND_URL` in app.js to your deployed backend URL

## 📱 Usage

### Regular Radio Interface (Field Personnel)
1. Open `frontend/index.html`
2. Enter your ranger callsign (e.g., RANGER-1, ALPHA-2)
3. Click "Join Radio Network"
4. Hold the PTT button or press spacebar to transmit
5. Release to end transmission
6. Listen for the access tone before speaking

### 🎖️ Khaki Command Network (Command Staff)
1. Open `frontend/khaki.html`
2. Click "Join Khaki Command Network" (auto-assigns KHAKI, KHAKI-2, etc.)
3. Monitor all radio traffic with full PTT capabilities
4. View smart conversation recordings in the Sessions panel
5. Use "Finish Current Session" to manually save active conversations
6. Download session recordings as WAV files for analysis

### Radio Communication Best Practices
- **Press** - Wait for access tone (chirp) before speaking
- **Speak** - Clear, concise communication with proper callsigns
- **Release** - Roger beep confirms end of transmission
- **Listen** - Monitor channel before transmitting
- **Coordinate** - Use Khaki network for command oversight

### Recording System (Khaki Only)
- **Automatic Sessions** - Conversations grouped intelligently
- **Smart Filtering** - Only meaningful transmissions saved (>2 seconds)
- **Session Timeout** - 45 seconds of silence closes session
- **Manual Control** - Force-finish current session anytime
- **Conversation Flow** - See transmission sequence: `RANGER-1(3.2s) → KHAKI(2.1s) → RANGER-2(1.8s)`

## 🛠️ Troubleshooting

### No Audio Transmission
- Check microphone permissions in browser
- Ensure backend server is running
- Verify BACKEND_URL matches your server address
- Check browser console for errors

### Connection Issues
- Verify backend server is accessible
- Check CORS settings in .env file
- Ensure using HTTPS for network deployment

### Audio Quality
- Adjust volume slider
- Toggle radio effects on/off
- Check microphone quality and positioning

## 🔒 Security Considerations

### For Production Deployment
1. Use HTTPS for both frontend and backend
2. Implement authentication/authorization
3. Add rate limiting for transmissions
4. Validate and sanitize all inputs
5. Use environment variables for sensitive data

### SSL Certificate Setup
For local HTTPS testing:
```bash
cd backend
openssl req -nodes -new -x509 -keyout server.key -out server.cert
```

Update server.js to use HTTPS:
```javascript
const https = require('https');
const fs = require('fs');

const serverOptions = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert')
};

const server = https.createServer(serverOptions, app);
```

## 📊 Architecture

### Frontend Architecture
- **Dual Interface Design**:
  - `index.html` - Clean regular radio interface
  - `khaki.html` - Command network with recording system
- **Vanilla JavaScript** - No framework dependencies for maximum compatibility
- **Web Audio API** - Audio processing, effects, and mobile device routing
- **MediaRecorder API** - Microphone capture and session recording
- **Socket.IO Client** - Real-time communication
- **Smart Recording System** - Session-based conversation capture

### Backend
- **Node.js** - Server runtime
- **Express** - Web framework  
- **Socket.IO** - WebSocket communication for real-time audio
- **CORS** - Cross-origin resource sharing

### Recording System Architecture
```
Radio Conversation Flow:
RANGER-1 → [Transmission] → Server → All Connected Users
    ↓
Khaki Interface → Session Detection → Smart Grouping → Local Storage
    ↓
Session Recording: [RANGER-1(3.2s) → KHAKI(2.1s) → RANGER-2(1.8s)]
    ↓
WAV Export: "Radio_Traffic_RANGER-1_RANGER-2_2025-06-07_14-30-15.wav"
```

### Communication Flow
```
Field Radio (Regular Interface):
Ranger A (PTT) → Microphone → MediaRecorder → Socket.IO → Server
                                                            ↓
Command (Khaki Interface) ← Recording Session ← Socket.IO ← ←
                                                            ↓
Ranger B ← Speaker ← Web Audio API ← Socket.IO ← ← ← ← ← ← ←
```

## 🎯 Training Scenarios

### Basic Radio Operation
1. **Field Personnel** - Use regular radio interface to practice PTT discipline
2. **Command Staff** - Monitor operations via Khaki interface
3. Learn to wait for access tone and develop clear communication habits
4. Practice proper callsign usage and radio etiquette

### Command Coordination Exercises
- **Field-to-Command** - Rangers report to Khaki for instructions
- **Multi-unit Coordination** - Command coordinates between multiple field units
- **Session Recording** - Review conversations for training improvement
- **Real-time Monitoring** - Command staff observes all radio traffic

### Emergency Procedures
- Emergency broadcast protocols and procedures
- Practice emergency response coordination
- Command oversight during crisis scenarios
- Post-incident recording review and analysis

### Advanced Training
- **Multi-team Operations** - Complex scenarios with multiple ranger teams
- **Recording Analysis** - Review session recordings for improvement
- **Communication Flow Study** - Analyze conversation patterns and efficiency
- **Command Decision Making** - Use recorded sessions for leadership training

## 🔮 Future Enhancements

### Recently Implemented ✅
- [x] Recording and playback for training review (Khaki Command Network)
- [x] Smart conversation session grouping
- [x] Mobile audio device routing improvements  
- [x] Command staff interface separation
- [x] Intelligent recording filtering and management

### Planned Features
- [ ] Multiple radio channels/frequencies
- [ ] User authentication and profiles
- [ ] Simulated radio range limitations based on geography
- [ ] Background noise scenarios (weather, interference)
- [ ] Training metrics and scoring system
- [ ] Integration with mapping systems (GPS coordinates)
- [ ] Offline mode with service workers
- [ ] Emergency override protocols
- [ ] Team/unit assignment management
- [ ] Real-time training scenario injection
- [ ] After-action review tools with session analysis

### Community Contributions
We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Inspired by real ranger communication needs
- Built for training and educational purposes
- Thanks to all contributors and testers

## 📞 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Contact: [your-email@example.com]
- Documentation: [wiki-link]

---

**Remember**: This is a training system. Always follow proper radio protocols and regulations when using actual radio equipment.