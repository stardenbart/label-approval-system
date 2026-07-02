# DAL System — QA / Security / Bug Report
Reviewed by: Tester · IT QA · Cyber Security · User
Date: 2026-06-14
Total files reviewed: 77

---

## LEGEND
🔴 CRITICAL — Blocks production, must fix before deploy
🟠 HIGH     — Significant bug or security risk
🟡 MEDIUM   — Functional issue or UX degradation  
🟢 LOW      — Minor improvement / polish

---

# 🔴 CRITICAL BUGS

## [CRIT-01] WHERE.OR Overwrite — Approver Search Filter Broken
**File:** `backend/src/controllers/document.controller.js` line 32–46  
**Impact:** Approver can see ALL documents (including other users' pending) when `search` query param is used.

**Root cause:**
```js
// Line 32: role filter sets where.OR
where.OR = [{ status: 'APPROVED' }, { id: { in: pendingIds } }];

// Line 43: search OVERWRITES where.OR
if (search) {
  where.OR = [{ labelName: ... }, { regulatoryId: ... }]; // ← OVERWRITES role filter!
}
```

**Fix:**
```js
if (search) {
  where.AND = [
    // Preserve existing role filter
    ...(where.OR ? [{ OR: where.OR }] : []),
    {
      OR: [
        { labelName:        { contains: search } },
        { regulatoryId:     { contains: search } },
        { fileNameOriginal: { contains: search } },
      ],
    },
  ];
  delete where.OR;
}
```

---

## [CRIT-02] Prisma Injection via `dateField` Query Param
**File:** `backend/src/controllers/document.controller.js` line 19, 50–52  
**Impact:** Attacker can pass arbitrary Prisma model field names as `dateField`, e.g. `dateField=uploadedBy` to filter on non-date fields, or inject unexpected Prisma query operators.

**Root cause:**
```js
const { dateField = 'tanggalTerima' } = req.query;
where[dateField] = {}; // ← No whitelist validation!
```

**Fix — Whitelist allowed fields:**
```js
const ALLOWED_DATE_FIELDS = ['tanggalTerima', 'tanggalPeriksa', 'tanggalApproval', 'createdAt'];
const safeField = ALLOWED_DATE_FIELDS.includes(req.query.dateField) 
  ? req.query.dateField 
  : 'tanggalTerima';
where[safeField] = {};
```

---

## [CRIT-03] PDF Written Outside Transaction — Data Inconsistency on Failure
**File:** `backend/src/controllers/approval.controller.js` line 60–62  
**Impact:** If `prisma.$transaction` fails after `overlayEsign()`, a signed PDF file exists on disk but the database is NOT updated. The document is left in an inconsistent state. Re-approving will overwrite the file silently.

**Root cause:**
```js
const signedPath = await pdfService.overlayEsign(...); // ← File written to disk
await prisma.$transaction(async (tx) => {              // ← If this fails...
  // signedPath is written but DB not updated!
});
```

**Fix — Add rollback cleanup:**
```js
let signedPath = null;
try {
  signedPath = await pdfService.overlayEsign(approval.document, approval, position);
  await prisma.$transaction(async (tx) => { ... });
} catch (err) {
  // Cleanup orphaned PDF file if transaction failed
  if (signedPath && fs.existsSync(signedPath)) {
    fs.unlinkSync(signedPath);
  }
  throw err;
}
```

---

## [CRIT-04] In-Memory Login Lock Broken in Cluster Mode
**File:** `backend/src/controllers/auth.controller.js` line 14  
**File:** `deploy/ecosystem.config.js` line 8 (`instances: 2`)  
**Impact:** PM2 runs 2 Node.js processes. `loginAttempts` Map is **per-process** — not shared. An attacker can brute-force with 5 attempts per process = 10 attempts before any lock. In `instances: 'max'` mode, this is unlimited.

**Root cause:**
```js
const loginAttempts = new Map(); // ← in-memory, not shared across cluster workers
```

**Fix options (pick one):**
```js
// Option A: reduce to 1 instance (simplest, loses HA)
// ecosystem.config.js: instances: 1

// Option B: Move to DB-backed tracking (recommended for production)
// In auth.controller.js, replace Map with:
async function checkLock(ip, email) {
  const key = `${ip}:${email}`;
  const record = await prisma.loginAttemptLog.findFirst({
    where: { key, lockedUntil: { gt: new Date() } }
  });
  return !!record;
}

// Option C: Use Redis (best for scale, needs redis setup)
```

---

## [CRIT-05] Missing `app.set('trust proxy')` — IP Spoofing Possible
**File:** `backend/src/app.js`  
**Impact:** When behind Nginx, `req.ip` returns `127.0.0.1` (Nginx IP) instead of real client IP. This means:
- ALL login attempts from ALL clients share ONE rate limit bucket
- All audit logs record `127.0.0.1` instead of real IPs  
- Brute force protection is effectively disabled (everyone shares the same lock key)

**Fix — Add before routes:**
```js
// backend/src/app.js, after app creation:
app.set('trust proxy', 1); // Trust first proxy (Nginx)
```

---

## [CRIT-06] ApprovalPage — PDF Preview Uses Wrong URL (approvalId as docId)
**File:** `frontend/src/pages/ApprovalPage.jsx` line 109, 124  
**Impact:** PDF preview in the approval page is completely broken. The endpoint `/api/documents/{approvalId}/preview` doesn't exist — `approvalId` is passed where `documentId` is expected, and `/preview` is not a registered route.

**Root cause:**
```jsx
// approvalId is NOT the document ID!
pdfUrl={`/api/documents/${approvalId}/preview`}  // ← Wrong! Endpoint doesn't exist
```

**Fix:**
```js
// 1. Add endpoint to backend: GET /api/approvals/:id/document-preview
// Or fetch document ID from approval data:

// In ApprovalPage.jsx, fetch document from suggestedApprovers response:
// The approval includes document info — extract documentId first
const { data: approvalData } = useQuery({
  queryKey: ['approval', approvalId],
  queryFn: () => api.get(`/approvals/${approvalId}/suggested-approvers`).then(r => r.data),
});
const documentId = approvalData?.documentId; // Add this field to the response

// Then serve the PDF via the existing /original endpoint:
pdfUrl={documentId ? `/api/documents/${documentId}/original` : null}
```

Also add `documentId` to the `suggestedApprovers` response in `approval.controller.js`.

---

## [CRIT-07] `HomePage.jsx` Import — App Won't Build
**File:** `frontend/src/App.jsx` line 16  
**Impact:** `import HomePage from './pages/HomePage.jsx'` — this file **does not exist** in the pages directory. `npm run build` will fail with a module not found error.

**Fix:**
```js
// Remove this line from App.jsx:
// import HomePage from './pages/HomePage.jsx';
// (It's imported but never used in routes either)
```

---

# 🟠 HIGH SEVERITY

## [HIGH-01] Server File Paths Leaked in API Response
**File:** `backend/src/controllers/document.controller.js` — `getOne()` and `list()`  
**Impact:** `getOne()` returns the full Prisma document record including `pathOriginal`, `pathSignedFinal`, `pathCheckReport`, `qrPathEsign` (absolute server filesystem paths). Example: `/var/www/dal-system/backend/storage/documents/uuid/original.pdf`. Exposes server directory structure to any authenticated user.

**Fix — Exclude paths from response:**
```js
// In getOne(), use select to exclude file paths:
const doc = await prisma.document.findFirst({
  where: { id: req.params.id, deletedAt: null },
  select: {
    id: true, regulatoryId: true, labelName: true, 
    fileNameOriginal: true, status: true,
    // ❌ DO NOT include: pathOriginal, pathSignedFinal, qrPathEsign etc.
    tanggalTerima: true, tanggalPeriksa: true,
    tanggalApproval: true, tanggalVerifikasi: true,
    productCategory: { include: { group: true } },
    uploader: { select: { id: true, name: true } },
    approvals: { ... },
    // Add boolean flags instead:
    _hasSignedFile: ... // compute separately
  }
});
// Add computed flags:
const hasSignedFile = !!doc.pathSignedFinal && fs.existsSync(doc.pathSignedFinal);
```

---

## [HIGH-02] `<img src="/api/documents/:id/qr/...">` Requires Auth but Browser Can't Send Token
**File:** `frontend/src/pages/DocumentDetailPage.jsx` line 201, 234  
**Impact:** The QR code image tags use `<img src="/api/documents/${id}/qr/esign">`. The backend requires `authenticate` middleware. Browsers send cookies automatically but the `access_token` is stored in memory (Zustand), not in a cookie. This means the QR images will return 401 and display broken image icons.

**Fix options:**
```jsx
// Option A: Use authenticated blob fetch (like downloadFile)
const [qrEsignUrl, setQrEsignUrl] = useState(null);
useEffect(() => {
  api.get(`/documents/${id}/qr/esign`, { responseType: 'blob' })
     .then(res => setQrEsignUrl(URL.createObjectURL(res.data)))
     .catch(() => {});
}, [id]);

// Option B: Make QR endpoints public (since they're just PNG images with no sensitive data)
// Remove authenticate middleware from QR routes specifically
```

---

## [HIGH-03] Unbounded Pagination — DoS Risk
**File:** `backend/src/controllers/document.controller.js` line 19–20  
**Impact:** `limit` query param has no maximum cap. `GET /api/documents?limit=1000000` will return all records, causing DB/memory exhaustion.

**Fix:**
```js
const rawLimit = parseInt(req.query.limit) || 10;
const limit = Math.min(Math.max(1, rawLimit), 100); // Cap at 100
const rawPage = parseInt(req.query.page) || 1;
const page = Math.max(1, rawPage); // Prevent negative skip
const skip = (page - 1) * limit;
```

---

## [HIGH-04] `serveOriginal` Logs Twice — Double Audit Entry
**File:** `backend/src/controllers/document.controller.js` line 285–287  
**Impact:** `serveOriginal` calls `auditService.log('QR_ORIGINAL_ACCESSED')` then immediately calls `serveFile()` which also calls `auditService.log('DOCUMENT_DOWNLOADED')`. Every QR scan of the original creates 2 audit records.

**Fix:**
```js
exports.serveOriginal = async (req, res, next) => {
  try {
    const doc = await prisma.document.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!doc) return res.status(404).json(...);
    // Remove the duplicate log — serveFile already logs DOCUMENT_DOWNLOADED
    await serveFile(doc.pathOriginal, doc.fileNameOriginal, req, res, 'QR_ORIGINAL_ACCESSED', doc.id);
  } catch (err) { next(err); }
};
```

---

## [HIGH-05] Upload: Orphaned File if DB Transaction Fails
**File:** `backend/src/controllers/document.controller.js` line 140–210  
**Impact:** If `prisma.$transaction` fails after `fs.renameSync(req.file.path, permanentPath)`, the PDF is permanently stored at `permanentPath` but no DB record exists. Storage leak and potential data inconsistency.

**Fix — Wrap in try/finally:**
```js
let permanentPath = null;
try {
  // ... generate id, create dirs ...
  permanentPath = path.join(docStorageDir, 'original.pdf');
  fs.renameSync(req.file.path, permanentPath);
  
  await prisma.$transaction(async (tx) => { ... });
} catch (err) {
  // Cleanup orphaned file
  if (permanentPath && fs.existsSync(permanentPath)) {
    try { fs.rmSync(path.dirname(permanentPath), { recursive: true }); } catch (_) {}
  }
  throw err;
}
```

---

## [HIGH-06] Content-Disposition Header Encoding Non-Standard
**File:** `backend/src/controllers/document.controller.js` line 277  
**Impact:** `filename="${encodeURIComponent(fileName)}"` — `encodeURIComponent` in a quoted filename is not standard RFC 6266. Some browsers (especially Safari and older Edge) will show the URL-encoded filename literally (e.g., `Laporan%20CYD%2001.pdf`).

**Fix — Use RFC 6266 / RFC 5987:**
```js
const encodedName = encodeURIComponent(fileName).replace(/'/g, '%27');
res.setHeader('Content-Disposition', 
  `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodedName}`
);
```

