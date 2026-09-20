import React, { useState } from 'react';
import { useAuth } from '../../state/AuthContext';
import { useNetwork } from '../../state/NetworkContext';
import { Lock, User, AlertCircle, Settings } from 'lucide-react';
import { ServerSettingsModal } from './ServerSettingsModal';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const { status, serverUrl, setServerUrl } = useNetwork();

  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setError(null);
    setLoading(true);

    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Verify credentials and LAN connection.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-surface-base flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg border border-gray-200 p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-lg bg-brand-primary items-center justify-center text-white font-bold text-lg shadow-md mb-2">
            AC
          </div>
          <h1 className="text-2xl font-bold text-brand-primary tracking-tight">AYURCASE</h1>
          <p className="text-xs text-charcoal-muted">
            Clinical Workstation • Powered by SIXSENSE Server
          </p>
        </div>

        {/* Server LAN Connection Pill */}
        <div className="flex items-center justify-between px-3 py-2 rounded-md bg-surface-base border border-gray-200 text-xs">
          <div className="flex items-center space-x-2 truncate">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                status === 'CONNECTED'
                  ? 'bg-emerald-500'
                  : status === 'RECONNECTING'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span className="text-charcoal-muted font-mono truncate">{serverUrl}</span>
            {status === 'CONNECTED' && (
              <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">Online</span>
            )}
            {status === 'CONNECTING' && (
              <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">Connecting</span>
            )}
            {status === 'RECONNECTING' && (
              <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">Reconnecting</span>
            )}
            {status === 'DISCONNECTED' && (
              <span className="text-[10px] text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded">No Network</span>
            )}
            {(status === 'SERVER_UNAVAILABLE' || status === 'UNAVAILABLE') && (
              <span className="text-[10px] text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded">Offline</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="text-xs font-semibold text-brand-medium hover:text-brand-primary flex items-center ml-2 shrink-0"
          >
            <Settings className="w-3.5 h-3.5 mr-1" />
            Config
          </button>
        </div>

        {/* Offline / Unreachable Notice Banner */}
        {(status === 'SERVER_UNAVAILABLE' || status === 'UNAVAILABLE' || status === 'DISCONNECTED') && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-950 flex items-center justify-between space-x-2 animate-in fade-in">
            <div className="flex items-center space-x-2 truncate">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="truncate">Cannot reach server at <code className="font-mono text-[11px] font-bold">{serverUrl}</code></span>
            </div>
            <button
              type="button"
              onClick={() => {
                setServerUrl('http://127.0.0.1:8443');
                setError(null);
              }}
              className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold shrink-0 transition-colors shadow-2xs"
            >
              Use Localhost
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-900 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Username
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="input-base pl-9 text-sm"
                placeholder="Enter username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-base pl-9 text-sm"
                placeholder="Enter password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-2.5 text-sm font-semibold shadow-sm"
          >
            {loading ? 'Authenticating...' : 'Sign In to Clinical Workstation'}
          </button>
        </form>

      </div>

      <ServerSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
