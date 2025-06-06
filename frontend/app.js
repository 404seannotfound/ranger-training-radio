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
let transmissionTimeout = null; // Failsafe timeout
let maxTransmissionTime = 30000; // 30 seconds max transmission

// Test microphone functionality
let micTestActive = false;
let micTestProcessor = null;

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
const micTestButton = document.getElementById('mic-test-button');
const micLevelIndicator = document.getElementById('mic-level');
const transmissionIndicator = document.getElementById('transmission-indicator');

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
    
    // Start connection monitoring
    startConnectionMonitoring();
});

// Setup event listeners
function setupEventListeners() {
    joinButton.addEventListener('click', joinNetwork);
    exitButton.addEventListener('click', exitNetwork);
    callsignInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinNetwork();
    });
    
    // PTT button events - improved with better cleanup
    pttButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (isConnected && !isTransmitting) {
            startTransmission();
        }
    });
    
    pttButton.addEventListener('mouseup', (e) => {
        e.preventDefault();
        if (isTransmitting) {
            stopTransmission();
        }
    });
    
    pttButton.addEventListener('mouseleave', (e) => {
        e.preventDefault();
        if (isTransmitting) {
            console.log('🐭 Mouse left PTT button - stopping transmission');
            stopTransmission();
        }
    });
    
    pttButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (isConnected && !isTransmitting) {
            startTransmission();
        }
    });
    
    pttButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (isTransmitting) {
            stopTransmission();
        }
    });
    
    pttButton.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        if (isTransmitting) {
            console.log('📱 Touch cancelled - stopping transmission');
            stopTransmission();
        }
    });
    
    // Global keyboard PTT (spacebar) - improved handling
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat && isConnected && !isTransmitting) {
            e.preventDefault();
            startTransmission();
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && isConnected && isTransmitting) {
            e.preventDefault();
            stopTransmission();
        }
    });
    
    // Window focus/blur events - stop transmission if window loses focus
    window.addEventListener('blur', () => {
        if (isTransmitting) {
            console.log('👁️ Window lost focus - stopping transmission');
            stopTransmission();
        }
    });
    
    // Handle page unload - ensure we clean up properly
    window.addEventListener('beforeunload', (e) => {
        if (isTransmitting) {
            console.log('🚪 Page unloading - stopping transmission');
            stopTransmission();
            // Give it a moment to send the event
            e.returnValue = "Transmission in progress...";
        }
    });
    
    // Document visibility change - stop transmission if tab becomes hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isTransmitting) {
            console.log('👁️‍🗨️ Tab became hidden - stopping transmission');
            stopTransmission();
        }
    });
    
    // Mouse global events to catch mouse release outside the button
    document.addEventListener('mouseup', (e) => {
        if (isTransmitting && e.target !== pttButton) {
            console.log('🐭 Mouse released outside PTT button - stopping transmission');
            stopTransmission();
        }
    });
    
    // Volume control
    volumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        setMasterVolume(volume);
    });
    
    // Preset messages
    presetMessagesButton.addEventListener('click', () => {
        presetMessagesModal.style.display = 'block';
    });
    
    closeModalButton.addEventListener('click', () => {
        presetMessagesModal.style.display = 'none';
    });
    
    // Microphone test
    micTestButton.addEventListener('click', testMicrophone);
}

// Initialize Web Audio API
function initializeAudioContext() {
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
        
        console.log('🎵 Audio context initialized:', audioContext.state);
        
        // Add click listener to resume audio context (required by browsers)
        document.addEventListener('click', async () => {
            if (audioContext && audioContext.state === 'suspended') {
                await audioContext.resume();
                console.log('🎵 Audio context resumed:', audioContext.state);
            }
        }, { once: true });
        
    } catch (error) {
        console.error('❌ Web Audio API not supported:', error);
        addToActivityLog('Error: Web Audio API not supported in this browser');
    }
}

