/**
 * AuthContext.jsx
 *
 * Real email + password login via POST /api/users/login.
 * User object is stored in sessionStorage so it survives page refresh
 * but is cleared when the browser tab closes.
 *
 * When KFUPM SSO is ready: only the login() function changes.
 * Everything downstream (user object shape, role checks, routing) stays identical.
 */
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const STORAGE_KEY = 'exam_ease_user';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Restore session on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  /**
   * Login with email + password.
   * Calls POST /api/users/login — returns { ok: true } or { ok: false, message }.
   */
  const login = async (email, password) => {
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, message: data.message || 'Login failed' };
      }
      setUser(data.user);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
      return { ok: true, user: data.user };
    } catch {
      return { ok: false, message: 'Cannot reach the server. Make sure the backend is running.' };
    }
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  // Kept for backward compatibility with any component that still calls loginWithUser
  const loginWithUser = (userObj) => {
    setUser(userObj || null);
    if (userObj) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(userObj));
    else sessionStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loginWithUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) return { user: null, login: async () => ({ ok: false }), logout: () => {}, loginWithUser: () => {} };
  return ctx;
};
