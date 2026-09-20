import React from 'react';
import ReactDOM from 'react-dom/client';
import { NetworkProvider } from './state/NetworkContext';
import { AuthProvider } from './state/AuthContext';
import { App } from './App';
import './index.css';

import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="AYURCASE Desktop Application Error Boundary">
      <NetworkProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </NetworkProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
