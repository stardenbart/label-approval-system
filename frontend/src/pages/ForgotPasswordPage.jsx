import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
Mail,
Loader2,
ArrowLeft,
CheckCircle
} from 'lucide-react';

import api from '../services/api';

export default function ForgotPasswordPage() {
const [email, setEmail] = useState('');
const [loading, setLoading] = useState(false);
const [sent, setSent] = useState(false);

async function handleSubmit(e) {
e.preventDefault();

setLoading(true);

try {
  await api.post('/auth/forgot-password', {
    email,
  });

  setSent(true);
} catch (_) {
  // Prevent user enumeration
  setSent(true);
} finally {
  setLoading(false);
}


}

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
      {sent ? (
        <div className="text-center">
          <CheckCircle
            size={48}
            className="text-green-500 mx-auto mb-4"
          />

          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Permintaan Terkirim
          </h2>

          <p className="text-sm text-gray-500 leading-relaxed">
            Jika email Anda terdaftar, permintaan reset password telah
            dikirim ke Superadmin. Superadmin akan menghubungi Anda
            setelah proses reset password selesai.
          </p>

          <Link
            to="/login"
            className="
              w-full
              mt-6
              py-3
              rounded-lg
              text-white
              font-semibold
              flex
              items-center
              justify-center
            "
            style={{
              background:
                'linear-gradient(135deg, #1B3A6F 0%, #E63946 100%)',
            }}
          >
            Kembali ke Login
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <Mail
              size={24}
              className="text-[#1B3A6F]"
            />

            <h2 className="text-lg font-bold text-gray-900">
              Lupa Password
            </h2>
          </div>

          <p className="text-sm text-gray-500 mb-5">
            Masukkan email Anda. Permintaan reset password akan
            dikirimkan ke Superadmin sistem.
          </p>

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>

              <input
                type="email"
                placeholder="email@perusahaan.com"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                required
                className="
                  w-full
                  px-4
                  py-2.5
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
            </div>

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
                <Mail size={18} />
              )}

              {loading
                ? 'Mengirim...'
                : 'Kirim Permintaan'}
            </button>
          </form>

          <Link
            to="/login"
            className="
              flex
              items-center
              gap-1
              text-sm
              text-blue-800
              hover:underline
              mt-5
            "
          >
            <ArrowLeft size={14} />
            Kembali ke Login
          </Link>
        </>
      )}
    </div>
  </div>
</div>

);
}
