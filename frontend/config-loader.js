// Loads config.json and sets window.BACKEND_URL before app.js runs
// This needs to be synchronous to ensure BACKEND_URL is available
window.BACKEND_URL = 'https://ranger-training-radio.onrender.com'; // Default fallback

// Try to load from config.json asynchronously and update if different
fetch('config.json')
    .then(response => response.json())
    .then(config => {
        window.BACKEND_URL = config.BACKEND_URL;
        console.log('Backend URL loaded:', window.BACKEND_URL);
    })
    .catch(error => {
        console.warn('Could not load config.json, using fallback URL:', window.BACKEND_URL);
    });
