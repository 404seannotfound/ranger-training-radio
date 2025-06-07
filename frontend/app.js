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

// Audio device selection
let selectedMicrophoneId = null;
let selectedSpeakerId = null;
let audioOutputElement = null; // For setting sink ID

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

// Audio device selection elements
const microphoneSelect = document.getElementById('microphone-select');
const speakerSelect = document.getElementById('speaker-select');
const refreshDevicesButton = document.getElementById('refresh-devices-button');

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
    
    // Load available audio devices
    loadAudioDevices();
    
    // Show mobile-specific guidance if needed
    setTimeout(() => {
        showMobileAudioGuidance();
    }, 1000); // Delay to let device loading complete
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
    
    // Audio device selection
    microphoneSelect.addEventListener('change', (e) => {
        selectedMicrophoneId = e.target.value;
        addToActivityLog(`🎤 Selected microphone: ${e.target.options[e.target.selectedIndex].text}`);
        console.log('Selected microphone ID:', selectedMicrophoneId);
    });
    
    speakerSelect.addEventListener('change', async (e) => {
        selectedSpeakerId = e.target.value;
        addToActivityLog(`🔊 Selected speaker: ${e.target.options[e.target.selectedIndex].text}`);
        console.log('Selected speaker ID:', selectedSpeakerId);
        
        // Update audio output if supported
        await updateAudioOutput();
    });
    
    refreshDevicesButton.addEventListener('click', () => {
        addToActivityLog('🔄 Refreshing audio devices...');
        loadAudioDevices();
    });
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
        const audioConstraints = {
            echoCancellation: false,  // Disable for radio realism
            noiseSuppression: false,  // Disable for radio realism
            autoGainControl: false,   // Disable for radio realism
            sampleRate: 44100
        };
        
        // Use selected microphone if available
        if (selectedMicrophoneId) {
            audioConstraints.deviceId = { exact: selectedMicrophoneId };
            console.log('Using selected microphone:', selectedMicrophoneId);
        }
        
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        
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
    
    // Keep log from getting too long (remove old entries)
    while (activityLog.children.length > 100) {
        activityLog.removeChild(activityLog.firstChild);
    }
}

// Function to clear the activity log (exposed globally for easy access)
window.clearLog = function() {
    activityLog.innerHTML = '';
    addToActivityLog('🧹 Activity log cleared');
    console.log('Activity log cleared');
};

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
    if (!audioContext) {
        const errorMsg = '❌ No audio context for tone playback';
        console.warn(errorMsg);
        addToActivityLog(errorMsg);
        return;
    }
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        gainNode.gain.value = volume * (volumeSlider.value / 100);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
        
        console.log(`🎵 Playing tone: ${frequency}Hz`);
        
    } catch (error) {
        console.error('Error playing tone:', error);
        addToActivityLog(`❌ Tone playback error: ${error.message}`);
    }
}

// Helper function to play noise
function playNoise(duration, volume) {
    if (!audioContext) {
        const errorMsg = '❌ No audio context for noise playback';
        console.warn(errorMsg);
        addToActivityLog(errorMsg);
        return;
    }
    
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
        
        console.log(`🔊 Playing noise for ${duration}s`);
        
    } catch (error) {
        console.error('Error playing noise:', error);
        addToActivityLog(`❌ Noise playback error: ${error.message}`);
    }
}

