// Ranger Radio Training - Frontend Application
// Fixed version with proper login state management

// Configuration
const BACKEND_URL = window.BACKEND_URL;

console.log('BACKEND_URL configured as:', BACKEND_URL);

// Global variables
let socket = null;
let isConnected = false;
let rangerCallsign = null;
let isTransmitting = false;
let mediaRecorder = null;
let audioContext = null;
let audioStream = null;
let audioChunks = [];
let audioProcessor = null;
let microphoneSource = null;
let currentRecording = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const radioInterface = document.getElementById('radio-interface');
const callsignInput = document.getElementById('callsign');
const joinButton = document.getElementById('join-button');
const exitButton = document.getElementById('exit-button');
const pttButton = document.getElementById('ptt-button');
const statusIndicator = document.getElementById('status-indicator');
const activityLog = document.getElementById('activity-log');
const volumeSlider = document.getElementById('volume-slider');
const presetMessagesButton = document.getElementById('preset-messages-button');
const presetMessagesModal = document.getElementById('preset-messages-modal');
const closeModalButton = document.getElementById('close-modal');

// Audio effects toggles
const effectsToggles = {
    accessTone: document.getElementById('access-tone-toggle'),
    rogerBeep: document.getElementById('roger-beep-toggle'),
    squelchTail: document.getElementById('squelch-tail-toggle'),
    backgroundNoise: document.getElementById('background-noise-toggle'),
    radioEffects: document.getElementById('radio-effects-toggle')
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initializeAudioContext();
});

// Setup event listeners
function setupEventListeners() {
    joinButton.addEventListener('click', joinNetwork);
    exitButton.addEventListener('click', exitNetwork);
    callsignInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinNetwork();
    });
    
    // PTT button events
    pttButton.addEventListener('mousedown', startTransmission);
    pttButton.addEventListener('mouseup', stopTransmission);
    pttButton.addEventListener('mouseleave', stopTransmission);
    pttButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startTransmission();
    });
    pttButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopTransmission();
    });
    
    // Keyboard PTT (spacebar)
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat && isConnected) {
            e.preventDefault();
            startTransmission();
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && isConnected) {
            e.preventDefault();
            stopTransmission();
        }
    });
    
    // Volume control
    volumeSlider.addEventListener('input', (e) => {
        setMasterVolume(e.target.value / 100);
    });
    
    // Preset messages
    presetMessagesButton.addEventListener('click', () => {
        presetMessagesModal.style.display = 'block';
    });
    
    closeModalButton.addEventListener('click', () => {
        presetMessagesModal.style.display = 'none';
    });
}

// Initialize Web Audio API
function initializeAudioContext() {
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
    } catch (error) {
        console.error('Web Audio API not supported:', error);
        addToActivityLog('Error: Web Audio API not supported in this browser');
    }
}

// Join the radio network
function joinNetwork() {
    const callsign = callsignInput.value.trim().toUpperCase();
    
    if (!callsign) {
        alert('Please enter your ranger callsign');
        return;
    }
    
    if (callsign.length < 2 || callsign.length > 10) {
        alert('Callsign must be between 2 and 10 characters');
        return;
    }
    
    rangerCallsign = callsign;
    connectToServer();
}

// Connect to the backend server
function connectToServer() {
    if (socket) {
        socket.disconnect();
    }
    
    console.log('Attempting to connect to:', BACKEND_URL);
    addToActivityLog(`Connecting to ${BACKEND_URL}...`);
    
    socket = io(BACKEND_URL, {
        transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
        console.log('Connected to server');
        addToActivityLog('Connected to server, joining with callsign: ' + rangerCallsign);
        socket.emit('join', { callsign: rangerCallsign });
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        addToActivityLog('Connection failed: ' + error.message);
    });
    
    socket.on('joined', (data) => {
        console.log('Successfully joined:', data);
        isConnected = true;
        showRadioInterface();
        addToActivityLog(`${rangerCallsign} joined the radio network`);
        updateStatus('READY');
    });
    
    socket.on('error', (error) => {
        console.error('Server error:', error);
        alert(error.message || 'Connection error occurred');
        if (error.message && error.message.includes('already in use')) {
            // Don't disconnect if it's just a duplicate name error
            return;
        }
        exitNetwork();
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        isConnected = false;
        updateStatus('OFFLINE');
        addToActivityLog('Disconnected from radio network');
    });
    
    socket.on('transmission-start', (data) => {
        if (data.callsign !== rangerCallsign) {
            updateStatus('RECEIVING');
            addToActivityLog(`${data.callsign} is transmitting`);
            playAccessTone();
        }
    });
    
    socket.on('audio-data', (data) => {
        if (data.callsign !== rangerCallsign) {
            playReceivedAudio(data);
            
            // Save received transmission to recording history
            saveReceivedTransmission(data);
        }
    });
    
    socket.on('transmission-end', (data) => {
        if (data.callsign !== rangerCallsign) {
            updateStatus('READY');
            addToActivityLog(`${data.callsign} ended transmission`);
            playRogerBeep();
            playSquelchTail();
        }
    });
    
    socket.on('channel-busy', () => {
        playBusyTone();
        addToActivityLog('Channel busy - please wait');
    });
    
    socket.on('user-list', (users) => {
        console.log('Active users:', users);
    });
}

