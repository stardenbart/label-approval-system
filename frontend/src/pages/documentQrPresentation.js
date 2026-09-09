export function buildApprovalQrRows(approvals = [], approvalQrs = []) {
  const approvedQrByApproval = new Map(
    approvalQrs
      .filter(qr => qr.status === 'APPROVED')
      .map(qr => [qr.approvalId, qr]),
  );

  return [...approvals]
    .sort((a, b) => a.level - b.level)
    .map(approval => {
      const qr = approvedQrByApproval.get(approval.id) || null;
      return {
        approval,
        qr,
        hasQr: approval.status === 'APPROVED' && !!qr,
      };
    });
}