// Ensure audio context is ready for transmission
async function ensureAudioContextReady() {
    if (!audioContext) {
        console.log('🎵 Creating new audio context...');
        initializeAudioContext();
    }
    
    if (audioContext.state === 'suspended') {
        console.log('🎵 Resuming audio context...');
        await audioContext.resume();
    }
    
    console.log('🎵 Audio context ready:', audioContext.state);
    return audioContext.state === 'running';
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
        console.log('✅ Connected to server');
        addToActivityLog(`Connecting to ${BACKEND_URL}...`);
        addToActivityLog('Connected to server, joining with callsign: ' + rangerCallsign);
        socket.emit('join', { callsign: rangerCallsign });
    });
    
    socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        addToActivityLog('Connection failed: ' + error.message);
        
        // If we were transmitting when connection failed, stop
        if (isTransmitting) {
            console.log('Connection failed during transmission - stopping');
            isTransmitting = false; // Set directly since we can't notify server
            updateStatus('OFFLINE');
            pttButton.classList.remove('transmitting');
        }
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
    
    socket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from server:', reason);
        isConnected = false;
        updateStatus('OFFLINE');
        addToActivityLog('Disconnected from radio network: ' + reason);
        
        // If we were transmitting when disconnected, clean up locally
        if (isTransmitting) {
            console.log('Disconnected during transmission - cleaning up');
            isTransmitting = false;
            pttButton.classList.remove('transmitting');
            
            // Clean up audio resources
            try {
                if (audioStream) {
                    audioStream.getTracks().forEach(track => track.stop());
                    audioStream = null;
                }
                if (audioProcessor) {
                    audioProcessor.disconnect();
                    audioProcessor = null;
                }
                if (microphoneSource) {
                    microphoneSource.disconnect();
                    microphoneSource = null;
                }
            } catch (e) {
                console.warn('Error cleaning up audio during disconnect:', e);
            }
        }
    });
    
    socket.on('transmission-start', (data) => {
        if (data.callsign !== rangerCallsign) {
            updateStatus('RECEIVING');
            addToActivityLog(`🎙️ ${data.callsign} started transmitting`);
            playAccessTone();
            console.log('Receiving transmission from:', data.callsign);
        } else {
            console.log('Our own transmission start confirmed by server');
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
            addToActivityLog(`📻 ${data.callsign} ended transmission`);
            playRogerBeep();
            setTimeout(() => playSquelchTail(), 200);
            console.log('Transmission ended from:', data.callsign);
        } else {
            console.log('Our own transmission end confirmed by server');
            updateStatus('READY');
        }
    });
    
    socket.on('channel-busy', () => {
        addToActivityLog('🚫 Channel busy - someone else is transmitting');
        playBusyTone();
        
        // Force stop our transmission attempt if we're trying to transmit
        if (isTransmitting) {
            console.log('Channel busy, stopping our transmission');
            stopTransmission();
        }
    });
    
    socket.on('channel-cleared', (data) => {
        addToActivityLog('🔧 ' + data.message);
        console.log('Channel cleared by admin:', data.message);
        
        // If we were somehow stuck transmitting, clear it
        if (isTransmitting) {
            console.log('Clearing stuck transmission due to channel clear');
            stopTransmission();
        }
    });
    
    socket.on('transmission-force-ended', (data) => {
        addToActivityLog(`⚠️ Your transmission was automatically ended: ${data.reason}`);
        console.log('Transmission force-ended by server:', data.reason);
        
        // Clean up our transmission state if we were transmitting
        if (isTransmitting) {
            console.log('Server force-ended our transmission, cleaning up local state');
            isTransmitting = false;
            updateStatus('READY');
            pttButton.classList.remove('transmitting');
            
            // Clear timeout
            if (transmissionTimeout) {
                clearTimeout(transmissionTimeout);
                transmissionTimeout = null;
            }
            
            // Clean up audio processing without sending another transmission-end
            if (audioProcessor) {
                try { audioProcessor.disconnect(); } catch (e) {}
                audioProcessor = null;
            }
            
            if (microphoneSource) {
                try { microphoneSource.disconnect(); } catch (e) {}
                microphoneSource = null;
            }
            
            if (audioStream) {
                try {
                    audioStream.getTracks().forEach(track => track.stop());
                } catch (e) {}
                audioStream = null;
            }
        }
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
    // Stop any active transmission first
    if (isTransmitting) {
        console.log('Stopping transmission before exiting network');
        stopTransmission();
    }
    
    // Stop microphone test if active
    if (micTestActive) {
        testMicrophone(); // This will stop the test
    }
    
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
    
    console.log('Exited radio network');
}

// Start transmission
async function startTransmission() {
    // Prevent multiple simultaneous transmissions
    if (!isConnected || isTransmitting) {
        console.log('Cannot start transmission:', !isConnected ? 'not connected' : 'already transmitting');
        return;
    }
    
    console.log('🎙️ Starting NEW transmission...');
    
    try {
        // Ensure audio context is ready
        const audioReady = await ensureAudioContextReady();
        if (!audioReady) {
            throw new Error('Audio context failed to start');
        }
        
        // Clean up any existing audio stream first
        if (audioStream) {
            console.log('Cleaning up existing audio stream...');
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        
        // Request fresh microphone access for this transmission
        console.log('Requesting fresh microphone access...');
        audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,  // Disable for radio realism
                noiseSuppression: false,  // Disable for radio realism
                autoGainControl: false,   // Disable for radio realism
                sampleRate: 44100
            } 
        });
        
        console.log('✅ Fresh microphone access granted');
        console.log('Audio stream tracks:', audioStream.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState,
            label: t.label
        })));
        
        // Set transmission state FIRST
        isTransmitting = true;
        updateStatus('TRANSMITTING');
        pttButton.classList.add('transmitting');
        
        // Set failsafe timeout to prevent stuck transmissions
        transmissionTimeout = setTimeout(() => {
            console.warn('⚠️ Transmission timeout reached, forcing stop');
            addToActivityLog('Transmission timeout - automatically stopped');
            stopTransmission();
        }, maxTransmissionTime);
        
        // Notify server
        socket.emit('transmission-start');
        
        // Play access tone
        playAccessTone();
        addToActivityLog(`🎙️ ${rangerCallsign} is transmitting`);
        
        // Start recording after access tone with fresh audio processing
        setTimeout(() => {
            if (isTransmitting && audioStream) {
                console.log('Starting fresh audio recording...');
                startRecording();
            } else {
                console.warn('Cannot start recording - transmission state changed or no audio stream');
            }
        }, 200);
        
    } catch (error) {
        console.error('❌ Microphone access error:', error);
        addToActivityLog('Error: Unable to access microphone - ' + error.message);
        alert('Unable to access microphone. Please check permissions: ' + error.message);
        
        // Clean up on error
        isTransmitting = false;
        updateStatus('READY');
        pttButton.classList.remove('transmitting');
        
        if (transmissionTimeout) {
            clearTimeout(transmissionTimeout);
            transmissionTimeout = null;
        }
    }
}