// Play received audio
async function playReceivedAudio(audioData) {
    const debugInfo = {
        hasAudioContext: !!audioContext,
        audioContextState: audioContext?.state,
        audioDataLength: audioData?.audio?.length,
        callsign: audioData?.callsign,
        volumeSliderValue: volumeSlider?.value
    };
    
    console.log('🔍 DEBUG: playReceivedAudio called with:', debugInfo);
    addToActivityLog(`🔍 DEBUG: Receiving audio from ${audioData?.callsign}, length: ${audioData?.audio?.length}, volume: ${volumeSlider?.value}%`);
    
    if (!audioContext) {
        const errorMsg = '❌ No audio context for playback';
        console.error(errorMsg);
        addToActivityLog(errorMsg);
        return;
    }
    
    try {
        // Ensure audio context is running before trying to play
        if (audioContext.state === 'suspended') {
            console.log('🎵 Audio context suspended, attempting to resume...');
            addToActivityLog('🎵 Audio context suspended, attempting to resume...');
            await audioContext.resume();
            console.log('🎵 Audio context resume result:', audioContext.state);
            addToActivityLog(`🎵 Audio context resume result: ${audioContext.state}`);
        }
        
        const audioLength = audioData.audio.length;
        const hasAudioFlag = audioData.hasAudio;
        const maxLevel = audioData.maxLevel || 0;
        const chunkNumber = audioData.chunkNumber || 0;
        
        console.log(`🔊 Received from ${audioData.callsign}: Chunk #${chunkNumber}, Length: ${audioLength}, HasAudio: ${hasAudioFlag}, MaxLevel: ${maxLevel?.toFixed(6)}`);
        
        // Convert received PCM data back to audio buffer
        const pcmArray = new Int16Array(audioData.audio);
        const sampleRate = audioData.sampleRate || 44100;
        
        const bufferDebug = {
            pcmArrayLength: pcmArray.length,
            sampleRate: sampleRate,
            audioContextSampleRate: audioContext.sampleRate
        };
        console.log('🔍 DEBUG: Creating audio buffer...', bufferDebug);
        addToActivityLog(`🔍 Creating audio buffer: ${pcmArray.length} samples at ${sampleRate}Hz`);
        
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
        addToActivityLog(`🎵 Audio levels - Max: ${normalizedMax.toFixed(4)} (${receivedMax > 1000 ? 'Good' : 'Low'} signal)`);
        
        // Create audio buffer
        console.log('🔍 DEBUG: Creating AudioBuffer...');
        const audioBuffer = audioContext.createBuffer(1, pcmArray.length, sampleRate);
        const bufferData = audioBuffer.getChannelData(0);
        
        console.log('🔍 DEBUG: AudioBuffer created successfully, duration:', audioBuffer.duration, 'seconds');
        addToActivityLog(`🔍 Audio buffer created: ${audioBuffer.duration.toFixed(2)}s duration`);
        
        // Convert 16-bit PCM back to float
        for (let i = 0; i < pcmArray.length; i++) {
            bufferData[i] = pcmArray[i] / 32767;
        }
        
        console.log('🔍 DEBUG: PCM data converted to float');
        
        // Create source and play
        console.log('🔍 DEBUG: Creating audio source and gain node...');
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = audioBuffer;
        source.connect(gainNode);
        
        // Connect to selected output device if available and supported
        if (selectedSpeakerId && audioOutputElement && typeof audioOutputElement.setSinkId === 'function') {
            // Create a MediaStreamDestination to route audio to selected device
            const destination = audioContext.createMediaStreamDestination();
            gainNode.connect(destination);
            
            // Play through the selected audio device
            audioOutputElement.srcObject = destination.stream;
            audioOutputElement.play().catch(e => console.warn('Audio element play failed:', e));
            
            console.log('🔍 DEBUG: Audio routed to selected output device');
        } else if (selectedSpeakerId && (selectedSpeakerId === 'mobile-speaker' || selectedSpeakerId === 'mobile-earpiece')) {
            // Handle mobile-specific speaker routing with actual audio element routing
            const destination = audioContext.createMediaStreamDestination();
            gainNode.connect(destination);
            
            // Create or get the appropriate audio element for mobile routing
            let audioElement = document.getElementById(`audio-output-${selectedSpeakerId}`);
            if (!audioElement) {
                audioElement = document.createElement('audio');
                audioElement.id = `audio-output-${selectedSpeakerId}`;
                audioElement.style.display = 'none';
                
                // Configure audio element for different mobile outputs
                if (selectedSpeakerId === 'mobile-speaker') {
                    // Configure for speakerphone
                    audioElement.setAttribute('playsinline', 'true');
                    audioElement.setAttribute('webkit-playsinline', 'true');
                    audioElement.volume = 1.0;
                    
                    // Try to force speaker mode (Android specific)
                    if (navigator.userAgent.includes('Android')) {
                        audioElement.setAttribute('data-android-speaker', 'true');
                    }
                    
                    console.log('🔍 DEBUG: Configured audio element for mobile speaker');
                    addToActivityLog('📢 Routing to speakerphone');
                } else {
                    // Configure for earpiece
                    audioElement.setAttribute('playsinline', 'true');
                    audioElement.setAttribute('webkit-playsinline', 'true');
                    audioElement.volume = 0.8; // Lower volume for earpiece
                    
                    console.log('🔍 DEBUG: Configured audio element for mobile earpiece');
                    addToActivityLog('📞 Routing to earpiece');
                }
                
                document.body.appendChild(audioElement);
            }
            
            // Route audio through the configured element
            audioElement.srcObject = destination.stream;
            
            // Add event listeners for better debugging
            audioElement.onloadstart = () => {
                console.log(`Mobile audio loading on ${selectedSpeakerId}`);
            };
            
            audioElement.oncanplay = () => {
                console.log(`Mobile audio ready on ${selectedSpeakerId}`);
            };
            
            audioElement.onerror = (error) => {
                console.error(`Mobile audio error on ${selectedSpeakerId}:`, error);
                addToActivityLog(`❌ Mobile audio error: ${error.message || 'Unknown error'}`);
            };
            
            // Start playback
            audioElement.play().then(() => {
                console.log(`✅ Mobile audio playing on ${selectedSpeakerId}`);
                addToActivityLog(`🎵 Audio playing via ${selectedSpeakerId === 'mobile-speaker' ? 'speaker' : 'earpiece'}`);
            }).catch(error => {
                console.error('Mobile audio play failed:', error);
                addToActivityLog(`❌ Audio playback failed: ${error.message}`);
                
                // Fallback to default output
                gainNode.disconnect();
                gainNode.connect(audioContext.destination);
                addToActivityLog('🔄 Falling back to default audio output');
            });
            
            console.log('🔍 DEBUG: Audio routed to mobile device via audio element');
        } else {
            // Use default audio context destination
            gainNode.connect(audioContext.destination);
            console.log('🔍 DEBUG: Audio routed to default output');
        }
        
        const volume = volumeSlider.value / 100;
        gainNode.gain.value = volume;
        
        const playbackDebug = {
            volume: volume,
            gainValue: gainNode.gain.value,
            audioContextTime: audioContext.currentTime,
            bufferDuration: audioBuffer.duration
        };
        console.log('🔍 DEBUG: Audio chain connected, starting playback...', playbackDebug);
        addToActivityLog(`🔍 Starting playback: Volume ${(volume * 100).toFixed(0)}%, Duration ${audioBuffer.duration.toFixed(2)}s`);
        
        // Add event listeners for debugging
        source.onended = () => {
            console.log('🔍 DEBUG: Audio source ended successfully');
            addToActivityLog(`✅ Audio from ${audioData.callsign} finished playing`);
        };
        
        source.onerror = (error) => {
            console.error('🔍 DEBUG: Audio source error:', error);
            addToActivityLog(`❌ Audio playback error from ${audioData.callsign}: ${error}`);
        };
        
        source.start();
        
        console.log(`🎶 STARTED playing audio from ${audioData.callsign}, volume: ${gainNode.gain.value.toFixed(2)}`);
        addToActivityLog(`🎶 PLAYING audio from ${audioData.callsign} (Vol: ${(gainNode.gain.value * 100).toFixed(0)}%)`);
        
        // Log when we have significant audio content
        if (normalizedMax > 0.01) {
            console.log(`🗣️ Playing meaningful audio from ${audioData.callsign} (${normalizedMax.toFixed(3)} level)`);
            addToActivityLog(`🗣️ Strong audio signal from ${audioData.callsign}`);
        } else if (normalizedMax > 0.001) {
            console.warn(`⚠️ Playing quiet audio from ${audioData.callsign} (${normalizedMax.toFixed(6)} level)`);
            addToActivityLog(`⚠️ Weak audio signal from ${audioData.callsign} - check microphone`);
        } else {
            console.warn(`⚠️ Playing very quiet audio from ${audioData.callsign} (${normalizedMax.toFixed(6)} level)`);
            addToActivityLog(`⚠️ Very weak/silent audio from ${audioData.callsign}`);
        }
        
    } catch (error) {
        const errorDetails = {
            name: error.name,
            message: error.message,
            stack: error.stack
        };
        console.error('❌ Audio playback error:', error);
        console.error('❌ Error details:', errorDetails);
        addToActivityLog(`❌ Audio playback error: ${error.message}`);
        addToActivityLog(`❌ Error type: ${error.name}`);
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
    
    // Also log to activity log
    addToActivityLog('🔧 Testing Audio Context...');
    addToActivityLog(`Audio Context State: ${audioContext?.state || 'None'}`);
    addToActivityLog(`Sample Rate: ${audioContext?.sampleRate || 'Unknown'}`);
    addToActivityLog(`Volume: ${volumeSlider?.value || 'Unknown'}%`);
    
    if (audioContext) {
        addToActivityLog('🎵 Playing test tone...');
        playTestTone();
    } else {
        const errorMsg = '❌ No audio context available';
        console.error(errorMsg);
        addToActivityLog(errorMsg);
    }
};

// Debug function to check if user needs to interact with page first
window.checkAudioReady = function() {
    console.log('🔧 Checking audio readiness...');
    console.log('- Audio Context State:', audioContext?.state);
    console.log('- Volume Slider:', volumeSlider?.value);
    
    addToActivityLog('🔧 Checking audio readiness...');
    addToActivityLog(`Audio Context: ${audioContext?.state || 'None'}`);
    addToActivityLog(`Volume: ${volumeSlider?.value || 'Unknown'}%`);
    
    if (audioContext?.state === 'suspended') {
        const warningMsg = '⚠️ Audio context is suspended. User interaction may be needed.';
        console.log(warningMsg);
        addToActivityLog(warningMsg);
        addToActivityLog('Try clicking anywhere on the page, then run testReceivedAudio()');
    } else {
        console.log('✅ Audio context ready, running test...');
        addToActivityLog('✅ Audio context ready, running test...');
        window.testReceivedAudio();
    }
};

// Debug function to test received audio simulation
window.testReceivedAudio = function() {
    console.log('🔧 Testing received audio simulation...');
    addToActivityLog('🔧 Testing received audio simulation...');
    
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
    
    console.log('🔧 Calling playReceivedAudio with test data...');
    addToActivityLog('🔧 Simulating received audio (440Hz test tone)...');
    playReceivedAudio(fakeAudioData);
};

// Mobile-specific debug function
window.debugMobileAudio = function() {
    const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    console.log('📱 Mobile Audio Debug:');
    addToActivityLog('📱 Mobile Audio Debug:');
    
    console.log('- Is Mobile:', isMobile);
    addToActivityLog(`- Device Type: ${isMobile ? 'Mobile' : 'Desktop'}`);
    
    console.log('- User Agent:', navigator.userAgent);
    addToActivityLog(`- Browser: ${navigator.userAgent.split(' ').pop()}`);
    
    console.log('- Audio Context State:', audioContext?.state);
    addToActivityLog(`- Audio Context: ${audioContext?.state || 'None'}`);
    
    console.log('- Volume:', volumeSlider?.value);
    addToActivityLog(`- Volume: ${volumeSlider?.value || 'Unknown'}%`);
    
    // Test basic audio playback
    if (audioContext) {
        addToActivityLog('🔊 Testing basic audio playback...');
        playTone(800, 0.5, 0.5); // Longer, louder tone for mobile
    }
    
    // Check media devices API support
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        addToActivityLog('✅ Media Devices API supported');
        
        navigator.mediaDevices.enumerateDevices().then(devices => {
            addToActivityLog(`📱 Devices found: ${devices.length}`);
            devices.forEach((device, index) => {
                addToActivityLog(`  ${index + 1}. ${device.kind}: ${device.label || 'Unnamed'}`);
            });
        }).catch(error => {
            addToActivityLog(`❌ Device enumeration failed: ${error.message}`);
        });
    } else {
        addToActivityLog('❌ Media Devices API not supported');
    }
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
        const micConstraints = {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        };
        
        // Use selected microphone if available
        if (selectedMicrophoneId) {
            micConstraints.deviceId = { exact: selectedMicrophoneId };
            console.log('Testing selected microphone:', selectedMicrophoneId);
        }
        
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints });
        
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

