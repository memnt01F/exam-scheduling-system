import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ClipboardList, Shield, Users, Settings, BookOpen } from 'lucide-react';

const roles = [
  {
    key: 'coordinator',
    label: 'Course Coordinator',
    desc: 'Book and manage exam slots for your assigned courses',
    icon: BookOpen,
    path: '/dashboard',
  },
  {
    key: 'committee',
    label: 'Scheduling Committee',
    desc: 'Oversee all bookings, configure phases, and manage schedules',
    icon: Users,
    path: '/committee',
  },
  {
    key: 'admin',
    label: 'System Admin',
    desc: 'Manage users, roles, system settings, and audit logs',
    icon: Settings,
    path: '/admin',
  },
];

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState('coordinator');

  const handleLogin = () => {
    login(selectedRole);
    const role = roles.find(r => r.key === selectedRole);
    navigate(role.path);
  };

  return (
    <div className="page-center">
      <div style={{ width: '100%', maxWidth: 440 }} className="space-y-8">
        <div className="text-center">
          <div className="login-logo-wrap" style={{ margin: '0 auto 12px' }}>
            <ClipboardList size={32} color="var(--clr-primary)" />
          </div>
          <h1 className="text-2xl font-bold">KFUPM Exam Booking</h1>
          <p className="text-sm text-muted mt-1">Midterm & Major Exam Management System</p>
        </div>

        <div className="card">
          <div className="card-content space-y-6" style={{ paddingTop: 24 }}>
            <div className="text-center">
              <h2 className="text-lg font-semibold">Sign In</h2>
              <p className="text-sm text-muted mt-1">
                Select your role and sign in with your KFUPM account
              </p>
            </div>

            <div className="space-y-2">
              {roles.map((role) => {
                const Icon = role.icon;
                const isSelected = selectedRole === role.key;
                return (
                  <button
                    key={role.key}
                    className="role-option"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      border: `2px solid ${isSelected ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                      borderRadius: 'var(--radius)',
                      background: isSelected ? 'var(--clr-primary-light)' : 'var(--clr-card)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => setSelectedRole(role.key)}
                  >
                    <div style={{
                      width: 40, height: 40,
                      borderRadius: 8,
                      background: isSelected ? 'var(--clr-primary)' : 'var(--clr-muted-bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={18} color={isSelected ? 'white' : 'var(--clr-muted)'} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--clr-fg)' }}>{role.label}</p>
                      <p style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 2 }}>{role.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <button className="btn btn-primary btn-lg btn-block" onClick={handleLogin}>
              <Shield size={20} />
              Login with KFUPM Account
            </button>

            <p className="text-xs text-center text-muted">
              Authentication via Microsoft SSO · Only authorized faculty and staff
            </p>
          </div>
        </div>

        <p className="text-xs text-center text-muted">
          King Fahd University of Petroleum & Minerals
        </p>
      </div>
    </div>
  );
};

export default Login;