// Start recording audio
function startRecording() {
    if (!audioStream || !audioContext) {
        console.error('Missing audioStream or audioContext for recording');
        return;
    }
    
    try {
        console.log('Setting up NEW audio processing for recording...');
        
        // ALWAYS create fresh audio processing nodes
        if (microphoneSource) {
            console.log('Cleaning up existing microphone source');
            try {
                microphoneSource.disconnect();
            } catch (e) {
                console.warn('Error disconnecting old mic source:', e);
            }
            microphoneSource = null;
        }
        
        if (audioProcessor) {
            console.log('Cleaning up existing audio processor');
            try {
                audioProcessor.disconnect();
            } catch (e) {
                console.warn('Error disconnecting old processor:', e);
            }
            audioProcessor = null;
        }
        
        // Create fresh microphone source
        microphoneSource = audioContext.createMediaStreamSource(audioStream);
        console.log('Created new microphone source');
        
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
        
        // Create NEW script processor for real-time audio processing
        audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        console.log('Created new audio processor');
        
        let audioDataCount = 0;
        let totalAudioSent = 0;
        
        audioProcessor.onaudioprocess = (event) => {
            if (!isTransmitting) {
                console.log('Not transmitting, skipping audio processing');
                return;
            }
            
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            // Calculate audio level for debugging
            let sum = 0;
            let maxSample = 0;
            for (let i = 0; i < inputData.length; i++) {
                const abs = Math.abs(inputData[i]);
                sum += abs;
                maxSample = Math.max(maxSample, abs);
            }
            const avgLevel = sum / inputData.length;
            
            // Check if we're getting actual audio data (lower threshold)
            const hasAudio = maxSample > 0.001; // Use max sample instead of any sample
            
            audioDataCount++;
            if (hasAudio) {
                totalAudioSent++;
            }
            
            if (audioDataCount % 50 === 0) { // Log every 50 chunks
                console.log(`📊 Audio chunk ${audioDataCount} - Avg: ${avgLevel.toFixed(6)}, Max: ${maxSample.toFixed(6)}, Voice: ${hasAudio}, Total voice chunks: ${totalAudioSent}`);
            }
            
            // Convert to 16-bit PCM
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                // Convert float (-1 to 1) to 16-bit integer
                const sample = Math.max(-1, Math.min(1, inputData[i]));
                pcmData[i] = sample * 32767;
            }
            
            // Store audio data for recording history
            if (currentRecording) {
                currentRecording.audioData.push(...Array.from(pcmData));
            }
            
            // Send audio data in real-time (always send to maintain connection)
            if (socket && isConnected) {
                socket.emit('audio-data', {
                    audio: Array.from(pcmData),
                    sampleRate: audioContext.sampleRate,
                    hasAudio: hasAudio,
                    debugLevel: avgLevel,
                    maxLevel: maxSample,
                    chunkNumber: audioDataCount
                });
            }
        };
        
        // Connect the audio processing chain with fresh connections
        console.log('Connecting audio processing chain...');
        microphoneSource.connect(audioProcessor);
        
        // Connect to a gain node to keep the processor active but silent
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0.0001; // Very quiet but not zero to keep processor active
        audioProcessor.connect(silentGain);
        silentGain.connect(audioContext.destination);
        
        console.log('✅ Real-time audio streaming started with fresh processors');
        addToActivityLog('🎤 Audio processing active');
        
    } catch (error) {
        console.error('❌ Audio processing setup error:', error);
        addToActivityLog('Error setting up audio processing: ' + error.message);
    }
}

