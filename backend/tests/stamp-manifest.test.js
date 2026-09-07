// backend/tests/stamp-manifest.test.js
'use strict';

/**
 * Berkas hasil penempelan tidak lagi disimpan sampai approval final — ia
 * dirender ulang dari original.pdf + stamp_manifest. Seluruh keputusan itu
 * bertumpu pada satu janji: manifest yang sama SELALU menghasilkan gambar yang
 * sama. Kalau janji itu bocor, dokumen yang sudah disetujui bisa tercetak
 * berbeda dari yang dulu diperiksa orang.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const crypto = require('crypto');
const { PDFDocument, rgb } = require('pdf-lib');

// pdf.service menyentuh prisma saat memuat modul; database tidak dipakai di
// test ini, jadi cukup dicegat.
jest.mock('../src/config/prisma', () => ({ prisma: { systemSetting: { findMany: async () => [] } } }));
const pdfService = require('../src/services/pdf.service');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dal-stamp-')); });
afterEach(()  => { fs.rmSync(dir, { recursive: true, force: true }); });

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 50, y: 50, width: 200, height: 100, color: rgb(0.2, 0.4, 0.8) });
  const pdfPath = path.join(dir, 'original.pdf');
  fs.writeFileSync(pdfPath, await doc.save());

  // QR palsu: PNG 1x1 yang sah, cukup untuk embedPng.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
  const qrPath = path.join(dir, 'qr.png');
  fs.writeFileSync(qrPath, png);

  return {
    document: { id: 'uji', pathOriginal: pdfPath, qrPathOriginal: qrPath,
                regulatoryId: 'CYD01-X', labelName: 'Label Uji', fileNameOriginal: 'uji.pdf' },
    manifest: {
      v: 1,
      qr:     { page: 1, xPct: 70, yPct: 5, wPt: 100, hPt: 100 },
      footer: { page: 1, xPct: 3, yPct: 97, wPt: 220, hPt: 30, fontSize: 7, rotation: 0 },
      footerText: ['ID Regulatory: CYD01-X', 'Nama Label: Label Uji', 'Nama File: uji.pdf'],
      qrFile: qrPath,
      sourceSha: 'apa-saja',
      stampedAt: '2026-09-07T00:00:00.000Z',
      stampedBy: 'user-1',
    },
  };
}

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

describe('renderStamped — fungsi murni', () => {
  test('manifest yang sama menghasilkan byte yang sama', async () => {
    const { document, manifest } = await fixture();
    const a = await pdfService.renderStamped(document, manifest);
    const b = await pdfService.renderStamped(document, manifest);
    expect(md5(a)).toBe(md5(b));
  });

  test('tidak menulis apa pun ke disk', async () => {
    const { document, manifest } = await fixture();
    const before = fs.readdirSync(dir).sort();
    await pdfService.renderStamped(document, manifest);
    expect(fs.readdirSync(dir).sort()).toEqual(before);
  });

  test('original.pdf tidak berubah — syarat dedup hard link', async () => {
    const { document, manifest } = await fixture();
    const before = md5(fs.readFileSync(document.pathOriginal));
    await pdfService.renderStamped(document, manifest);
    expect(md5(fs.readFileSync(document.pathOriginal))).toBe(before);
  });

  test('versi manifest asing ditolak, bukan digambar sembarangan', async () => {
    const { document, manifest } = await fixture();
    await expect(pdfService.renderStamped(document, { ...manifest, v: 99 }))
      .rejects.toThrow(/Unsupported stamp manifest version/);
  });

  test('berkas QR hilang: melempar dengan pesan yang menyebut berkasnya', async () => {
    const { document, manifest } = await fixture();
    fs.unlinkSync(manifest.qrFile);
    await expect(pdfService.renderStamped(document, manifest))
      .rejects.toThrow(/QR image missing/);
  });

  test('menambahkan gambar ke halaman, bukan mengganti halaman', async () => {
    const { document, manifest } = await fixture();
    const out = await pdfService.renderStamped(document, manifest);
    const rendered = await PDFDocument.load(out);
    const original = await PDFDocument.load(fs.readFileSync(document.pathOriginal));
    expect(rendered.getPageCount()).toBe(original.getPageCount());
  });
});

describe('manifestHash — kunci cache', () => {
  test('menggeser posisi QR mengubah hash', async () => {
    const { manifest } = await fixture();
    const moved = { ...manifest, qr: { ...manifest.qr, xPct: 10 } };
    expect(pdfService.manifestHash(moved)).not.toBe(pdfService.manifestHash(manifest));
  });

  test('mengubah teks footer mengubah hash', async () => {
    const { manifest } = await fixture();
    const other = { ...manifest, footerText: ['lain'] };
    expect(pdfService.manifestHash(other)).not.toBe(pdfService.manifestHash(manifest));
  });

  test('stampedAt dan stampedBy TIDAK mengubah hash', async () => {
    // Keduanya jejak audit, tidak tergambar di halaman. Kalau ikut dihitung,
    // cache meleset setiap kali tanpa alasan.
    const { manifest } = await fixture();
    const later = { ...manifest, stampedAt: '2027-01-01T00:00:00.000Z', stampedBy: 'orang-lain' };
    expect(pdfService.manifestHash(later)).toBe(pdfService.manifestHash(manifest));
  });
});
