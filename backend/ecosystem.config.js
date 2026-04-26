module.exports = {
    apps: [
        {
            name: 'chatcrm-api',
            script: './server.js',
            cwd: '/home/your-username/chatinstomer/backend',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
                PORT: 5008
            },
            error_file: './logs/error.log',
            out_file: './logs/out.log',
            log_file: './logs/combined.log',
            time: true,
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
        }
    ]
};
