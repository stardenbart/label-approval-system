import { describe, expect, test } from 'vitest';
import { buildApprovalQrRows } from '../documentQrPresentation.js';

describe('QR approval pada detail dokumen', () => {
  test('selalu diurutkan berdasarkan level', () => {
    const rows = buildApprovalQrRows([
      { id: 'a2', level: 2, status: 'PENDING' },
      { id: 'a0', level: 0, status: 'APPROVED' },
      { id: 'a1', level: 1, status: 'APPROVED' },
    ], []);
    expect(rows.map(row => row.approval.level)).toEqual([0, 1, 2]);
  });

  test('QR hanya ditampilkan jika approval dan metadata QR sama-sama approved', () => {
    const rows = buildApprovalQrRows([
      { id: 'approved', level: 0, status: 'APPROVED' },
      { id: 'pending', level: 1, status: 'PENDING' },
      { id: 'missing', level: 2, status: 'APPROVED' },
    ], [
      { approvalId: 'approved', level: 0, status: 'APPROVED' },
      { approvalId: 'pending', level: 1, status: 'APPROVED' },
    ]);

    expect(rows.map(row => row.hasQr)).toEqual([true, false, false]);
  });

  test('QR declined tidak dianggap sebagai QR yang sudah diterbitkan', () => {
    const [row] = buildApprovalQrRows(
      [{ id: 'declined', level: 1, status: 'DECLINED' }],
      [{ approvalId: 'declined', level: 1, status: 'DECLINED' }],
    );
    expect(row.hasQr).toBe(false);
    expect(row.qr).toBeNull();
  });
});
