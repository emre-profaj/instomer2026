const path = require('path');

module.exports = {
    apps: [
        {
            name: 'instomer',
            cwd: __dirname,
            script: path.join(__dirname, 'server.js'),
            instances: 2,
            exec_mode: 'cluster',
            autorestart: true,
            watch: false,
            max_memory_restart: '800M',
            wait_ready: true,
            listen_timeout: 10000,
            kill_timeout: 5000,
            env: {
                NODE_ENV: 'production',
                PORT: 5008
            },
            error_file: path.join(__dirname, 'logs/error.log'),
            out_file: path.join(__dirname, 'logs/out.log'),
            log_file: path.join(__dirname, 'logs/combined.log'),
            time: true,
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
        }
    ]
};

