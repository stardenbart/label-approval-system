import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [form, setForm] = useState({
    email: '',
    password: ''
  });

  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.email || !form.password) return;

    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', form);

      setAuth(
        data.data.user,
        data.data.accessToken
      );

      if (data.data.user.mustChangePwd) {
        navigate('/change-password');
      } else {
        navigate('/documents');
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        'Login gagal';

      toast.error(msg);
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
        {/* Login Card */}
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
                  {/* Header */}
        <div className="text-center mb-8">
          <img
            src="/Logo_Cimory.png"
            alt="Cimory"
            className="w-64 mx-auto mb-4"
          />

          <h1 className="text-3xl font-bold text-white"
            style={{ color: '#1B3A6F' }}
          >
            Digital Approval Label
          </h1>

          <p className="text-white/80 text-sm mt-2"
            style={{ color: '#6B7280' }}
          >
            PT Cisarua Mountain Dairy, Tbk — Plant Sentul
          </p>
        </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>

              <input
                type="email"
                placeholder="email@perusahaan.com"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                required
                autoComplete="email"
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

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>

              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  required
                  autoComplete="current-password"
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
                  onClick={() => setShow((v) => !v)}
                  className="
                    absolute
                    right-3
                    top-1/2
                    -translate-y-1/2
                    text-gray-400
                    hover:text-gray-600
                  "
                >
                  {show ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            {/* Login Button */}
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
              {loading && (
                <Loader2
                  size={18}
                  className="animate-spin"
                />
              )}

              {loading
                ? 'Signing in...'
                : 'Login'}
            </button>
          </form>

          {/* Forgot Password */}
          <div className="mt-5 text-center">
            <Link
              to="/forgot-password"
              className="
                text-xs
                text-blue-800
                hover:underline
              "
            >
              Forgot Password?
            </Link>
            <p
              className="text-center text-xs mt-2"
              style={{ color: '#6B7280' }}
            >
              Powered by Digital Transformation Plant Sentul
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}