import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { changePassword } from '../services/api.js';
import { LayoutDashboard, LogOut, User, ClipboardList, Users, Settings, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';

const roleNavItems = {
  coordinator: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ],
  committee: [
    { href: '/committee', label: 'Dept. Head', icon: Users },
  ],
  admin: [
    { href: '/admin', label: 'Administration', icon: Settings },
  ],
};

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, updateAuthUser } = useAuth();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword.trim()) return toast.error('Enter a new password');
    if (newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      await changePassword(user.id, newPassword);
      updateAuthUser({ mustChangePassword: false });
      toast.success('Password changed successfully');
      setShowModal(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const navItems = roleNavItems[user?.role] || roleNavItems.coordinator;
  const displayName = user?.name || 'Guest';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--clr-bg)' }}>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="header-left">
            <Link to={navItems[0]?.href || '/dashboard'} className="app-logo">
              <ClipboardList size={24} />
              <span className="hidden-sm">Exam Booking</span>
            </Link>
            <nav className="header-nav">
              {navItems.map((item) => {
                const isActive =
                  location.pathname === item.href ||
                  location.pathname.startsWith(item.href + '/');
                return (
                  <Link key={item.href} to={item.href}>
                    <button
                      className={`btn btn-sm ${isActive ? 'btn-outline' : 'btn-ghost'}`}
                      style={isActive ? { background: 'var(--clr-primary-light)', fontWeight: 500 } : {}}
                    >
                      <item.icon size={16} />
                      {item.label}
                    </button>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="header-right">
            <span className="badge badge-secondary" style={{ textTransform: 'capitalize', fontSize: 11 }}>
              {user?.role === 'committee' ? 'Dept. Head' : user?.role || 'guest'}
            </span>
            <div className="header-user hidden-sm">
              <User size={16} />
              <span>{displayName}</span>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={handleLogout}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Default password warning banner */}
      {user?.mustChangePassword && !bannerDismissed && (
        <div style={{ background: '#fef3c7', borderBottom: '1px solid #fcd34d', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
          <span style={{ fontSize: 13, flex: 1 }}>
            You are using the default password. Please change it to secure your account.
          </span>
          <button
            className="btn btn-sm btn-outline"
            style={{ borderColor: '#d97706', color: '#d97706', fontSize: 12 }}
            onClick={() => setShowModal(true)}
          >
            Change Password
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setBannerDismissed(true)}>
            <X size={14} />
          </button>
        </div>
      )}

      <main className="container" style={{ padding: '24px 16px' }}>
        {children}
      </main>

      {/* Change password modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
          <div className="card" style={{ width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title">Change Password</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="card-content space-y-3">
              <div>
                <label className="text-sm font-medium">New Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Confirm Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--clr-border)' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleChangePassword} disabled={saving}>
                {saving ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;