// Stop transmission
function stopTransmission() {
    // Only proceed if we're actually transmitting
    if (!isTransmitting) {
        console.log('Stop transmission called but not currently transmitting');
        return;
    }
    
    console.log('🛑 Stopping transmission...');
    
    // Clear failsafe timeout first
    if (transmissionTimeout) {
        clearTimeout(transmissionTimeout);
        transmissionTimeout = null;
        console.log('Cleared transmission timeout');
    }
    
    // Set state FIRST to prevent race conditions and multiple calls
    isTransmitting = false;
    updateStatus('READY');
    pttButton.classList.remove('transmitting');
    
    // IMMEDIATELY notify server we're stopping - this is critical
    if (socket && isConnected) {
        console.log('📡 Sending transmission-end to server');
        socket.emit('transmission-end');
    } else {
        console.warn('⚠️ Cannot send transmission-end - socket not connected');
    }
    
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
    
    // Clean up audio processing (do this AFTER notifying server)
    console.log('🧹 Cleaning up audio processing...');
    
    if (audioProcessor) {
        try {
            audioProcessor.disconnect();
            console.log('Disconnected audio processor');
        } catch (e) {
            console.warn('Error disconnecting audio processor:', e);
        }
        audioProcessor = null;
    }
    
    if (microphoneSource) {
        try {
            microphoneSource.disconnect();
            console.log('Disconnected microphone source');
        } catch (e) {
            console.warn('Error disconnecting microphone source:', e);
        }
        microphoneSource = null;
    }
    
    // Stop audio stream last
    if (audioStream) {
        try {
            audioStream.getTracks().forEach(track => {
                track.stop();
                console.log('Stopped audio track:', track.kind, track.readyState);
            });
        } catch (e) {
            console.warn('Error stopping audio tracks:', e);
        }
        audioStream = null;
    }
    
    // Play roger beep and squelch tail
    playRogerBeep();
    setTimeout(() => {
        playSquelchTail();
    }, 200);
    
    addToActivityLog(`${rangerCallsign} ended transmission`);
    console.log('✅ Transmission stopped successfully');
}

