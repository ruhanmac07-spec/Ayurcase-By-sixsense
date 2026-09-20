import React, { useState } from 'react';
import { Modal } from '../../components/Modal';
import { useNetwork } from '../../state/NetworkContext';
import { CheckCircle2, AlertCircle, RefreshCw, Network } from 'lucide-react';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { serverUrl, setServerUrl, testConnection } = useNetwork();
  const [urlInput, setUrlInput] = useState<string>(serverUrl);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  React.useEffect(() => {
    setUrlInput(serverUrl);
    setTestResult(null);
  }, [serverUrl, isOpen]);

  const normalizeUrl = (raw: string): string => {
    let u = raw.trim();
    if (!u) return 'http://127.0.0.1:8443';
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      u = `http://${u}`;
    }
    try {
      const parsed = new URL(u);
      if (!parsed.port) {
        u = `${parsed.protocol}//${parsed.hostname}:8443`;
      }
    } catch (_) {}
    return u.replace(/\/+$/, '');
  };

  const handleTest = async () => {
    const formatted = normalizeUrl(urlInput);
    setUrlInput(formatted);
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection(formatted);
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const formatted = normalizeUrl(urlInput);
    setServerUrl(formatted);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="LAN Server Configuration"
      subtitle="Connect AYURCASE to the central SIXSENSE Server on your local network"
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-charcoal mb-1">
            SIXSENSE Server URL / IP Address
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setTestResult(null);
              }}
              placeholder="e.g. http://127.0.0.1:8443"
              className="input-base font-mono text-xs"
            />
            <button
              onClick={handleTest}
              disabled={testing}
              className="btn-secondary whitespace-nowrap text-xs py-2"
            >
              {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Network className="w-3.5 h-3.5 mr-1" />}
              Test
            </button>
          </div>
          <div className="flex items-center space-x-2 mt-2">
            <span className="text-[11px] text-charcoal-muted font-medium">Presets:</span>
            <button
              type="button"
              onClick={() => {
                setUrlInput('http://127.0.0.1:8443');
                setTestResult(null);
              }}
              className="text-[11px] px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-charcoal font-mono border border-gray-200 transition-colors"
            >
              127.0.0.1:8443 (Local)
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlInput('http://localhost:8443');
                setTestResult(null);
              }}
              className="text-[11px] px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-charcoal font-mono border border-gray-200 transition-colors"
            >
              localhost:8443
            </button>
          </div>
          <p className="text-[11px] text-charcoal-muted mt-1.5">
            Enter the IP address of the Mac server hosting SIXSENSE Server on the LAN, or use 127.0.0.1:8443 if running locally.
          </p>
        </div>

        {/* Test Connection Result */}
        {testResult && (
          <div
            className={`p-3 rounded-md text-xs flex items-start space-x-2 ${
              testResult.ok
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-rose-50 text-rose-900 border border-rose-200'
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-semibold">{testResult.ok ? 'Connection Successful' : 'Connection Failed'}</div>
              <div className="text-[11px] mt-0.5">{testResult.message}</div>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
          <button onClick={onClose} className="btn-secondary text-xs">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary text-xs">
            Save &amp; Connect
          </button>
        </div>
      </div>
    </Modal>
  );
};
