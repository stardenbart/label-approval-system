// backend/tests/pdf-compress.test.js
'use strict';

/**
 * Kompresi menimpa berkas ARSIP — berkas yang harus bisa ditunjukkan
 * bertahun-tahun kemudian. Hasil Ghostscript hanya boleh dipakai kalau lolos
 * pemeriksaan; kalau penjagaan ini bocor, arsip ditimpa PDF rusak dan aslinya
 * sudah tidak ada.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const compress = require('../src/services/pdf-compress.service');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dal-gs-')); });
afterEach(()  => { fs.rmSync(dir, { recursive: true, force: true }); });

async function makePdf(name, pages = 1) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  const p = path.join(dir, name);
  fs.writeFileSync(p, await doc.save());
  return p;
}

describe('penjagaan sebelum menimpa arsip', () => {
  test('preset tidak dikenal ditolak, berkas tidak tersentuh', async () => {
    const f = await makePdf('a.pdf');
    const before = fs.readFileSync(f);

    const r = await compress.compressInPlace(f, 'tidak-ada');

    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/tidak dikenal/);
    expect(fs.readFileSync(f).equals(before)).toBe(true);
  });

  test("preset 'none' mematikan kompresi tanpa menyentuh berkas", async () => {
    const f = await makePdf('a.pdf');
    const before = fs.readFileSync(f);

    const r = await compress.compressInPlace(f, 'none');

    expect(r.ok).toBe(false);
    expect(r.reason).toBe('dimatikan');
    expect(fs.readFileSync(f).equals(before)).toBe(true);
  });

  test('berkas tidak ada: dilaporkan, bukan melempar', async () => {
    const r = await compress.compressInPlace(path.join(dir, 'hantu.pdf'), 'ebook');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('berkas tidak ada');
  });

  test('Ghostscript tidak terpasang: dilewati anggun, berkas utuh', async () => {
    const f = await makePdf('a.pdf');
    const before = fs.readFileSync(f);
    const saved = process.env.GS_BINARY;
    process.env.GS_BINARY = path.join(dir, 'gs-yang-tidak-ada');
    jest.resetModules();
    const fresh = require('../src/services/pdf-compress.service');

    const r = await fresh.compressInPlace(f, 'ebook');

    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ghostscript tidak ada');
    expect(fs.readFileSync(f).equals(before)).toBe(true);

    if (saved === undefined) delete process.env.GS_BINARY; else process.env.GS_BINARY = saved;
    jest.resetModules();
  });

  test('daftar preset memuat none dan ebook', () => {
    expect(Object.keys(compress.PRESETS)).toEqual(
      expect.arrayContaining(['none', 'prepress', 'ebook', 'screen']),
    );
    // 'none' harus null, bukan array kosong — array kosong akan tetap
    // menjalankan Ghostscript tanpa preset apa pun.
    expect(compress.PRESETS.none).toBeNull();
  });
});