---

## [HIGH-07] Missing Prisma DB Indexes — Slow Queries at Scale
**File:** `backend/prisma/schema.prisma`  
**Impact:** Common queries (`list documents by status`, `find pending approvals`, `audit log by date`) will do full table scans as data grows.

**Fix — Add to schema:**
```prisma
model Document {
  // ... existing fields ...
  @@index([status, deletedAt], name: "idx_doc_status")
  @@index([uploadedBy, status], name: "idx_doc_uploader")
  @@index([productCategoryId, status], name: "idx_doc_category")
  @@index([tanggalTerima], name: "idx_doc_terima")
  @@index([tanggalApproval], name: "idx_doc_approval")
}

model DocumentApproval {
  @@index([approverId, status], name: "idx_approval_approver")
  @@index([documentId, status], name: "idx_approval_doc")
}

model AuditLog {
  @@index([createdAt(sort: Desc)], name: "idx_audit_date")
  @@index([userId, createdAt(sort: Desc)], name: "idx_audit_user")
  @@index([action], name: "idx_audit_action")
}

model RefreshToken {
  @@index([tokenHash], name: "idx_refresh_hash")
  @@index([userId, revoked], name: "idx_refresh_user")
}
```

---

# 🟡 MEDIUM SEVERITY

## [MED-01] CORS — If `FRONTEND_URL` Not Set, All Requests Blocked
**File:** `backend/src/app.js` line 40  
```js
origin: process.env.FRONTEND_URL, // undefined = block all
```
**Fix:**
```js
origin: process.env.FRONTEND_URL || 'http://localhost:5173',
```

