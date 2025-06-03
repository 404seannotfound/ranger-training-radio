 South America way to us// Configuration
const BACKEND_URL = typeof window !== 'undefined' && window.BACKEND_URL ? window.BACKEND_URL : 'https://localhost:3000';

// Audio context and nodes
let audioContext;
let mediaStream;
let mediaRecorder;
let isTransmitting = false;
let channelBusy = false;
let rangerName = '';
let volume = 0.75;

// Socket.IO connection
let socket = null;
let wsConnected = false;

// Radio effect nodes
let compressor;
let bandpass;
let distortion;
let noiseGain;
let noiseSource;

// Feature toggles
let features = {
    accessTone: true,
    rogerBeep: true,
    squelchTail: true,
    backgroundNoise: true,
    radioEffects: true
};

// Preset messages
let presetMessages = [];

// Audio elements
const busyTone = new Audio('busy-tone.wav');
busyTone.volume = 0.3;

document.addEventListener('DOMContentLoaded', function() {
// DOM elements
const loginSection = document.getElementById('loginSection');
const radioSection = document.getElementById('radioSection');
const presetSection = document.getElementById('presetSection');
const rangerNameInput = document.getElementById('rangerName');
const joinButton = document.getElementById('joinButton');
const pttButton = document.getElementById('pttButton');
const statusLight = document.getElementById('statusLight');
const statusText = document.getElementById('statusText');
const rangerDisplay = document.getElementById('rangerDisplay');
const activityLog = document.getElementById('activityLog');
const volumeSlider = document.getElementById('volumeSlider');
const errorMessage = document.getElementById('errorMessage');
const exitButton = document.getElementById('exitButton');
const presetButton = document.getElementById('presetButton');
const backToRadioButton = document.getElementById('backToRadioButton');

// Log entry helper
function addLogEntry(msg, type = 'system') {
    if (activityLog) {
        const entry = document.createElement('div');
        entry.textContent = `[${type}] ${msg}`;
        entry.className = 'log-entry ' + type;
        activityLog.appendChild(entry);
        activityLog.scrollTop = activityLog.scrollHeight;
    }
    console.log(`[${type}] ${msg}`);
}

// Show error helper
function showError(msg) {
    if (errorMessage) {
        errorMessage.textContent = msg;
        errorMessage.style.display = msg ? 'block' : 'none';
    } else {
        alert(msg); // fallback if errorMessage element missing
    }
}

// Feature toggle elements
const accessToneToggle = document.getElementById('accessToneToggle');
const rogerBeepToggle = document.getElementById('rogerBeepToggle');
const squelchTailToggle = document.getElementById('squelchTailToggle');
const backgroundNoiseToggle = document.getElementById('backgroundNoiseToggle');
const radioEffectsToggle = document.getElementById('radioEffectsToggle');

// Preset elements
const openaiKeyInput = document.getElementById('openaiKey');
const voiceSelect = document.getElementById('voiceSelect');
const presetMessageInput = document.getElementById('presetMessage');
const addPresetButton = document.getElementById('addPresetButton');
const presetList = document.getElementById('presetList');

// --- Join Button Handler ---
joinButton.addEventListener('click', async () => {
    const name = rangerNameInput.value.trim();
    if (!name) {
        showError('Please enter your callsign.');
        return;
    }
    rangerName = name;
    showError('');
    // Visual feedback: disable button and show spinner
    joinButton.disabled = true;
    const originalText = joinButton.innerHTML;
    joinButton.innerHTML = '<span class="spinner"></span> Joining...';

    try {
        // Initialize socket if not already
        if (!socket) {
            initSocket();
        }
        // Wait a moment for socket to connect if needed
        if (!wsConnected) {
            // Wait for connection (max 2s)
            let waited = 0;
            while (!wsConnected && waited < 2000) {
                await new Promise(res => setTimeout(res, 100));
                waited += 100;
            }
            if (!wsConnected) {
                showError('Could not connect to server.');
                return;
            }
        }
        socket.emit('join', { rangerName });
    } finally {
        // Restore button after slight delay for visual effect
        setTimeout(() => {
            joinButton.disabled = false;
            joinButton.innerHTML = originalText;
        }, 600);
    }
});

// Show radio section on successful join
if (typeof radioSection !== 'undefined' && typeof loginSection !== 'undefined') {
    if (typeof socket !== 'undefined') {
        if (socket) {
            socket.on('joined', (data) => {
                loginSection.style.display = 'none';
                radioSection.style.display = 'block';
            });
        }
    }
}

// --- All helper and socket functions moved inside ---
function createRogerBeep() {
    if (!features.rogerBeep || !audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3 * volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function playAccessTone(callback) {
    if (!features.accessTone || !audioContext) {
        callback();
        return;
    }
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.3 * volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
    setTimeout(callback, 200);
}

function playSquelchTail() {
    if (!features.squelchTail || !audioContext) return;
    const duration = 0.2;
    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        const envelope = 1 - (i / bufferSize);
        data[i] = (Math.random() * 2 - 1) * envelope * 0.1;
    }
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    source.buffer = buffer;
    gainNode.gain.value = volume * 0.3;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start();
}

function initSocket() {
    socket = io(BACKEND_URL);
    socket.on('connect', () => {
        console.log('Connected to server');
        wsConnected = true;
        addLogEntry('Connected to radio network', 'system');
    });
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        wsConnected = false;
        addLogEntry('Disconnected from radio network', 'system');
        showError('Connection lost. Please refresh the page.');
    });
    socket.on('joined', (data) => {
        channelBusy = data.channelBusy;
        if (data.currentTransmitter) {
            updateChannelStatus(true, data.currentTransmitter);
        }
        addLogEntry(`Successfully joined. ${data.connectedRangers.length - 1} other rangers online`, 'system');
    });
    socket.on('join-error', (data) => {
        showError(data.message);
        loginSection.style.display = 'block';
        radioSection.style.display = 'none';
    });
    socket.on('ranger-joined', (data) => {
        addLogEntry(`${data.rangerName} joined the network`, 'system');
    });
    socket.on('ranger-left', (data) => {
        addLogEntry(`${data.rangerName} left the network`, 'system');
    });
    socket.on('transmission-granted', () => {
        console.log('Transmission granted');
    });
    socket.on('transmission-denied', (data) => {
        busyTone.play();
        pttButton.classList.add('blocked');
        setTimeout(() => pttButton.classList.remove('blocked'), 500);
        addLogEntry(`Channel busy - ${data.currentTransmitter} is transmitting`, 'system');
    });
    socket.on('transmission-started', (data) => {
        channelBusy = true;
        updateChannelStatus(true, data.rangerName);
        addLogEntry(`${data.rangerName} is transmitting`, 'transmission');
        if (noiseGain && features.backgroundNoise) noiseGain.gain.value = 0.005;
    });
    socket.on('transmission-ended', (data) => {
        channelBusy = false;
        updateChannelStatus(false);
        addLogEntry(`${data.rangerName} ended transmission`, 'transmission');
        createRogerBeep();
        setTimeout(() => {
            playSquelchTail();
        }, 100);
        if (noiseGain && !isTransmitting && features.backgroundNoise) {
            setTimeout(() => {
                noiseGain.gain.value = 0.02;
            }, 300);
        }
    });
    socket.on('audio-stream', (data) => {
        playReceivedAudio(data.audioData);
    });
    socket.on('transmission-interrupted', (data) => {
        if (isTransmitting) {
            stopTransmission();
            addLogEntry(`Transmission interrupted by ${data.interruptedBy} (${data.reason})`, 'system');
        }
    });
    socket.on('emergency-broadcast-started', (data) => {
        addLogEntry(`EMERGENCY: ${data.rangerName} initiated emergency broadcast`, 'system');
    });
}

async function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: true
            }
        });
        setupRadioEffects();
        mediaRecorder = new MediaRecorder(mediaStream, {
            mimeType: 'audio/webm'
        });
        let chunks = [];
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(chunks, { type: 'audio/webm' });
            chunks = [];
            const reader = new FileReader();
            reader.onload = () => {
                if (socket && wsConnected) {
                    socket.emit('audio-data', {
                        audioData: reader.result,
                        timestamp: Date.now()
                    });
                }
            };
            reader.readAsDataURL(audioBlob);
            createRogerBeep();
            setTimeout(() => {
                playSquelchTail();
            }, 100);
            if (socket) {
                socket.emit('end-transmission');
            }
        };
        if (features.backgroundNoise) {
            startBackgroundNoise();
        }
        return true;
    } catch (error) {
        console.error('Audio initialization failed:', error);
        showError('Microphone access denied. Please allow microphone access and reload.');
        return false;
    }
}

function setupRadioEffects() {
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 10;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    bandpass = audioContext.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 2000;
    bandpass.Q.value = 5;
    distortion = audioContext.createWaveShaper();
    distortion.curve = makeDistortionCurve(20);
    distortion.oversample = '4x';
}

// ... If there are more helpers, move them here ...

}); // End DOMContentLoaded