// Show radio interface after successful login
function showRadioInterface() {
    loginScreen.style.display = 'none';
    radioInterface.style.display = 'block';
    document.getElementById('current-callsign').textContent = rangerCallsign;
}

// Exit the radio network
function exitNetwork() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    isConnected = false;
    rangerCallsign = null;
    
    // Reset UI
    loginScreen.style.display = 'flex';
    radioInterface.style.display = 'none';
    callsignInput.value = '';
    activityLog.innerHTML = '';
    updateStatus('OFFLINE');
}

// Start transmission
async function startTransmission() {
    if (!isConnected || isTransmitting) return;
    
    try {
        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        // Notify server
        socket.emit('transmission-start');
        
        isTransmitting = true;
        updateStatus('TRANSMITTING');
        pttButton.classList.add('transmitting');
        
        // Play access tone
        playAccessTone();
        
        // Start recording after access tone
        setTimeout(() => {
            if (isTransmitting) {
                startRecording();
            }
        }, 500);
        
        addToActivityLog(`${rangerCallsign} is transmitting`);
        
    } catch (error) {
        console.error('Microphone access error:', error);
        addToActivityLog('Error: Unable to access microphone');
        alert('Unable to access microphone. Please check permissions.');
    }
}

// Start recording audio
function startRecording() {
    if (!audioStream || !audioContext) return;
    
    try {
        // Create microphone source
        microphoneSource = audioContext.createMediaStreamSource(audioStream);
        
        // Initialize recording storage
        currentRecording = {
            id: Date.now(),
            callsign: rangerCallsign,
            type: 'Transmission',
            timestamp: new Date().toLocaleString(),
            startTime: Date.now(),
            audioData: [],
            sampleRate: audioContext.sampleRate
        };
        
        // Create script processor for real-time audio processing
        audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        
        audioProcessor.onaudioprocess = (event) => {
            if (!isTransmitting) return;
            
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            // Convert to 16-bit PCM and send to server
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                // Convert float (-1 to 1) to 16-bit integer
                pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
            }
            
            // Store audio data for recording history
            if (currentRecording) {
                currentRecording.audioData.push(...Array.from(pcmData));
            }
            
            // Send audio data in real-time
            if (socket && isConnected) {
                socket.emit('audio-data', {
                    audio: Array.from(pcmData),
                    sampleRate: audioContext.sampleRate
                });
            }
        };
        
        // Connect the audio processing chain
        microphoneSource.connect(audioProcessor);
        audioProcessor.connect(audioContext.destination);
        
        console.log('Real-time audio streaming started');
        
    } catch (error) {
        console.error('Audio processing setup error:', error);
        addToActivityLog('Error setting up audio processing');
    }
}

// Stop transmission
function stopTransmission() {
    if (!isTransmitting) return;
    
    isTransmitting = false;
    updateStatus('READY');
    pttButton.classList.remove('transmitting');
    
    // Save recording to localStorage
    if (currentRecording && currentRecording.audioData.length > 0) {
        currentRecording.duration = (Date.now() - currentRecording.startTime) / 1000;
        currentRecording.size = currentRecording.audioData.length * 2; // 16-bit = 2 bytes per sample
        
        // Get existing recordings
        const existingRecordings = JSON.parse(localStorage.getItem('rangerRadioRecordings') || '[]');
        existingRecordings.push(currentRecording);
        
        // Keep only last 50 recordings to manage storage
        if (existingRecordings.length > 50) {
            existingRecordings.splice(0, existingRecordings.length - 50);
        }
        
        // Save to localStorage
        localStorage.setItem('rangerRadioRecordings', JSON.stringify(existingRecordings));
        
        addToActivityLog(`Recording saved (${currentRecording.duration.toFixed(1)}s)`);
        console.log('Recording saved:', currentRecording.id);
    }
    
    currentRecording = null;
    
    // Clean up audio processing
    if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
    }
    
    if (microphoneSource) {
        microphoneSource.disconnect();
        microphoneSource = null;
    }
    
    // Stop audio stream
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    
    // Play roger beep
    playRogerBeep();
    
    // Play squelch tail
    setTimeout(() => {
        playSquelchTail();
    }, 200);
    
    // Notify server
    socket.emit('transmission-end');
    
    addToActivityLog(`${rangerCallsign} ended transmission`);
}