// Load and populate audio device lists
async function loadAudioDevices() {
    try {
        // Check if we're on mobile
        const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            console.log('Mobile device detected, attempting device enumeration...');
            addToActivityLog('📱 Mobile device detected - checking available audio devices...');
        }
        
        // Always try to request permissions and enumerate devices (desktop and mobile)
        let permissionStream = null;
        try {
            permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (permError) {
            console.warn('Permission request failed:', permError);
            addToActivityLog('⚠️ Microphone permission needed for device detection');
        }
        
        // Get list of all media devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        console.log('Raw devices found:', devices);
        
        // Filter devices and check if we got proper device info
        const microphones = devices.filter(device => device.kind === 'audioinput');
        const speakers = devices.filter(device => device.kind === 'audiooutput');
        
        console.log('Microphones found:', microphones);
        console.log('Speakers found:', speakers);
        
        // Check if devices have labels (indicates proper permissions)
        const hasLabels = microphones.some(device => device.label) || speakers.some(device => device.label);
        
        if (!hasLabels && (microphones.length > 0 || speakers.length > 0)) {
            addToActivityLog('⚠️ Device permissions needed - some devices may not show names');
        }
        
        // For mobile, add common mobile audio options if no devices found
        if (isMobile && speakers.length === 0) {
            addToActivityLog('📱 Adding mobile speaker options...');
            
            // Create virtual speaker options for mobile
            const mobileAudioOptions = [
                { deviceId: 'mobile-speaker', label: '📢 Speaker (Speakerphone)', kind: 'audiooutput' },
                { deviceId: 'mobile-earpiece', label: '📞 Earpiece', kind: 'audiooutput' }
            ];
            
            speakers.push(...mobileAudioOptions);
        }
        
        // Populate dropdowns
        populateDeviceSelect(microphoneSelect, microphones, 'microphone');
        populateDeviceSelect(speakerSelect, speakers, 'speaker');
        
        addToActivityLog(`✅ Found ${microphones.length} microphones and ${speakers.length} speakers`);
        
        if (isMobile) {
            addToActivityLog('📱 Mobile tip: Try different speaker options to find best audio');
        }
        
        // Clean up permission stream
        if (permissionStream) {
            permissionStream.getTracks().forEach(track => track.stop());
        }
        
        // If no devices found, provide helpful message
        if (microphones.length === 0 && speakers.length === 0) {
            addToActivityLog('⚠️ No audio devices detected - using system defaults');
        }
        
    } catch (error) {
        console.error('Error loading audio devices:', error);
        
        // Provide more specific error messages
        if (error.name === 'NotAllowedError') {
            addToActivityLog('❌ Microphone permission denied - cannot enumerate devices');
        } else if (error.name === 'NotFoundError') {
            addToActivityLog('❌ No audio devices found on this system');
        } else {
            addToActivityLog(`❌ Failed to load audio devices: ${error.message}`);
        }
        
        // Fallback options with mobile considerations
        const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        microphoneSelect.innerHTML = '<option value="">Default Microphone</option>';
        
        if (isMobile) {
            speakerSelect.innerHTML = `
                <option value="">Default Speaker</option>
                <option value="mobile-speaker">📢 Speaker (Speakerphone)</option>
                <option value="mobile-earpiece">📞 Earpiece</option>
            `;
        } else {
            speakerSelect.innerHTML = '<option value="">Default Speaker</option>';
        }
    }
}