---

## [MED-02] `seed.js` Uses `require()` But `package.json` Has No `"type"` Field
**File:** `backend/prisma/seed.js` + `backend/package.json`  
Node defaults to CommonJS when `"type"` is absent, so `require()` works. BUT `frontend/package.json` has `"type": "module"` — if a developer accidentally mixes them, confusing errors occur. Document clearly in README that backend is CJS.

---

## [MED-03] Refresh Token Not Cleaned Up — Table Grows Indefinitely
**File:** `backend/src/app.js`  
The cron job only cleans notifications. Expired/revoked refresh tokens accumulate forever.

**Fix — Add to cron:**
```js
cron.schedule('0 3 * * *', async () => {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }] },
  });
  logger.info(`[CRON] Cleaned ${count} old refresh tokens`);
});
```

---

## [MED-04] `maxLevel = 2` Hardcoded — Not Configurable
**File:** `backend/src/controllers/approval.controller.js` line 34  
```js
const maxLevel = 2; // hardcoded
```
The PRD mentions a 2-level system but this should be driven by config or the `ProductApproverMapping` table, not a magic number.

**Fix — Derive from DB:**
```js
const maxLevel = await prisma.productApproverMapping.aggregate({
  where: { productGroupId: approval.document.productCategory.groupId },
  _max: { level: true },
});
const isFinalLevel = approval.level >= (maxLevel._max.level || 2);
```

