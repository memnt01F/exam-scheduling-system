import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LayoutDashboard, LogOut, User, ClipboardList, Users, Settings } from 'lucide-react';

const roleNavItems = {
  coordinator: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ],
  committee: [
    { href: '/committee', label: 'Committee', icon: Users },
  ],
  admin: [
    { href: '/admin', label: 'Administration', icon: Settings },
  ],
};

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

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
              {user?.role || 'guest'}
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

      <main className="container" style={{ padding: '24px 16px' }}>
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
