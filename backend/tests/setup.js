// backend/tests/setup.js
//
// Test menjalankan kode produksi apa adanya, termasuk logger-nya. Tanpa ini,
// keluaran test tenggelam di bawah baris info winston dan kegagalan jadi sulit
// dilihat. Level dinaikkan ke 'error' — peringatan yang MEMANG diuji tetap
// diperiksa lewat nilai kembalian fungsinya, bukan lewat log.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

// Jangan menulis berkas log ke logs/ produksi saat test berjalan.
const os   = require('os');
const fs   = require('fs');
const path = require('path');
process.env.LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dal-test-logs-'));
