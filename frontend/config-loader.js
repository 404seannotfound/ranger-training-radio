// Loads config.json and sets window.BACKEND_URL before app.js runs
(function() {
    fetch('config.json')
        .then(response => response.json())
        .then(config => {
            window.BACKEND_URL = config.BACKEND_URL;
        })
        .catch(() => {
            // fallback to localhost if config fails
            window.BACKEND_URL = 'http://localhost:3000';
        });
})();
