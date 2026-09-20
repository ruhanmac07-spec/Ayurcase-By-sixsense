import React from 'react';
import { useAuth } from '../state/AuthContext';
import { useNetwork } from '../state/NetworkContext';
import { LogOut, Settings, WifiOff } from 'lucide-react';

interface TopBarProps {
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenSettings }) => {
  const { user, logout } = useAuth();
  const { status } = useNetwork();

  return (
    <header className="h-14 bg-surface-panel border-b border-gray-200 px-4 flex items-center justify-between select-none shrink-0 shadow-sm">
      {/* Brand Identity */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded bg-brand-primary flex items-center justify-center text-white font-bold text-sm tracking-wider shadow-sm">
          AC
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-brand-primary text-base tracking-tight">AYURCASE</span>
            <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-brand-tint text-brand-primary">
              Phase 2
            </span>
          </div>
          <div className="text-[11px] text-charcoal-muted leading-none">
            Clinical Workstation • SIXSENSE Server
          </div>
        </div>
      </div>

      {/* Middle: Workspace Indicator */}
      <div className="hidden md:flex items-center space-x-2 bg-surface-base border border-gray-200 px-3 py-1 rounded-md">
        <span className="text-xs text-charcoal-muted font-medium">Department:</span>
        <span className="text-xs font-semibold text-charcoal">
          {user?.workspace_name || 'Global Administration'}
        </span>
        {user?.workspace_code && (
          <span className="text-[10px] font-mono font-bold bg-gray-200 text-gray-700 px-1 rounded">
            {user.workspace_code}
          </span>
        )}
      </div>

      {/* Right Controls: LAN Connection, User Profile, Settings, Logout */}
      <div className="flex items-center space-x-4">
        {/* Connection Status Badge */}
        <div className="flex items-center space-x-1.5">
          {status === 'CONNECTED' ? (
            <span className="flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
              LAN Connected
            </span>
          ) : status === 'CONNECTING' ? (
            <span className="flex items-center text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5 animate-pulse"></span>
              Connecting...
            </span>
          ) : status === 'RECONNECTING' ? (
            <span className="flex items-center text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5 animate-ping"></span>
              Reconnecting
            </span>
          ) : status === 'DISCONNECTED' ? (
            <span className="flex items-center text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
              <WifiOff className="w-3 h-3 mr-1 text-rose-600" />
              Network Disconnected
            </span>
          ) : status === 'AUTHENTICATION_REQUIRED' ? (
            <span className="flex items-center text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              Session Expired
            </span>
          ) : (
            <span className="flex items-center text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
              <WifiOff className="w-3 h-3 mr-1 text-rose-600" />
              Server Unavailable
            </span>
          )}
        </div>

        {/* User Identity */}
        <div className="flex items-center space-x-2 pl-2 border-l border-gray-200">
          <div className="text-right">
            <div className="text-xs font-semibold text-charcoal leading-tight">
              {user?.full_name}
            </div>
            <div className="text-[10px] font-medium text-charcoal-muted uppercase">
              {user?.role}
            </div>
          </div>
          <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center text-xs font-bold text-brand-medium">
            {user?.full_name.charAt(0)}
          </div>
        </div>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          title="Server Connection & Settings"
          className="p-1.5 text-charcoal-muted hover:text-charcoal hover:bg-gray-100 rounded-md transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Logout button */}
        <button
          onClick={() => logout()}
          title="Sign Out"
          className="p-1.5 text-charcoal-muted hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
