import '@testing-library/jest-dom';

// Polyfill window.localStorage
const storage: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => {
      storage[key] = val;
    },
    removeItem: (key: string) => {
      delete storage[key];
    },
    clear: () => {
      for (const k in storage) delete storage[k];
    },
  },
  writable: true,
});

// Polyfill URL.createObjectURL and URL.revokeObjectURL for tests
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = (_blob: any) => `blob:http://localhost:5173/${Math.random().toString(36).substring(7)}`;
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = () => {};
}
if (typeof window !== 'undefined') {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = globalThis.URL.createObjectURL;
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = globalThis.URL.revokeObjectURL;
  }
}
