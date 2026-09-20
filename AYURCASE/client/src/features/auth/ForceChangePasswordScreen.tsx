import React, { useState } from 'react';
import { useAuth } from '../../state/AuthContext';
import * as api from '../../api/endpoints';
import { Lock, AlertCircle } from 'lucide-react';

/**
 * Fullscreen interstitial shown when an Authority account logs in with
 * the default bootstrap password and must set a new one before proceeding.
 * The user CANNOT navigate away until the password is changed.
 */
export const ForceChangePasswordScreen: React.FC = () => {
  const { logout, clearMustChangePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.changePassword({ old_password: currentPassword, new_password: newPassword });
      clearMustChangePassword();
    } catch (err: any) {
      setError(err?.message || 'Failed to change password. Please check your current password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-200 p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-lg bg-amber-500 items-center justify-center text-white shadow-md mb-2">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-charcoal tracking-tight">Set New Password</h1>
          <p className="text-xs text-charcoal-muted">
            You are using the default system password. You must set a new password before accessing AYURCASE.
          </p>
        </div>

        {/* Security notice */}
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900">
          <strong>Security Requirement:</strong> The default password <code className="font-mono font-bold">0000</code> must
          be replaced immediately. Choose a strong password you have not used before.
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fcp-current" className="block text-xs font-semibold text-charcoal mb-1">
              Current Password (default: 0000)
            </label>
            <input
              id="fcp-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              required
              disabled={isSubmitting}
              className="input-base"
            />
          </div>

          <div>
            <label htmlFor="fcp-new" className="block text-xs font-semibold text-charcoal mb-1">
              New Password (min. 8 characters)
            </label>
            <input
              id="fcp-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              required
              disabled={isSubmitting}
              className="input-base"
            />
          </div>

          <div>
            <label htmlFor="fcp-confirm" className="block text-xs font-semibold text-charcoal mb-1">
              Confirm New Password
            </label>
            <input
              id="fcp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              disabled={isSubmitting}
              className="input-base"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-900 flex items-start space-x-2" role="alert">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
            className="btn-primary w-full py-2.5 text-sm font-semibold shadow-sm"
          >
            {isSubmitting ? 'Changing Password…' : 'Set New Password & Continue'}
          </button>
        </form>

        {/* Escape hatch */}
        <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-charcoal-muted">
          <span>Need help? Contact your SIXSENSE system administrator.</span>
          <button
            className="text-rose-700 font-semibold hover:underline"
            onClick={logout}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
