import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getServerUrl, setServerUrl as saveServerUrl, DEFAULT_SERVER_URL } from '../api/client';

export type ConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'SERVER_UNAVAILABLE'
  | 'AUTHENTICATION_REQUIRED'
  | 'UNAVAILABLE'; // Backwards compatibility alias for SERVER_UNAVAILABLE

interface NetworkContextType {
  status: ConnectionStatus;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  checkConnection: () => Promise<boolean>;
  testConnection: (url: string) => Promise<{ ok: boolean; message: string }>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ConnectionStatus>('CONNECTING');
  const [serverUrl, setUrlState] = useState<string>(getServerUrl());

  const checkConnection = useCallback(async (): Promise<boolean> => {
    // 1. Hardware/network card disconnect check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('DISCONNECTED');
      return false;
    }

    const currentUrl = getServerUrl();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${currentUrl}/api/v1/health`, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const health = await res.json().catch(() => null);
        if (health && health.status === 'OK') {
          setStatus('CONNECTED');
          return true;
        }
      }
      throw new Error('Health check status not OK');
    } catch (_) {
      // Auto-fallback: If configured URL is not reachable, test DEFAULT_SERVER_URL if running locally
      if (currentUrl !== DEFAULT_SERVER_URL && typeof window !== 'undefined') {
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalHost) {
          try {
            const ctrlFb = new AbortController();
            const tFb = setTimeout(() => ctrlFb.abort(), 1500);
            const resFb = await fetch(`${DEFAULT_SERVER_URL}/api/v1/health`, { signal: ctrlFb.signal });
            clearTimeout(tFb);
            if (resFb.ok) {
              const dataFb = await resFb.json().catch(() => null);
              if (dataFb && dataFb.status === 'OK') {
                console.warn(`[SIXSENSE] Auto-repaired unreachable server URL ${currentUrl} -> ${DEFAULT_SERVER_URL}`);
                saveServerUrl(DEFAULT_SERVER_URL);
                setUrlState(DEFAULT_SERVER_URL);
                setStatus('CONNECTED');
                return true;
              }
            }
          } catch (_) {}
        }
      }
      setStatus('SERVER_UNAVAILABLE');
      return false;
    }
  }, []);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(() => {
      // If currently disconnected or unavailable, pulse reconnecting state while checking
      setStatus((prev) => (prev === 'SERVER_UNAVAILABLE' || prev === 'UNAVAILABLE' ? 'RECONNECTING' : prev));
      checkConnection();
    }, 10000);

    // Event listeners for browser/OS network status and session expiration
    const handleOnline = () => {
      setStatus('RECONNECTING');
      checkConnection();
    };
    const handleOffline = () => setStatus('DISCONNECTED');
    const handleSessionExpired = () => setStatus('AUTHENTICATION_REQUIRED');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sixsense_session_expired', handleSessionExpired);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sixsense_session_expired', handleSessionExpired);
    };
  }, [checkConnection]);

  const setServerUrl = (url: string) => {
    setStatus('CONNECTING');
    saveServerUrl(url);
    setUrlState(url);
    checkConnection();
  };

  const testConnection = async (url: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const formatted = url.replace(/\/+$/, '');
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${formatted}/api/v1/health`, { method: 'GET', signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const data = await res.json();
        return {
          ok: true,
          message: `Connected to ${data.service} (v${data.version}) - DB: ${data.database}`,
        };
      } else {
        return { ok: false, message: `Server returned HTTP ${res.status}` };
      }
    } catch (e: any) {
      return {
        ok: false,
        message:
          e.name === 'AbortError'
            ? 'Connection timed out after 3s. Verify host IP, port 8443, and local network Wi-Fi.'
            : e.message || 'Host unreachable',
      };
    }
  };

  return (
    <NetworkContext.Provider
      value={{
        status,
        serverUrl,
        setServerUrl,
        checkConnection,
        testConnection,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
