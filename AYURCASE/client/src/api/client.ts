// AYURCASE LAN API Client
// Communicates over local network with SIXSENSE Server

export const DEFAULT_SERVER_URL = 'http://127.0.0.1:8443';

export function getServerUrl(): string {
  return localStorage.getItem('sixsense_server_url') || DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string): void {
  const trimmed = url.replace(/\/+$/, '');
  localStorage.setItem('sixsense_server_url', trimmed);
}

export function getAuthToken(): string | null {
  return localStorage.getItem('sixsense_token');
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('sixsense_token', token);
  } else {
    localStorage.removeItem('sixsense_token');
  }
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getServerUrl();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${baseUrl}/api/v1${path.startsWith('/') ? path : `/${path}`}`;

  // Use AbortController for a 6-second timeout so requests never hang indefinitely
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  const signal = options.signal || controller.signal;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 401) {
      // Session expired or invalid
      setAuthToken(null);
      window.dispatchEvent(new CustomEvent('sixsense_session_expired'));
    }

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      const err = json?.error || {
        code: `HTTP_${response.status}`,
        message: response.statusText || 'An unexpected server error occurred',
      };
      throw err;
    }

    return json as T;
  } catch (err: any) {
    clearTimeout(timeoutId);

    // If it's an explicit API error returned from server, rethrow it
    if (err.code && err.code !== 'NETWORK_ERROR') {
      throw err;
    }

    // Auto-heal: If user is accessing via localhost and the configured LAN IP is dead,
    // but the local server (127.0.0.1:8443) is alive, switch and retry!
    if (baseUrl !== DEFAULT_SERVER_URL && typeof window !== 'undefined') {
      const isLocalClient = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalClient) {
        try {
          const fallbackCtrl = new AbortController();
          const fbTimer = setTimeout(() => fallbackCtrl.abort(), 2000);
          const fallbackCheck = await fetch(`${DEFAULT_SERVER_URL}/api/v1/health`, {
            signal: fallbackCtrl.signal,
          });
          clearTimeout(fbTimer);

          if (fallbackCheck.ok) {
            console.warn(`[SIXSENSE] Configured server ${baseUrl} is unreachable. Auto-switching to active local server ${DEFAULT_SERVER_URL}`);
            setServerUrl(DEFAULT_SERVER_URL);

            // Retry request with default local server URL
            const retryUrl = `${DEFAULT_SERVER_URL}/api/v1${path.startsWith('/') ? path : `/${path}`}`;
            const retryCtrl = new AbortController();
            const retryTimer = setTimeout(() => retryCtrl.abort(), 6000);
            const retryRes = await fetch(retryUrl, { ...options, headers, signal: retryCtrl.signal });
            clearTimeout(retryTimer);

            if (retryRes.status === 401) {
              setAuthToken(null);
              window.dispatchEvent(new CustomEvent('sixsense_session_expired'));
            }

            const retryJson = await retryRes.json().catch(() => null);
            if (!retryRes.ok) {
              throw retryJson?.error || {
                code: `HTTP_${retryRes.status}`,
                message: retryRes.statusText || 'Server error',
              };
            }
            return retryJson as T;
          }
        } catch (_) {
          // Fallback check also failed, proceed to throw network error
        }
      }
    }

    // Network failure / server offline / timeout
    const isTimeout = err.name === 'AbortError';
    throw {
      code: 'NETWORK_ERROR',
      message: isTimeout
        ? `Connection to SIXSENSE Server timed out (${baseUrl}). Check if server is running.`
        : `Cannot reach SIXSENSE Server at ${baseUrl}. Verify host address and port 8443.`,
    };
  }
}

export async function fetchDocumentHtml(documentId: string): Promise<string> {
  const baseUrl = getServerUrl();
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = `${baseUrl}/api/v1/documents/${documentId}/download?format=html`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download document HTML (${response.status} ${response.statusText})`);
  }
  return response.text();
}

export async function fetchDocumentPdfBlobUrl(documentId: string): Promise<string> {
  const baseUrl = getServerUrl();
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = `${baseUrl}/api/v1/documents/${documentId}/download?format=pdf`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download document PDF (${response.status} ${response.statusText})`);
  }
  const blob = await response.blob();
  const pdfBlob = new Blob([blob], { type: 'application/pdf' });
  return URL.createObjectURL(pdfBlob);
}

export async function fetchDocumentHtmlBlobUrl(documentId: string): Promise<string> {
  const baseUrl = getServerUrl();
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = `${baseUrl}/api/v1/documents/${documentId}/download?format=html`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download document HTML (${response.status} ${response.statusText})`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    const blob = await response.blob();
    const pdfBlob = new Blob([blob], { type: 'application/pdf' });
    return URL.createObjectURL(pdfBlob);
  }
  const text = await response.text();
  if (text.startsWith('%PDF-')) {
    const pdfBlob = new Blob([text], { type: 'application/pdf' });
    return URL.createObjectURL(pdfBlob);
  }
  const htmlBlob = new Blob([text], { type: 'text/html;charset=utf-8' });
  return URL.createObjectURL(htmlBlob);
}

export async function fetchCsvTemplate(templateType: string): Promise<string> {
  const baseUrl = getServerUrl();
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = `${baseUrl}/api/v1/diagnosis/medicines/template?type=${encodeURIComponent(templateType)}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download CSV template (${response.status} ${response.statusText})`);
  }
  return response.text();
}


