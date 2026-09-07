// frontend/src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';

// Layouts
import AppLayout       from './components/common/AppLayout.jsx';
import PublicLayout    from './components/common/PublicLayout.jsx';

// Auth pages
import LoginPage           from './pages/LoginPage.jsx';
import ChangePasswordPage   from './pages/ChangePasswordPage.jsx';
import ForgotPasswordPage   from './pages/ForgotPasswordPage.jsx';

// App pages
import DocumentListPage    from './pages/DocumentListPage.jsx';
import DocumentUploadPage  from './pages/DocumentUploadPage.jsx';
import DocumentDetailPage  from './pages/DocumentDetailPage.jsx';
import ApprovalPage        from './pages/ApprovalPage.jsx';
import MyPendingPage       from './pages/MyPendingPage.jsx';

// Admin pages
import UserManagementPage  from './pages/UserManagementPage.jsx';
import ProductCategoryPage from './pages/ProductCategoryPage.jsx';
import SystemSettingsPage  from './pages/SystemSettingsPage.jsx';
import AuditLogPage        from './pages/AuditLogPage.jsx';

// Sprint 3
import LabelCheckFormPage  from './pages/LabelCheckFormPage.jsx';

// Public
import ESignPublicPage          from './pages/ESignPublicPage.jsx';
// NEW: per-approval verification page — each Staff/SPV/Marketing QR points here
import ESignApprovalPublicPage  from './pages/ESignApprovalPublicPage.jsx';

// Guards
function RequireAuth({ children }) {
  const { accessToken, user } = useAuthStore();
  if (!accessToken) return <Navigate to="/login" replace />;
  if (user?.mustChangePwd) return <Navigate to="/change-password" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const user = useAuthStore((s) => s.user);
  if (!roles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

function GuestOnly({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<PublicLayout />}>
        {/* NEW: per-approval QR target — Staff/SPV/Marketing each scan to their own page.
            More specific path segment count, registered before the wildcard /:uuid
            for readability (React Router itself resolves this correctly either order,
            unlike Express which matches sequentially). */}
        <Route path="/e/approval/:approvalId" element={<ESignApprovalPublicPage />} />
        <Route path="/e/:uuid" element={<ESignPublicPage />} />
      </Route>

      {/* Guest only */}
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* Protected app */}
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Navigate to="/documents" replace />} />
        <Route path="/" element={<Navigate to="/documents" replace />} />

        <Route path="/documents"           element={<DocumentListPage />} />
        <Route path="/documents/upload"    element={
          <RequireRole roles={['superadmin','uploader', 'admin']}>
            <DocumentUploadPage />
          </RequireRole>
        } />
        <Route path="/documents/:id"       element={<DocumentDetailPage />} />
        <Route path="/documents/:id/label-check" element={
          <RequireRole roles={['superadmin']}>
            <LabelCheckFormPage />
          </RequireRole>
        } />

        <Route path="/approvals/:approvalId" element={<ApprovalPage />} />
        <Route path="/my-pending"            element={<MyPendingPage />} />

        <Route path="/users" element={
          <RequireRole roles={['superadmin']}>
            <UserManagementPage />
          </RequireRole>
        } />
        <Route path="/products" element={
          <RequireRole roles={['superadmin','admin']}>
            <ProductCategoryPage />
          </RequireRole>
        } />
        <Route path="/settings" element={
          <RequireRole roles={['superadmin']}>
            <SystemSettingsPage />
          </RequireRole>
        } />
        <Route path="/audit" element={
          <RequireRole roles={['superadmin']}>
            <AuditLogPage />
          </RequireRole>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}