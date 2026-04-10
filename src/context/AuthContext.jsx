import { createContext, useContext, useState } from 'react';

const users = {
  coordinator: {
    id: 'u1',
    name: 'Dr. Khadijah AlSafwan',
    email: 'khadijah.safwan@kfupm.edu.sa',
    role: 'coordinator',
  },
  committee: {
    id: 'u2',
    name: 'Dr. Mujahid Syed',
    email: 'smujahid@kfupm.edu.sa',
    role: 'committee',
  },
  admin: {
    id: 'u3',
    name: 'Abdulmohsen Alai',
    email: 'abdulmohsen.alai@kfupm.edu.sa',
    role: 'admin',
  },
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  const login = (role) => {
    setUser(users[role]);
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) return { user: null, login: () => {}, logout: () => {} };
  return ctx;
};
