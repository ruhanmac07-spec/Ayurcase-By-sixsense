import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/navigation/Navbar';

export const metadata: Metadata = {
  title: 'CareConnect — Smart Healthcare Access & Referral',
  description:
    'Patient-first connected healthcare access, capability-aware facility matching, and digital referral platform for TECHNEXA 2026.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-700">
                TECHNEXA 2026 — Challenge #5: Smart Healthcare Access & Referral (SIXSENSE)
              </p>
              <p className="text-[11px] text-slate-400">
                AI decision support prototype. Not an autonomous diagnostic system. Preserves clinician authority at all times.
              </p>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>Fast-Lane SOS 108</span>
              <span>•</span>
              <span>Capability-Aware Matching</span>
              <span>•</span>
              <span>Opaque Token QR</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