---

## [MED-05] QR Generation Silently Fails — No User Feedback
**File:** `backend/src/controllers/document.controller.js` line 185–193  
QR generation is async fire-and-forget with `.catch(() => {})`. If it fails, the document shows no QR codes with no indication to the user.

**Fix — Log the error and expose a retry endpoint:**
```js
qrService.generateForDocument(docUuid, regulatoryId, docStorageDir)
  .then(({ qrOriginalPath, qrEsignPath }) => {
    return prisma.document.update({ where: { id: docUuid }, data: { qrPathOriginal, qrPathEsign } });
  })
  .catch((err) => logger.error(`QR generation failed for doc ${docUuid}:`, err));
```

---

## [MED-06] `changePassword` Doesn't Revoke Existing Refresh Tokens
**File:** `backend/src/controllers/auth.controller.js` — `changePassword`  
After a password change, all existing sessions (refresh tokens) should be invalidated. Currently a stolen refresh token remains valid for 7 days after password change.

**Fix:**
```js
// After updating password:
await prisma.refreshToken.updateMany({
  where: { userId: req.user.id, revoked: false },
  data:  { revoked: true },
});
// Then clear the current cookie too
res.clearCookie('refresh_token', { path: '/api/auth' });
```

---

## [MED-07] `ESignCanvas` — QR Stamp Image Not Loaded
**File:** `frontend/src/components/ESignCanvas/ESignCanvas.jsx` line —  
`qrDataUrl={null}` is passed from `ApprovalPage.jsx`. The canvas shows a placeholder box with a move icon instead of the actual QR preview. Approver can't see what the stamp looks like.

**Fix — Load QR via authenticated fetch:**
```jsx
// In ApprovalPage.jsx, after getting documentId:
const [qrDataUrl, setQrDataUrl] = useState(null);
useEffect(() => {
  if (!documentId) return;
  api.get(`/documents/${documentId}/qr/esign`, { responseType: 'blob' })
     .then(res => setQrDataUrl(URL.createObjectURL(res.data)))
     .catch(() => {});
}, [documentId]);

// Then pass to ESignCanvas:
<ESignCanvas qrDataUrl={qrDataUrl} ... />
```

---

