const path = require('path');

module.exports = {
  apps: [
    {
      name: 'aios-bridge',
      script: 'scripts/listener.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      restart_delay: 10000,
      max_restarts: 10,
      exp_backoff_restart_delay: 1000,
      env: {
        NODE_ENV: 'production',
        HOME: process.env.HOME || process.env.USERPROFILE,
        USERPROFILE: process.env.USERPROFILE,
        PATH: process.env.PATH,
        APPDATA: process.env.APPDATA,
      },
      error_file: 'logs/aios-bridge-error.log',
      out_file: 'logs/aios-bridge-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
