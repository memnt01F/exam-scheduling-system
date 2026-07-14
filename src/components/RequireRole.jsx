import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ROLE_HOME = {
  coordinator: '/dashboard',
  committee:   '/committee',
  admin:       '/admin',
};

/**
 * Wraps a route so only the listed roles can access it.
 * - No user (not logged in) → redirect to login page (/)
 * - Wrong role → redirect to that user's own home dashboard
 */
const RequireRole = ({ allow, children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (!allow.includes(user.role)) return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
  return children;
};

export default RequireRole;
