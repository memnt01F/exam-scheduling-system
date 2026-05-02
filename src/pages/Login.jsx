import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ClipboardList, Shield, Eye, EyeOff } from 'lucide-react';

const ROLE_PATHS = {
  coordinator: '/dashboard',
  committee: '/committee',
  admin: '/admin',
};

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);

    if (!result.ok) {
      setError(result.message || 'Login failed. Please try again.');
      return;
    }

    navigate(ROLE_PATHS[result.user.role] || '/dashboard');
  };

  return (
    <div className="page-center">
      <div style={{ width: '100%', maxWidth: 420 }} className="space-y-8">

        {/* Header */}
        <div className="text-center">
          <div className="login-logo-wrap" style={{ margin: '0 auto 12px' }}>
            <ClipboardList size={32} color="var(--clr-primary)" />
          </div>
          <h1 className="text-2xl font-bold">KFUPM Exam Booking</h1>
          <p className="text-sm text-muted mt-1">Midterm &amp; Major Exam Management System</p>
        </div>

        {/* Card */}
        <div className="card">
          <div className="card-content space-y-5" style={{ paddingTop: 24 }}>
            <div className="text-center">
              <h2 className="text-lg font-semibold">Sign In</h2>
              <p className="text-sm text-muted mt-1">Use your KFUPM account credentials</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email */}
              <div>
                <label htmlFor="email" style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@kfupm.edu.sa"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input"
                    style={{ paddingRight: 40 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(s => !s)}
                    style={{
                      position: 'absolute', right: 10, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--clr-muted)', padding: 0, display: 'flex',
                    }}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div role="alert" style={{
                  fontSize: 13,
                  color: 'var(--clr-danger, #c0392b)',
                  background: 'var(--clr-danger-light, #fdf0ee)',
                  border: '1px solid var(--clr-danger-border, #f5c6c2)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 12px',
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-block"
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Shield size={18} />
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <p className="text-xs text-center text-muted">
              Authorised KFUPM staff only
            </p>
          </div>
        </div>

        <p className="text-xs text-center text-muted">
          King Fahd University of Petroleum &amp; Minerals
        </p>
      </div>
    </div>
  );
};

export default Login;