// Populate device select dropdown
function populateDeviceSelect(selectElement, devices, deviceType) {
    selectElement.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = `Default ${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}`;
    selectElement.appendChild(defaultOption);
    
    // Add each device
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} ${devices.indexOf(device) + 1}`;
        selectElement.appendChild(option);
    });
    
    console.log(`Populated ${deviceType} select with ${devices.length} devices`);
}

// Update audio output device
async function updateAudioOutput() {
    try {
        if (!selectedSpeakerId) {
            console.log('Using default audio output');
            return;
        }
        
        // Create or get audio element for output device control
        if (!audioOutputElement) {
            audioOutputElement = document.createElement('audio');
            audioOutputElement.style.display = 'none';
            document.body.appendChild(audioOutputElement);
        }
        
        // Check if setSinkId is supported
        if (typeof audioOutputElement.setSinkId === 'function') {
            await audioOutputElement.setSinkId(selectedSpeakerId);
            console.log('Audio output device updated to:', selectedSpeakerId);
            addToActivityLog('✅ Audio output device updated');
        } else {
            console.warn('setSinkId not supported - using default output');
            addToActivityLog('⚠️ Device selection not fully supported by browser');
        }
        
    } catch (error) {
        console.error('Error updating audio output:', error);
        addToActivityLog(`❌ Failed to update audio output: ${error.message}`);
    }
}

// Provide mobile-specific audio guidance
function showMobileAudioGuidance() {
    const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        // Add mobile-specific guidance to activity log
        addToActivityLog('📱 Mobile Audio Setup Guide:');
        addToActivityLog('• 📢 Speaker = Loud speakerphone mode');
        addToActivityLog('• 📞 Earpiece = Quiet phone call mode');
        addToActivityLog('• Test both options to see which works');
        addToActivityLog('• For iOS: May need to adjust phone volume');
        addToActivityLog('• For Android: Try silent/vibrate mode off');
        
        // Add specific mobile audio tips based on platform
        if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
            addToActivityLog('🍎 iOS Tips:');
            addToActivityLog('• Use Control Center volume slider');
            addToActivityLog('• Turn off "Silent Mode" switch');
            addToActivityLog('• Try connecting Bluetooth headphones');
        } else if (navigator.userAgent.includes('Android')) {
            addToActivityLog('🤖 Android Tips:');
            addToActivityLog('• Check media volume (not ringer volume)');
            addToActivityLog('• Try speaker option for louder audio');
            addToActivityLog('• Disable battery optimization for browser');
        }
        
        // Update the audio devices section with mobile info
        const audioDevicesSection = document.querySelector('.audio-devices-section');
        if (audioDevicesSection) {
            const mobileInfo = document.createElement('div');
            mobileInfo.className = 'mobile-audio-info';
            mobileInfo.innerHTML = `
                <p><strong>📱 Mobile Audio Control</strong></p>
                <div style="margin: 10px 0;">
                    <button id="mobile-audio-test" style="padding: 8px 12px; margin-right: 10px; background: #3498db; color: white; border: none; border-radius: 4px;">
                        🔊 Test Audio Output
                    </button>
                    <button id="mobile-volume-check" style="padding: 8px 12px; background: #27ae60; color: white; border: none; border-radius: 4px;">
                        📱 Check Volume
                    </button>
                </div>
                <div style="font-size: 12px; color: #666;">
                    <p><strong>📢 Speaker:</strong> Loud speakerphone mode</p>
                    <p><strong>📞 Earpiece:</strong> Phone call mode (quieter)</p>
                    <p><strong>🎧 Tip:</strong> Wired headphones often work best</p>
                </div>
            `;
            mobileInfo.style.marginTop = '10px';
            mobileInfo.style.padding = '10px';
            mobileInfo.style.background = '#e8f5e8';
            mobileInfo.style.border = '1px solid #a8d8a8';
            mobileInfo.style.borderRadius = '4px';
            mobileInfo.style.fontSize = '14px';
            
            audioDevicesSection.appendChild(mobileInfo);
            
            // Add event listeners for mobile test buttons
            document.getElementById('mobile-audio-test').addEventListener('click', testMobileAudio);
            document.getElementById('mobile-volume-check').addEventListener('click', showVolumeInstructions);
        }
    }
}

// Test mobile audio output
function testMobileAudio() {
    addToActivityLog('🔊 Testing mobile audio output...');
    
    // Play a longer, more obvious test tone
    if (audioContext) {
        // Create a more complex test sound for mobile
        const duration = 2; // 2 seconds
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        
        // Create a beep pattern: 800Hz for 0.3s, silence for 0.2s, 400Hz for 0.3s
        for (let i = 0; i < buffer.length; i++) {
            const time = i / sampleRate;
            let frequency = 0;
            
            if (time < 0.3) {
                frequency = 800; // High beep
            } else if (time < 0.5) {
                frequency = 0; // Silence
            } else if (time < 0.8) {
                frequency = 400; // Low beep
            } else if (time < 1.0) {
                frequency = 0; // Silence
            } else if (time < 1.3) {
                frequency = 600; // Medium beep
            }
            
            if (frequency > 0) {
                data[i] = Math.sin(2 * Math.PI * frequency * time) * 0.3;
            } else {
                data[i] = 0;
            }
        }
        
        // Play using the same routing logic as received audio
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = buffer;
        source.connect(gainNode);
        
        const volume = volumeSlider.value / 100;
        gainNode.gain.value = volume;
        
        // Use the same mobile routing logic
        if (selectedSpeakerId && (selectedSpeakerId === 'mobile-speaker' || selectedSpeakerId === 'mobile-earpiece')) {
            const destination = audioContext.createMediaStreamDestination();
            gainNode.connect(destination);
            
            let audioElement = document.getElementById(`audio-output-${selectedSpeakerId}`);
            if (!audioElement) {
                audioElement = document.createElement('audio');
                audioElement.id = `audio-output-${selectedSpeakerId}`;
                audioElement.style.display = 'none';
                
                if (selectedSpeakerId === 'mobile-speaker') {
                    audioElement.setAttribute('playsinline', 'true');
                    audioElement.volume = 1.0;
                } else {
                    audioElement.setAttribute('playsinline', 'true');
                    audioElement.volume = 0.8;
                }
                
                document.body.appendChild(audioElement);
            }
            
            audioElement.srcObject = destination.stream;
            audioElement.play().then(() => {
                addToActivityLog(`🎵 Test playing via ${selectedSpeakerId === 'mobile-speaker' ? 'speaker' : 'earpiece'}`);
            }).catch(error => {
                addToActivityLog(`❌ Test playback failed: ${error.message}`);
                // Fallback
                gainNode.disconnect();
                gainNode.connect(audioContext.destination);
            });
        } else {
            gainNode.connect(audioContext.destination);
        }
        
        source.start();
        
        addToActivityLog('🎵 Playing test pattern: High-Low-Medium beeps');
        addToActivityLog(`📊 Volume setting: ${volume * 100}%`);
        
    } else {
        addToActivityLog('❌ Audio context not available for testing');
    }
}

// Show volume instructions for mobile
function showVolumeInstructions() {
    addToActivityLog('📱 Mobile Volume Check:');
    
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    
    if (isIOS) {
        addToActivityLog('🍎 iOS Volume Instructions:');
        addToActivityLog('1. Use volume buttons on side of device');
        addToActivityLog('2. Check Control Center volume slider');
        addToActivityLog('3. Make sure silent switch is OFF');
        addToActivityLog('4. Go to Settings > Sounds & Haptics');
        addToActivityLog('5. Adjust "Ringer and Alerts" volume');
    } else if (isAndroid) {
        addToActivityLog('🤖 Android Volume Instructions:');
        addToActivityLog('1. Press volume UP button');
        addToActivityLog('2. Tap settings gear icon');
        addToActivityLog('3. Increase MEDIA volume (not ringtone)');
        addToActivityLog('4. Try Do Not Disturb = OFF');
        addToActivityLog('5. Check app-specific volume in Settings');
    } else {
        addToActivityLog('📱 Mobile Volume Instructions:');
        addToActivityLog('1. Use device volume buttons');
        addToActivityLog('2. Check system audio settings');
        addToActivityLog('3. Ensure media volume is up');
        addToActivityLog('4. Try different speaker options');
    }
    
    addToActivityLog('💡 After adjusting volume, run audio test again');
}