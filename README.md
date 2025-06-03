# 🎙️ Ranger Radio Training System

A realistic web-based radio communication training system for rangers, complete with push-to-talk functionality, radio effects, and multi-user support.

## 🌟 Features

### Radio Realism
- **Push-to-Talk (PTT)** - Click and hold or press spacebar to transmit
- **Access Tone** - Courtesy beep before transmission (trains proper radio etiquette)
- **Roger Beep** - End-of-transmission tone
- **Squelch Tail** - Brief static burst when transmission ends
- **Background Noise** - Realistic radio static when channel is clear
- **Radio Audio Effects** - Compression, filtering, and distortion for authentic sound

### Communication Features
- **Real-time Audio Streaming** - Voice transmissions broadcast to all connected rangers
- **Channel Management** - Only one person can transmit at a time
- **Busy Tone** - Plays when attempting to transmit while channel is occupied
- **Activity Log** - Track all transmissions and system events
- **Ranger Identification** - Callsign-based system

### Advanced Features
- **Preset Messages** - Text-to-speech messages using OpenAI API
- **Multiple Voice Options** - 6 different TTS voices
- **Adjustable Effects** - Toggle individual radio effects on/off
- **Volume Control** - Master volume slider
- **Mobile Support** - Touch-enabled PTT button

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- Modern web browser with microphone access
- SSL certificate for HTTPS (required for microphone access on network)

## 🚀 Quick Start

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

### 5. Open the Frontend
Open `frontend/index.html` in a web browser, or serve it with a local web server:
```bash
cd ../frontend
python -m http.server 8000
# Then navigate to http://localhost:8000
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

### Basic Operation
1. Enter your ranger callsign
2. Click "Join Radio Network"
3. Hold the PTT button or press spacebar to transmit
4. Release to end transmission
5. Listen for the access tone before speaking

### Preset Messages (TTS)
1. Click "Preset Messages"
2. Enter your OpenAI API key
3. Add preset messages
4. Click "Transmit" to send via text-to-speech

### Radio Etiquette Training
- **Press** - Wait for access tone (chirp)
- **Speak** - Clear, concise communication
- **Release** - Roger beep confirms end of transmission

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

### Frontend
- **Vanilla JavaScript** - No framework dependencies
- **Web Audio API** - Audio processing and effects
- **MediaRecorder API** - Microphone capture
- **Socket.IO Client** - Real-time communication
- **OpenAI TTS API** - Text-to-speech for presets

### Backend
- **Node.js** - Server runtime
- **Express** - Web framework
- **Socket.IO** - WebSocket communication
- **CORS** - Cross-origin resource sharing

### Communication Flow
```
Ranger A (PTT) → Microphone → MediaRecorder → Socket.IO → Server
                                                            ↓
Ranger C ← Speaker ← Web Audio API ← Socket.IO ← ← ← ← ← ← ↓
                                                            ↓
Ranger B ← Speaker ← Web Audio API ← Socket.IO ← ← ← ← ← ← ←
```

## 🎯 Training Scenarios

### Basic Radio Operation
1. Practice proper PTT discipline
2. Learn to wait for access tone
3. Develop clear communication habits

### Emergency Procedures
- Emergency broadcast feature overrides current transmission
- Practice emergency protocols
- Coordinate team responses

### Multi-Team Operations
- Different teams can use different "channels" (extend the system)
- Practice inter-team coordination
- Simulate real-world scenarios

## 🔮 Future Enhancements

### Planned Features
- [ ] Multiple radio channels
- [ ] Recording and playback for training review
- [ ] User authentication and profiles
- [ ] Simulated radio range limitations
- [ ] Background noise scenarios (weather, interference)
- [ ] Training metrics and scoring
- [ ] Integration with mapping systems
- [ ] Offline mode with service workers

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