// Update status indicator
function updateStatus(status) {
    statusIndicator.textContent = status;
    statusIndicator.className = 'status-indicator status-' + status.toLowerCase();
    
    // Show/hide transmission indicator
    if (status === 'TRANSMITTING') {
        transmissionIndicator.classList.add('active');
    } else {
        transmissionIndicator.classList.remove('active');
    }
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
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        gainNode.gain.value = volume * (volumeSlider.value / 100);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
        
    } catch (error) {
        console.error('Error playing tone:', error);
    }
}

// Helper function to play noise
function playNoise(duration, volume) {
    if (!audioContext) return;
    
    try {
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
        
    } catch (error) {
        console.error('Error playing noise:', error);
    }
}

// Play received audio
async function playReceivedAudio(audioData) {
    if (!audioContext) {
        console.error('❌ No audio context for playback');
        return;
    }
    
    try {
        // Ensure audio context is running before trying to play
        if (audioContext.state === 'suspended') {
            console.log('🎵 Resuming audio context for playback...');
            await audioContext.resume();
        }
        
        const audioLength = audioData.audio.length;
        const hasAudioFlag = audioData.hasAudio;
        const maxLevel = audioData.maxLevel || 0;
        const chunkNumber = audioData.chunkNumber || 0;
        
        console.log(`🔊 Received from ${audioData.callsign}: Chunk #${chunkNumber}, Length: ${audioLength}, HasAudio: ${hasAudioFlag}, MaxLevel: ${maxLevel?.toFixed(6)}`);
        
        // Convert received PCM data back to audio buffer
        const pcmArray = new Int16Array(audioData.audio);
        const sampleRate = audioData.sampleRate || 44100;
        
        // Calculate the actual audio levels in the received data
        let receivedSum = 0;
        let receivedMax = 0;
        for (let i = 0; i < pcmArray.length; i++) {
            const abs = Math.abs(pcmArray[i]);
            receivedSum += abs;
            receivedMax = Math.max(receivedMax, abs);
        }
        const receivedAvg = receivedSum / pcmArray.length;
        const normalizedMax = receivedMax / 32767;
        
        console.log(`🎵 Received audio levels - Avg: ${receivedAvg.toFixed(1)}, Max: ${receivedMax} (${normalizedMax.toFixed(6)} normalized)`);
        
        // Create audio buffer
        const audioBuffer = audioContext.createBuffer(1, pcmArray.length, sampleRate);
        const bufferData = audioBuffer.getChannelData(0);
        
        // Convert 16-bit PCM back to float
        for (let i = 0; i < pcmArray.length; i++) {
            bufferData[i] = pcmArray[i] / 32767;
        }
        
        // Create source and play
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.value = volumeSlider.value / 100;
        
        source.start();
        
        console.log(`🎶 Playing audio from ${audioData.callsign}, volume: ${gainNode.gain.value.toFixed(2)}`);
        
        // Log when we have significant audio content
        if (normalizedMax > 0.01) {
            console.log(`🗣️ Playing meaningful audio from ${audioData.callsign} (${normalizedMax.toFixed(3)} level)`);
            addToActivityLog(`🔊 Receiving audio from ${audioData.callsign} (${normalizedMax.toFixed(3)} level)`);
        }
        
    } catch (error) {
        console.error('❌ Audio playback error:', error);
        addToActivityLog('Error playing received audio: ' + error.message);
    }
}

// Set master volume
function setMasterVolume(value) {
    console.log('Master volume set to:', value);
    // Store volume setting
    localStorage.setItem('rangerRadioVolume', value);
}

// Test audio playback
function playTestTone() {
    console.log('🔧 Playing test tone to verify audio...');
    try {
        playTone(800, 0.1, 0.3);
    } catch (error) {
        console.error('Test tone failed:', error);
    }
}

