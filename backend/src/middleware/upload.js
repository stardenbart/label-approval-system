// backend/src/middleware/upload.js
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '../../storage');
const PDF_TMP      = path.join(STORAGE_PATH, 'tmp');
const IMG_TMP      = path.join(STORAGE_PATH, 'tmp_img');

// Ensure tmp dirs exist
[PDF_TMP, IMG_TMP].forEach((d) => fs.mkdirSync(d, { recursive: true }));

// PDF upload (to temp, then moved by service)
const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PDF_TMP),
  filename:    (_req, file, cb) => {
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  },
});

const pdfFilter = (_req, file, cb) => {
  // Validate by MIME type (multer reads Content-Type header)
  if (file.mimetype === 'application/pdf') return cb(null, true);
  cb(Object.assign(new Error('Only PDF files are allowed'), { code: 'INVALID_FILE_TYPE' }));
};

const uploadPdf = multer({
  storage:  pdfStorage,
  fileFilter: pdfFilter,
  limits:   { fileSize: 10 * 1024 * 1024 }, // 10MB
}).single('file');

// Image upload (remarks)
const imgStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMG_TMP),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const imgFilter = (_req, file, cb) => {
  if (['image/jpeg', 'image/png'].includes(file.mimetype)) return cb(null, true);
  cb(Object.assign(new Error('Only JPG/PNG images are allowed'), { code: 'INVALID_FILE_TYPE' }));
};

const uploadImage = multer({
  storage:    imgStorage,
  fileFilter: imgFilter,
  limits:     { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('image');

// Excel import (Product Category Import/Export feature) — memory storage,
// since the file is parsed once (xlsx → rows) and never needs to persist to
// disk the way PDFs do.
const excelFilter = (_req, file, cb) => {
  const okMime = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // some browsers send this for .xlsx too
  ];
  if (okMime.includes(file.mimetype)) return cb(null, true);
  cb(Object.assign(new Error('Only .xlsx files are allowed'), { code: 'INVALID_FILE_TYPE' }));
};

const uploadExcel = multer({
  storage:    multer.memoryStorage(),
  fileFilter: excelFilter,
  limits:     { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('file');

// Wrap multer to return proper JSON errors
function wrapMulter(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File size exceeds limit', code: 'FILE_TOO_LARGE' });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ success: false, message: err.message, code: 'INVALID_FILE_TYPE' });
      }
      return res.status(400).json({ success: false, message: err.message, code: 'UPLOAD_ERROR' });
    });
  };
}

module.exports = {
  uploadPdf:   wrapMulter(uploadPdf),
  uploadImage: wrapMulter(uploadImage),
  uploadExcel: wrapMulter(uploadExcel),
  PDF_TMP,
  IMG_TMP,
  STORAGE_PATH,
};
