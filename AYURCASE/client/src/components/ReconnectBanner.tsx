import React from 'react';
import { useNetwork } from '../state/NetworkContext';
import { AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';

export const ReconnectBanner: React.FC = () => {
  const { status, checkConnection } = useNetwork();

  if (status === 'CONNECTED') {
    return null;
  }

  return (
    <div
      className={`w-full px-4 py-2 text-xs font-medium flex items-center justify-between transition-colors ${
        status === 'RECONNECTING'
          ? 'bg-amber-100 text-amber-900 border-b border-amber-200'
          : 'bg-red-100 text-red-900 border-b border-red-200'
      }`}
    >
      <div className="flex items-center space-x-2">
        {status === 'RECONNECTING' ? (
          <AlertTriangle className="w-4 h-4 text-amber-700 animate-pulse" />
        ) : (
          <WifiOff className="w-4 h-4 text-red-700" />
        )}
        <span>
          {status === 'RECONNECTING'
            ? 'Reconnecting to SIXSENSE Server over local network... In-flight form edits are preserved locally.'
            : 'SIXSENSE Server unavailable. Operations requiring the server are temporarily paused. Unsaved changes are retained in memory.'}
        </span>
      </div>

      <button
        onClick={() => checkConnection()}
        className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-white border border-gray-300 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <RefreshCw className="w-3 h-3 mr-1" />
        Retry Now
      </button>
    </div>
  );
};
