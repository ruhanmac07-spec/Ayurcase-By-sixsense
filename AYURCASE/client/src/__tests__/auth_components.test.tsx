import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginScreen } from '../features/auth/LoginScreen';
import { NetworkProvider } from '../state/NetworkContext';
import { AuthProvider } from '../state/AuthContext';

describe('LoginScreen Component', () => {
  it('renders clinical workstation branding and default credentials options', () => {
    render(
      <NetworkProvider>
        <AuthProvider>
          <LoginScreen />
        </AuthProvider>
      </NetworkProvider>
    );

    expect(screen.getByText('AYURCASE')).toBeInTheDocument();
    expect(
      screen.getByText(/Clinical Workstation • Powered by SIXSENSE Server/i)
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Sign In to Clinical Workstation/i })
    ).toBeInTheDocument();
  });

  it('does not render unprofessional synthetic demo quick buttons', () => {
    render(
      <NetworkProvider>
        <AuthProvider>
          <LoginScreen />
        </AuthProvider>
      </NetworkProvider>
    );

    expect(screen.queryByRole('button', { name: 'Doctor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assistant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Authority' })).not.toBeInTheDocument();
  });
});
