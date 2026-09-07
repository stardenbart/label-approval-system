// backend/tests/storage-dedup.test.js
'use strict';

/**
 * Dedup penyimpanan menautkan berkas milik dokumen yang berbeda ke satu inode.
 * Kalau logikanya salah, dokumen A bisa menunjuk isi dokumen B — dan tidak ada
 * yang menyadarinya sampai seseorang mengunduh label yang salah.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { hashFile, linkOrMove } = require('../src/services/storage-dedup.service');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dal-dedup-')); });
afterEach(()  => { fs.rmSync(dir, { recursive: true, force: true }); });

const write = (name, content) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
};

describe('hashFile', () => {
  test('isi sama menghasilkan hash sama, isi beda menghasilkan hash beda', async () => {
    const a = write('a.pdf', 'halo dunia');
    const b = write('b.pdf', 'halo dunia');
    const c = write('c.pdf', 'halo duniA');

    const [ha, hb, hc] = await Promise.all([hashFile(a), hashFile(b), hashFile(c)]);
    expect(ha).toBe(hb);
    expect(ha).not.toBe(hc);
    expect(ha).toMatch(/^[0-9a-f]{64}$/);
  });

  test('berkas kosong tetap menghasilkan hash, bukan melempar', async () => {
    expect(await hashFile(write('kosong.pdf', ''))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('linkOrMove', () => {
  test('menautkan ke kembaran: satu inode, berkas sementara hilang', () => {
    const twin = write('twin.pdf', 'isi identik');
    const temp = write('temp.pdf', 'isi identik');
    const dest = path.join(dir, 'dest.pdf');

    const r = linkOrMove(temp, dest, twin);

    expect(r.deduped).toBe(true);
    expect(r.bytesSaved).toBe(Buffer.byteLength('isi identik'));
    expect(fs.existsSync(temp)).toBe(false);
    expect(fs.statSync(dest).ino).toBe(fs.statSync(twin).ino);
    expect(fs.readFileSync(dest, 'utf8')).toBe('isi identik');
  });

  test('TIDAK menautkan kalau ukuran berbeda — sabuk pengaman terakhir', () => {
    // sha256 sudah cukup, tapi menautkan berkas yang salah merusak dokumen
    // milik orang lain, jadi ukurannya tetap diperiksa.
    const twin = write('twin.pdf', 'panjang sekali isinya');
    const temp = write('temp.pdf', 'pendek');
    const dest = path.join(dir, 'dest.pdf');

    const r = linkOrMove(temp, dest, twin);

    expect(r.deduped).toBe(false);
    expect(fs.statSync(dest).ino).not.toBe(fs.statSync(twin).ino);
    expect(fs.readFileSync(dest, 'utf8')).toBe('pendek');
  });

  test('kembaran tidak ada di disk: disimpan biasa, bukan gagal', () => {
    const temp = write('temp.pdf', 'isi');
    const dest = path.join(dir, 'dest.pdf');

    const r = linkOrMove(temp, dest, path.join(dir, 'tidak-ada.pdf'));

    expect(r.deduped).toBe(false);
    expect(fs.readFileSync(dest, 'utf8')).toBe('isi');
  });

  test('tanpa kembaran: pindah biasa', () => {
    const temp = write('temp.pdf', 'isi');
    const dest = path.join(dir, 'dest.pdf');

    const r = linkOrMove(temp, dest, null);

    expect(r.deduped).toBe(false);
    expect(r.bytesSaved).toBe(0);
    expect(fs.existsSync(temp)).toBe(false);
    expect(fs.readFileSync(dest, 'utf8')).toBe('isi');
  });

  test('menghapus satu tautan tidak menyentuh kembarannya', () => {
    // remove() di DAL itu soft delete dan tidak pernah menghapus berkas, tapi
    // kalau suatu saat berubah, sifat ini yang menahan kerusakannya.
    const twin = write('twin.pdf', 'isi bersama');
    const dest = path.join(dir, 'dest.pdf');
    linkOrMove(write('temp.pdf', 'isi bersama'), dest, twin);

    fs.unlinkSync(dest);

    expect(fs.existsSync(twin)).toBe(true);
    expect(fs.readFileSync(twin, 'utf8')).toBe('isi bersama');
  });
});
