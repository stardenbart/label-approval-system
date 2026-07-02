// frontend/src/store/authStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user:        null,
      accessToken: null,

      setAuth: (user, accessToken)  => set({ user, accessToken }),
      setToken: (accessToken)       => set({ accessToken }),
      clearAuth: ()                 => set({ user: null, accessToken: null }),

      isAuthenticated: () => !!get().accessToken,
      hasRole: (...roles) => roles.includes(get().user?.role),
    }),
    {
      name:    'dal-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
);

export default useAuthStore;
