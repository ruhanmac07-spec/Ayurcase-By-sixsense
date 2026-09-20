import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserSessionProfile } from '../api/types';
import * as api from '../api/endpoints';
import { getAuthToken, setAuthToken } from '../api/client';

interface AuthContextType {
  user: UserSessionProfile | null;
  token: string | null;
  isLoading: boolean;
  /** True when the logged-in Authority account must change its default password before proceeding. */
  mustChangePassword: boolean;
  /** Call after the forced password change is complete to clear the flag. */
  clearMustChangePassword: () => void;
  login: (username: string, password: string) => Promise<UserSessionProfile>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSessionProfile | null>(null);
  const [token, setToken] = useState<string | null>(getAuthToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);

  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      setToken(null);
      setMustChangePassword(false);
    };

    window.addEventListener('sixsense_session_expired', handleExpired);
    return () => window.removeEventListener('sixsense_session_expired', handleExpired);
  }, []);

  const refreshSession = async () => {
    const currentToken = getAuthToken();
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const profile = await api.getCurrentSession();
      setUser(profile);
      setToken(currentToken);
      // Note: must_change_password is only returned by the login endpoint, not getCurrentSession.
      // If the page is refreshed while the force-change screen is up, the user remains on it.
    } catch (err) {
      setUser(null);
      setToken(null);
      setAuthToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.login({ username, password });
    setAuthToken(res.token);
    setToken(res.token);
    setUser(res.user);
    // Signal that this Authority account must change its default password
    setMustChangePassword(res.must_change_password === true);
    return res.user;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (_) {
      // Ignore network errors during logout
    } finally {
      setAuthToken(null);
      setToken(null);
      setUser(null);
      setMustChangePassword(false);
    }
  };

  const clearMustChangePassword = () => setMustChangePassword(false);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, mustChangePassword, clearMustChangePassword, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
