// deploy/ecosystem.config.js — PM2 Ecosystem File
//
// Nama proses, folder, dan port ditentukan lingkungan, bukan ditulis mati.
// Dulu berkas ini hanya mengenal satu aplikasi bernama `dal-backend` di
// /var/www/dal-system, sehingga men-deploy staging berarti me-restart
// produksi — lihat deploy/env.sh untuk ceritanya.
//
// Dipanggil lewat deploy/pm2.sh atau deploy/deploy.sh, yang menyetel DAL_ENV.
// Dipanggil langsung tanpa DAL_ENV, berkas ini MENOLAK menebak.

const ENV = process.env.DAL_ENV;

if (!ENV || !['production', 'staging'].includes(ENV)) {
  throw new Error(
    `DAL_ENV wajib diisi 'production' atau 'staging' (sekarang: ${ENV || 'kosong'}).\n` +
    `Jalankan lewat deploy/pm2.sh, atau setel DAL_ENV sendiri.`
  );
}

const CONF = {
  production: { dir: '/var/www/dal-system',         name: 'dal-backend',         port: 3001 },
  staging:    { dir: '/var/www/dal-system-staging', name: 'dal-backend-staging', port: 3101 },
}[ENV];

module.exports = {
  apps: [
    {
      name:         CONF.name,
      script:       'src/app.js',
      cwd:          `${CONF.dir}/backend`,

      // Mode cluster: cron di src/app.js HANYA dipasang pada instance 0
      // (NODE_APP_INSTANCE dari PM2). Tanpa penjaga itu setiap pekerjaan
      // terjadwal berjalan sebanyak jumlah worker.
      instances:    ENV === 'production' ? 2 : 1,
      exec_mode:    'cluster',
      watch:        false,
      max_memory_restart: '400M',

      env: {
        NODE_ENV: ENV === 'production' ? 'production' : 'staging',
        PORT:     CONF.port,
        DAL_ENV:  ENV,
      },

      // Logging — dipisah per lingkungan supaya log staging tidak bercampur
      // dengan produksi saat keduanya hidup di satu mesin.
      out_file:     `/var/log/dal/${CONF.name}-out.log`,
      error_file:   `/var/log/dal/${CONF.name}-err.log`,
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
