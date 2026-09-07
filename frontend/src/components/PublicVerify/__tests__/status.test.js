// frontend/src/components/PublicVerify/__tests__/status.test.js
//
// Halaman verifikasi QR per level dulu SELALU hijau, berjudul "Digital
// Signature Verification", dan ditutup "Signature Verification Successful" —
// apa pun statusnya. Approval yang menunggu maupun yang ditolak sama-sama
// tampak seperti sudah ditandatangani.
//
// Berkas status.js dipisahkan dari JSX justru supaya aturan itu bisa dijaga di
// sini, tanpa perlu merender apa pun.

import { describe, test, expect } from 'vitest';
import { toneFor, headlineFor, documentContradicts, closingNote, NOTE_CLASS }
  from '../status.js';

const CASES = [
  { nama: 'normal',     level: 'APPROVED', dokumen: 'APPROVED' },
  { nama: 'menunggu',   level: 'PENDING',  dokumen: 'PENDING_APPROVAL' },
  { nama: 'ditolak',    level: 'DECLINED', dokumen: 'DECLINED' },
  { nama: 'divergensi', level: 'APPROVED', dokumen: 'DECLINED' },
];

describe('toneFor', () => {
  test('hanya status APPROVED yang boleh hijau', () => {
    expect(toneFor('APPROVED')).toBe('green');
    expect(toneFor('PENDING')).not.toBe('green');
    expect(toneFor('DECLINED')).not.toBe('green');
    expect(toneFor('PENDING_APPROVAL')).not.toBe('green');
  });

  test('status tak dikenal jatuh ke amber, bukan hijau', () => {
    // Gagal ke arah aman: sesuatu yang belum jelas tidak boleh tampak beres.
    expect(toneFor(undefined)).toBe('amber');
    expect(toneFor('ENTAH')).toBe('amber');
  });
});

describe('headlineFor', () => {
  test('PENDING tidak mengaku sudah ditandatangani', () => {
    const h = headlineFor('PENDING', 'Budi');
    expect(h.title).toMatch(/Menunggu/i);
    expect(h.lead).toMatch(/belum ditandatangani/i);
    expect(h.lead).not.toMatch(/Ditandatangani oleh/i);
  });

  test('DECLINED menyebut penolakan, bukan tanda tangan', () => {
    const h = headlineFor('DECLINED', 'Budi');
    expect(h.title).toMatch(/Ditolak/i);
    expect(h.lead).toMatch(/Ditolak oleh Budi/);
  });

  test('APPROVED menyebut siapa yang menandatangani', () => {
    expect(headlineFor('APPROVED', 'Budi').lead).toBe('Ditandatangani oleh Budi');
  });

  test('nama kosong tidak menghasilkan "undefined" di layar', () => {
    for (const s of ['APPROVED', 'PENDING', 'DECLINED']) {
      expect(headlineFor(s, null).lead).not.toMatch(/undefined|null/);
    }
  });
});

describe('documentContradicts', () => {
  test('level disetujui tapi dokumen ditolak = berlawanan', () => {
    expect(documentContradicts('APPROVED', 'DECLINED')).toBe(true);
  });

  test('level ditolak tapi dokumen disetujui = berlawanan', () => {
    expect(documentContradicts('DECLINED', 'APPROVED')).toBe(true);
  });

  test('dokumen masih berjalan bukan pertentangan', () => {
    expect(documentContradicts('APPROVED', 'PENDING_APPROVAL')).toBe(false);
    expect(documentContradicts('PENDING', 'PENDING_APPROVAL')).toBe(false);
  });

  test('sejalan bukan pertentangan', () => {
    expect(documentContradicts('APPROVED', 'APPROVED')).toBe(false);
    expect(documentContradicts('DECLINED', 'DECLINED')).toBe(false);
  });
});

describe('closingNote — aturan yang tidak boleh dilanggar', () => {
  test('"terverifikasi" HANYA saat level disetujui dan dokumen tidak ditolak', () => {
    for (const c of CASES) {
      const n = closingNote(c.level, c.dokumen);
      const mengaku = /terverifikasi/i.test(n.title);
      const boleh   = c.level === 'APPROVED' && c.dokumen !== 'DECLINED';
      expect(mengaku, `kasus ${c.nama}`).toBe(boleh);
    }
  });

  test('divergensi memperingatkan bahwa label tidak sah', () => {
    const n = closingNote('APPROVED', 'DECLINED');
    expect(n.tone).toBe('amber');
    expect(n.body).toMatch(/tidak sah/i);
  });

  test('PENDING menyatakan belum ada tanda tangan', () => {
    expect(closingNote('PENDING', 'PENDING_APPROVAL').title).toMatch(/belum ada tanda tangan/i);
  });

  test('setiap nada punya kelas warna yang terdefinisi', () => {
    for (const c of CASES) {
      expect(NOTE_CLASS[closingNote(c.level, c.dokumen).tone]).toBeTruthy();
    }
  });

  test('tidak ada kasus yang menghasilkan nada hijau menenangkan', () => {
    // Penutup hijau akan terbaca sebagai "beres" bahkan saat dokumen ditolak.
    for (const c of CASES) {
      expect(closingNote(c.level, c.dokumen).tone).not.toBe('green');
    }
  });
});