## [MED-08] Audit Log — `page` Can Be 0 or Negative → Negative Skip
**File:** Multiple controllers  
`const skip = (parseInt(page)-1) * parseInt(limit)` — if `page=0`, skip = -10. Prisma rejects negative skip and throws, causing a 500 error.

**Fix:**
```js
const page  = Math.max(1, parseInt(req.query.page)  || 1);
const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
const skip  = (page - 1) * limit;
```

---

## [MED-09] `downloadFile` in DocumentDetailPage Missing Error Handling
**File:** `frontend/src/pages/DocumentDetailPage.jsx` line 61–66  
```js
function downloadFile(endpoint, filename) {
  api.get(endpoint, { responseType: 'blob' }).then(res => {
    // ... create link ...
  }).catch(() => toast.error('Gagal mengunduh file'));
}
```
The `.catch` is correct but `URL.createObjectURL` result is never revoked — memory leak on repeated downloads.

**Fix:**
```js
function downloadFile(endpoint, filename) {
  api.get(endpoint, { responseType: 'blob' })
    .then(res => {
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100); // ← Add this
    })
    .catch(() => toast.error('Gagal mengunduh file'));
}
```

---

## [MED-10] `RequireAuth` Guard — `accessToken` Persisted in Zustand `partialize`?
**File:** `frontend/src/store/authStore.js`  
`partialize: (state) => ({ user: state.user })` — `accessToken` is NOT persisted. Good. BUT on page refresh, `user` is restored from localStorage but `accessToken` is null → `RequireAuth` redirects to login even though user was logged in → every page refresh forces re-login.

This is intended behavior (security), but the app needs to attempt a `/auth/refresh` call on mount before redirecting.

**Fix — Add a startup refresh in `main.jsx`:**
```jsx
// main.jsx — before rendering
async function initAuth() {
  const store = useAuthStore.getState();
  if (store.user && !store.accessToken) {
    try {
      const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
      store.setToken(data.data.accessToken);
    } catch (_) {
      store.clearAuth(); // refresh token expired, force login
    }
  }
}

initAuth().then(() => ReactDOM.createRoot(...).render(<App />));
```

---

# 🟢 LOW / IMPROVEMENT

## [LOW-01] No `helmet` CSP for Vite Dev — `unsafe-eval` Not Allowed
When running locally with `npm run dev`, Vite's HMR needs `'unsafe-eval'` in script-src. The production Helmet CSP blocks this. Not a production issue but devs will see CSP errors in browser console.

## [LOW-02] Prisma `$transaction` for Decline Uses Array API (Deprecated in v5)
**File:** `backend/src/controllers/approval.controller.js` line 171  
```js
await prisma.$transaction([ // ← array form, deprecated
  prisma.documentApproval.update(...),
  prisma.document.update(...),
]);
```
Use the interactive transaction form for consistency:
```js
await prisma.$transaction(async (tx) => {
  await tx.documentApproval.update(...);
  await tx.document.update(...);
});
```

## [LOW-03] `seed.js` Password Should Be Prompted, Not Hardcoded
`Admin@DAL2026!` is hardcoded in `seed.js`. In production this ends up in git history.
Use: `const pwd = process.env.SEED_ADMIN_PASSWORD || 'Admin@DAL2026!'`

## [LOW-04] No `X-Request-ID` Header for Tracing
Add a request ID middleware to correlate logs across audit log and Winston:
```js
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});
```

## [LOW-05] `ESignCanvas` — `Draggable` `bounds` Not Recalculated on Zoom
When user zooms the PDF, `canvasSize` updates but `bounds` in `<Draggable>` uses stale values. Stamp can be dragged partially out of the page at certain zoom levels.

## [LOW-06] Notification Bell `markAllRead` Doesn't Update Count Immediately
**File:** `frontend/src/components/NotificationBell/NotificationBell.jsx`  
After `markAll()`, `count` is set to 0 correctly, but the bell badge takes up to 30 seconds to disappear if polling runs in parallel.

## [LOW-07] `LabelCheckFormPage` — `URL.createObjectURL(new Blob())` for Saved Remarks
Line: `src={URL.createObjectURL(remark._file || new Blob())}` — for already-saved remarks (loaded from DB), `remark._file` is undefined, so `new Blob()` creates an empty blob. Image shows broken. Use `remark.imagePath` via an authenticated endpoint instead.

## [LOW-08] `UserManagementPage` — No Confirm Before Deactivating Self
A superadmin can deactivate their own account, locking the system. Add a guard:
```js
if (user.id === currentUser.id) {
  toast.error('Tidak dapat menonaktifkan akun sendiri');
  return;
}
```

