// deploy/ecosystem.config.js — PM2 Ecosystem File
module.exports = {
  apps: [
    {
      name:         'dal-backend',
      script:       'src/app.js',
      cwd:          '/var/www/dal-system/backend',
      instances:    2,          // 2 workers (adjust to CPU cores)
      exec_mode:    'cluster',
      watch:        false,
      max_memory_restart: '400M',

      env_production: {
        NODE_ENV: 'production',
        PORT:     3001,
      },

      // Logging
      out_file:     '/var/log/dal/pm2-out.log',
      error_file:   '/var/log/dal/pm2-err.log',
      merge_logs:   true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Restart policy
      restart_delay: 3000,
      max_restarts:  10,
      min_uptime:    '5s',

      // Graceful shutdown
      kill_timeout:  5000,
      wait_ready:    false,
    },
  ],
};
