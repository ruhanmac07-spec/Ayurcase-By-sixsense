import { describe, it, expect, beforeEach } from 'vitest';
import { getServerUrl, setServerUrl, getAuthToken, setAuthToken, DEFAULT_SERVER_URL } from '../api/client';

describe('Client LAN & Session Manager', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to configured localhost LAN endpoint', () => {
    const url = getServerUrl();
    expect(url).toBe(DEFAULT_SERVER_URL);
  });

  it('persists and updates custom LAN IP and port', () => {
    setServerUrl('http://192.168.1.150:8443');
    expect(getServerUrl()).toBe('http://192.168.1.150:8443');
  });

  it('handles trailing slash normalization cleanly', () => {
    setServerUrl('http://192.168.1.150:8443/');
    expect(getServerUrl()).toBe('http://192.168.1.150:8443');
  });

  it('manages authentication bearer tokens', () => {
    expect(getAuthToken()).toBeNull();
    setAuthToken('tok_test_secure_token_123');
    expect(getAuthToken()).toBe('tok_test_secure_token_123');
    setAuthToken(null);
    expect(getAuthToken()).toBeNull();
  });
});
