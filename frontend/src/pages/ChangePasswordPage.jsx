import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
Lock,
Loader2,
Eye,
EyeOff
} from 'lucide-react';

import api from '../services/api';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function ChangePasswordPage() {
const navigate = useNavigate();

const {
user,
clearAuth,
} = useAuthStore();

const isMustChange = user?.mustChangePwd;

const [form, setForm] = useState({
currentPassword: '',
newPassword: '',
confirm: '',
});

const [show, setShow] = useState({
current: false,
new: false,
confirm: false,
});

const [loading, setLoading] = useState(false);

async function handleSubmit(e) {
e.preventDefault();

if (form.newPassword !== form.confirm) {
  toast.error('Konfirmasi password tidak cocok');
  return;
}

if (form.newPassword === form.currentPassword) {
  toast.error(
    'Password baru tidak boleh sama dengan password lama'
  );
  return;
}

setLoading(true);

try {
  await api.post('/auth/change-password', {
    currentPassword: form.currentPassword,
    newPassword: form.newPassword,
  });

  toast.success(
    'Password berhasil diubah. Silakan login kembali.'
  );

  clearAuth();

  navigate('/login', {
    replace: true,
  });
} catch (err) {
  toast.error(
    err.response?.data?.message ||
    'Gagal mengubah password'
  );
} finally {
  setLoading(false);
}

}

const fields = [
{
key: 'currentPassword',
label: 'Password Saat Ini',
showKey: 'current',
},
{
key: 'newPassword',
label: 'Password Baru',
showKey: 'new',
},
{
key: 'confirm',
label: 'Konfirmasi Password Baru',
showKey: 'confirm',
},
];

return ( 
  <div
    className="
      min-h-screen
      flex
      items-center
      justify-center
      px-4
      animate-gradient
    "
  > 
    <div className="w-full max-w-md">
      <div
      className="
      rounded-2xl
      p-8
      shadow-2xl
      border
      border-white/50
      backdrop-blur-xl
      "
      style={{
      background: 'rgba(255,255,255,0.92)',
      }}
      >
      {/* Page Title */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="
            w-10
            h-10
            rounded-xl
            bg-blue-100
            flex
            items-center
            justify-center
          "
        >
          <Lock
            size={18}
            className="text-[#1B3A6F]"
          />
        </div>

        <div>
          <h2 className="text-lg font-bold text-gray-900">
            Ganti Password
          </h2>

          {isMustChange && (
            <p className="text-xs text-amber-600 font-medium">
              Wajib ganti password sebelum melanjutkan
            </p>
          )}
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {fields.map(
          ({ key, label, showKey }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label}
              </label>

              <div className="relative">
                <input
                  type={
                    show[showKey]
                      ? 'text'
                      : 'password'
                  }
                  value={form[key]}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  required
                  autoComplete={
                    key ===
                    'currentPassword'
                      ? 'current-password'
                      : 'new-password'
                  }
                  className="
                    w-full
                    px-4
                    py-2.5
                    pr-10
                    rounded-lg
                    border
                    border-gray-300
                    focus:outline-none
                    focus:ring-4
                    focus:ring-blue-100
                    focus:border-blue-800
                    transition-all
                  "
                />

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() =>
                    setShow((prev) => ({
                      ...prev,
                      [showKey]:
                        !prev[showKey],
                    }))
                  }
                  className="
                    absolute
                    right-3
                    top-1/2
                    -translate-y-1/2
                    text-gray-400
                    hover:text-gray-600
                  "
                >
                  {show[showKey] ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>
          )
        )}

        {/* Password Rules */}
        <div
          className="
            bg-gray-50
            rounded-lg
            p-3
            text-xs
            text-gray-500
            space-y-1
          "
        >
          <p className="font-medium text-gray-700">
            Syarat password:
          </p>

          <p>• Minimal 8 karakter</p>
          <p>• Minimal 1 huruf kapital</p>
          <p>• Minimal 1 angka</p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="
            w-full
            py-3
            rounded-lg
            text-white
            font-semibold
            flex
            items-center
            justify-center
            gap-2
            transition-opacity
            hover:opacity-90
            disabled:opacity-60
          "
          style={{
            background:
              'linear-gradient(135deg, #1B3A6F 0%, #E63946 100%)',
          }}
        >
          {loading ? (
            <Loader2
              size={18}
              className="animate-spin"
            />
          ) : (
            <Lock size={18} />
          )}

          {loading
            ? 'Memproses...'
            : 'Ganti Password'}
        </button>
      </form>

      {!isMustChange && (
        <button
          onClick={() => navigate(-1)}
          className="
            mt-4
            w-full
            text-center
            text-sm
            text-gray-500
            hover:text-gray-700
          "
        >
          Batal
        </button>
      )}
    </div>
  </div>
</div>

);
}