## [LOW-09] Nginx Config — `location /api/documents` Catches ALL, Not Just Upload
The upload rate limit (`dal_upload`) applies to ALL `/api/documents/*` including `GET /api/documents` (list) and `GET /api/documents/:id`. Read endpoints should use `dal_api` zone. Separate upload-specific limit to `POST /api/documents` only.

## [LOW-10] Missing `robots.txt` and `favicon.svg`
`index.html` references `/favicon.svg` which doesn't exist. Will 404 on every page load. Add a simple SVG or remove the reference.

---

# SUMMARY TABLE

| ID | Severity | File | Issue |
|----|----------|------|-------|
| CRIT-01 | 🔴 | document.controller.js | WHERE.OR overwritten by search — approver sees all docs |
| CRIT-02 | 🔴 | document.controller.js | Prisma injection via `dateField` query param |
| CRIT-03 | 🔴 | approval.controller.js | PDF written outside transaction — inconsistent state |
| CRIT-04 | 🔴 | auth.controller.js + ecosystem | In-memory loginAttempts broken in PM2 cluster mode |
| CRIT-05 | 🔴 | app.js | Missing `trust proxy` — all IPs logged as 127.0.0.1 |
| CRIT-06 | 🔴 | ApprovalPage.jsx | PDF preview uses approvalId as docId — broken |
| CRIT-07 | 🔴 | App.jsx | `HomePage` import doesn't exist — build fails |
| HIGH-01 | 🟠 | document.controller.js | Server file paths exposed in API JSON response |
| HIGH-02 | 🟠 | DocumentDetailPage.jsx | `<img>` tag can't send auth headers — QR broken |
| HIGH-03 | 🟠 | document.controller.js | No limit cap — DoS via `?limit=1000000` |
| HIGH-04 | 🟠 | document.controller.js | Double audit log in serveOriginal |
| HIGH-05 | 🟠 | document.controller.js | Orphaned file on failed DB transaction |
| HIGH-06 | 🟠 | document.controller.js | Non-standard Content-Disposition encoding |
| HIGH-07 | 🟠 | schema.prisma | Missing indexes — slow queries at scale |
| MED-01 | 🟡 | app.js | CORS breaks if FRONTEND_URL not set |
| MED-02 | 🟡 | package.json | CJS/ESM ambiguity |
| MED-03 | 🟡 | app.js | Refresh tokens never cleaned up |
| MED-04 | 🟡 | approval.controller.js | maxLevel hardcoded |
| MED-05 | 🟡 | document.controller.js | QR gen failure silent, no retry |
| MED-06 | 🟡 | auth.controller.js | Password change doesn't revoke sessions |
| MED-07 | 🟡 | ApprovalPage.jsx | QR stamp not shown in canvas |
| MED-08 | 🟡 | Multiple controllers | Negative page → 500 error |
| MED-09 | 🟡 | DocumentDetailPage.jsx | Blob URL not revoked — memory leak |
| MED-10 | 🟡 | store/authStore.js + main.jsx | Page refresh forces re-login |
| LOW-01–10 | 🟢 | Various | Minor improvements |

---

# DEPLOYMENT CHECKLIST (before go-live)

- [ ] Fix CRIT-01 through CRIT-07 (mandatory)
- [ ] Fix HIGH-01 (file path leak)
- [ ] Fix HIGH-02 (QR auth in img tag)  
- [ ] Fix HIGH-03 (pagination cap)
- [ ] Add `app.set('trust proxy', 1)` (CRIT-05)
- [ ] Add DB indexes (HIGH-07)
- [ ] Add `token refresh on startup` (MED-10) or accept forced re-login
- [ ] Set all `.env` values — especially JWT secrets (64+ chars random)
- [ ] Verify SMTP works (send test email before go-live)
- [ ] Run `npx prisma migrate deploy` on production (not `migrate dev`)
- [ ] Change default superadmin password immediately after seed
- [ ] Set `NODE_ENV=production` in .env
- [ ] Verify Nginx rate limits are working: `ab -n 20 -c 5 http://server/api/auth/login`
- [ ] Confirm MySQL user has NO `GRANT OPTION` and `DROP` privileges
- [ ] Test QR scan flow end-to-end from mobile browser

Total: 7 Critical · 7 High · 10 Medium · 10 Low = **34 findings**