// Update status indicator
function updateStatus(status) {
    statusIndicator.textContent = status;
    statusIndicator.className = 'status-indicator status-' + status.toLowerCase();
}

// Add message to activity log
function addToActivityLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.textContent = `[${timestamp}] ${message}`;
    activityLog.appendChild(logEntry);
    activityLog.scrollTop = activityLog.scrollHeight;
}

// Audio playback functions
function playAccessTone() {
    if (!effectsToggles.accessTone.checked) return;
    playTone(1200, 0.1, 0.1);
}

function playRogerBeep() {
    if (!effectsToggles.rogerBeep.checked) return;
    playTone(800, 0.1, 0.15);
}

function playSquelchTail() {
    if (!effectsToggles.squelchTail.checked) return;
    playNoise(0.05, 0.2);
}

function playBusyTone() {
    playTone(400, 0.2, 0.3);
}

// Helper function to play tones
function playTone(frequency, duration, volume) {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    gainNode.gain.value = volume * (volumeSlider.value / 100);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
}

// Helper function to play noise
function playNoise(duration, volume) {
    if (!audioContext) return;
    
    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    
    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    gainNode.gain.value = volume * (volumeSlider.value / 100);
    
    source.start();
}

// Play received audio
function playReceivedAudio(audioData) {
    if (!audioContext) return;
    
    try {
        // Convert received PCM data back to audio buffer
        const pcmArray = new Int16Array(audioData.audio);
        const sampleRate = audioData.sampleRate || 44100;
        
        // Create audio buffer
        const audioBuffer = audioContext.createBuffer(1, pcmArray.length, sampleRate);
        const bufferData = audioBuffer.getChannelData(0);
        
        // Convert 16-bit PCM back to float
        for (let i = 0; i < pcmArray.length; i++) {
            bufferData[i] = pcmArray[i] / 32768;
        }
        
        // Create source and play
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.value = volumeSlider.value / 100;
        
        source.start();
        
    } catch (error) {
        console.error('Audio playback error:', error);
        addToActivityLog('Error playing received audio');
    }
}

// Apply radio effects (simplified version)
function applyRadioEffects(audioData) {
    // This is a placeholder for radio effects
    // In a real implementation, you would apply compression,
    // filtering, and distortion to simulate radio audio
    return audioData;
}

// Set master volume
function setMasterVolume(value) {
    // This would be used to control overall audio output
    console.log('Master volume set to:', value);
}

// Background noise generator (if enabled)
function startBackgroundNoise() {
    if (!effectsToggles.backgroundNoise.checked || !audioContext) return;
    
    // Create a continuous low-level noise
    const noiseSource = audioContext.createScriptProcessor(4096, 1, 1);
    const gainNode = audioContext.createGain();
    
    noiseSource.onaudioprocess = (e) => {
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) {
            output[i] = (Math.random() * 2 - 1) * 0.01; // Very low volume
        }
    };
    
    noiseSource.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = 0.05 * (volumeSlider.value / 100);
}

// Handle effects toggle changes
Object.entries(effectsToggles).forEach(([effect, toggle]) => {
    toggle.addEventListener('change', (e) => {
        console.log(`${effect} ${e.target.checked ? 'enabled' : 'disabled'}`);
        if (effect === 'backgroundNoise') {
            if (e.target.checked) {
                startBackgroundNoise();
            }
        }
    });
});

// Save received transmission to recording history
function saveReceivedTransmission(data) {
    if (!data.audio || !data.callsign) return;
    
    const recording = {
        id: Date.now() + Math.random(), // Ensure unique ID
        callsign: data.callsign,
        type: 'Received',
        timestamp: new Date().toLocaleString(),
        audioData: data.audio,
        sampleRate: data.sampleRate || 44100,
        duration: (data.audio.length / (data.sampleRate || 44100)),
        size: data.audio.length * 2
    };
    
    // Get existing recordings
    const existingRecordings = JSON.parse(localStorage.getItem('rangerRadioRecordings') || '[]');
    existingRecordings.push(recording);
    
    // Keep only last 50 recordings to manage storage
    if (existingRecordings.length > 50) {
        existingRecordings.splice(0, existingRecordings.length - 50);
    }
    
    // Save to localStorage
    localStorage.setItem('rangerRadioRecordings', JSON.stringify(existingRecordings));
    
    console.log('Received transmission saved:', recording.id);
}