// backend/src/services/email.service.js
'use strict';

const nodemailer = require('nodemailer');
const logger     = require('../config/logger');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function send({ to, subject, html, text }) {
  try {
    await getTransporter().sendMail({
      from:    process.env.SMTP_FROM || '"DAL System" <noreply@dal.internal>',
      to, subject, html, text,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error(`Email send failed to ${to}:`, err.message);
    // Don't throw — email failure should not block operations
  }
}

exports.sendApprovalAssigned = async (toEmail, { docName, regulatoryId, approverName }) => {
  await send({
    to:      toEmail,
    subject: `[DAL] Dokumen Menunggu Approval Anda — ${regulatoryId}`,
    html: `
      <h2>Dokumen Memerlukan Approval Anda</h2>
      <p>Halo <strong>${approverName}</strong>,</p>
      <p>Dokumen berikut telah diteruskan untuk approval Anda:</p>
      <table>
        <tr><td><strong>ID Regulatory:</strong></td><td>${regulatoryId}</td></tr>
        <tr><td><strong>Nama Label:</strong></td><td>${docName}</td></tr>
      </table>
      <p>Silakan login ke sistem DAL untuk melakukan review.</p>
      <a href="${process.env.FRONTEND_URL}/documents">Buka DAL System</a>
    `,
  });
};

exports.sendApprovalDone = async (toEmail, { doc }) => {
  await send({
    to:      toEmail,
    subject: `[DAL] Dokumen Fully Approved — ${doc.regulatoryId}`,
    html: `
      <h2>Dokumen Telah Disetujui Semua Level</h2>
      <p>Dokumen <strong>${doc.labelName}</strong> (${doc.regulatoryId}) telah disetujui semua level approval.</p>
      <p>Anda dapat mengunduh dokumen signed final dari sistem DAL.</p>
      <a href="${process.env.FRONTEND_URL}/documents/${doc.id}">Lihat Dokumen</a>
    `,
  });
};

exports.sendApprovalDeclined = async (toEmail, { doc, notes }) => {
  await send({
    to:      toEmail,
    subject: `[DAL] Dokumen Ditolak — ${doc.regulatoryId}`,
    html: `
      <h2>Dokumen Ditolak</h2>
      <p>Dokumen <strong>${doc.labelName}</strong> (${doc.regulatoryId}) telah ditolak.</p>
      <p><strong>Alasan:</strong> ${notes}</p>
      <a href="${process.env.FRONTEND_URL}/documents/${doc.id}">Lihat Dokumen</a>
    `,
  });
};

exports.sendForgotPasswordAlert = async (adminEmail, user) => {
  await send({
    to:      adminEmail,
    subject: `[DAL] Permintaan Reset Password — ${user.name}`,
    html: `
      <h2>Permintaan Reset Password</h2>
      <p><strong>${user.name}</strong> (${user.email}) mengajukan permintaan reset password.</p>
      <p>Silakan login ke DAL System dan lakukan reset password melalui User Management.</p>
      <a href="${process.env.FRONTEND_URL}/users">Buka User Management</a>
    `,
  });
};

exports.sendPasswordReset = async (toEmail, name, tempPassword) => {
  await send({
    to:      toEmail,
    subject: `[DAL] Password Anda Telah Direset`,
    html: `
      <h2>Password Anda Telah Direset</h2>
      <p>Halo <strong>${name}</strong>,</p>
      <p>Password Anda telah direset oleh Administrator.</p>
      <p>Password sementara: <strong>${tempPassword}</strong></p>
      <p><strong>Anda wajib mengganti password setelah login pertama.</strong></p>
      <a href="${process.env.FRONTEND_URL}/login">Login ke DAL System</a>
    `,
  });
};