// Debug function to test audio context
window.testAudioContext = function() {
    console.log('🔧 Audio Context Debug Info:');
    console.log('- Audio Context:', audioContext);
    console.log('- State:', audioContext?.state);
    console.log('- Sample Rate:', audioContext?.sampleRate);
    console.log('- Current Time:', audioContext?.currentTime);
    console.log('- Volume Slider:', volumeSlider?.value);
    
    if (audioContext) {
        playTestTone();
    } else {
        console.error('No audio context available');
    }
};

// Debug function to test received audio simulation
window.testReceivedAudio = function() {
    console.log('🔧 Testing received audio simulation...');
    
    // Create fake audio data for testing
    const testPCM = new Array(4096);
    for (let i = 0; i < testPCM.length; i++) {
        // Generate a simple sine wave
        testPCM[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 16383; // 440Hz tone
    }
    
    const fakeAudioData = {
        callsign: 'TEST',
        audio: testPCM,
        sampleRate: 44100,
        hasAudio: true,
        maxLevel: 0.5,
        chunkNumber: 1
    };
    
    playReceivedAudio(fakeAudioData);
};

// Apply radio effects (simplified version)
function applyRadioEffects(audioData) {
    // This is a placeholder for radio effects
    // In a real implementation, you would apply compression,
    // filtering, and distortion to simulate radio audio
    return audioData;
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
    
    // Only save if there's meaningful audio content OR if it's a reasonably long transmission
    const hasSignificantAudio = data.hasAudio || data.audio.length > 8192; // Save if has audio or longer than 8k samples
    
    if (!hasSignificantAudio) return;
    
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

// Test microphone functionality
async function testMicrophone() {
    if (micTestActive) {
        // Stop mic test
        if (micTestProcessor) {
            micTestProcessor.disconnect();
            micTestProcessor = null;
        }
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        micTestActive = false;
        micTestButton.textContent = '🎤 Test Microphone';
        micLevelIndicator.style.width = '0%';
        micLevelIndicator.style.backgroundColor = '#ddd';
        return;
    }
    
    try {
        // Resume audio context if needed
        if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            } 
        });
        
        const micSource = audioContext.createMediaStreamSource(audioStream);
        micTestProcessor = audioContext.createScriptProcessor(1024, 1, 1);
        
        micTestProcessor.onaudioprocess = (event) => {
            const inputData = event.inputBuffer.getChannelData(0);
            
            // Calculate RMS (Root Mean Square) for volume level
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);
            const level = Math.min(rms * 1000, 100); // Scale and cap at 100%
            
            // Update visual indicator
            micLevelIndicator.style.width = level + '%';
            micLevelIndicator.style.backgroundColor = level > 50 ? '#e74c3c' : level > 20 ? '#f39c12' : '#27ae60';
        };
        
        micSource.connect(micTestProcessor);
        const dummyGain = audioContext.createGain();
        dummyGain.gain.value = 0;
        micTestProcessor.connect(dummyGain);
        dummyGain.connect(audioContext.destination);
        
        micTestActive = true;
        micTestButton.textContent = '⏹️ Stop Test';
        addToActivityLog('Microphone test active - speak to see levels');
        
    } catch (error) {
        console.error('Microphone test error:', error);
        addToActivityLog('Microphone test failed: ' + error.message);
        alert('Unable to access microphone for testing: ' + error.message);
    }
}

// Monitor connection health
function startConnectionMonitoring() {
    setInterval(() => {
        // Check if we think we're connected but socket is actually disconnected
        if (isConnected && socket && !socket.connected) {
            console.warn('⚠️ Connection state mismatch detected - we think we\'re connected but socket is disconnected');
            isConnected = false;
            updateStatus('OFFLINE');
            
            // If transmitting, stop it
            if (isTransmitting) {
                console.log('Connection lost during transmission - stopping');
                stopTransmission();
            }
        }
        
        // Check if we're transmitting but have no audio stream
        if (isTransmitting && !audioStream) {
            console.warn('⚠️ Transmitting but no audio stream - stopping transmission');
            stopTransmission();
        }
        
    }, 2000); // Check every 2 seconds
}