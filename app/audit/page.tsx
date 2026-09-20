'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  User,
  Activity,
  FileText,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { AccessAuditLog } from '@/types';

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AccessAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLogs() {
      try {
        const res = await fetch('/api/audit');
        const data = await res.json();
        setLogs(data);
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
          <span>Security & Compliance</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Tamper-Evident Access Audit Trail
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
          Complete audit history of all clinician lookups, QR authorization events, referral dispatches, and emergency break-glass overrides.
        </p>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Access Event Logs ({logs.length})</h2>
          <span className="text-xs text-slate-400">Append-only immutable record</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">Timestamp</th>
                <th className="py-3 px-3">Actor / Role</th>
                <th className="py-3 px-3">Patient</th>
                <th className="py-3 px-3">Action</th>
                <th className="py-3 px-3">Clinical Context / Reason</th>
                <th className="py-3 px-3 text-right">Access Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className="font-bold text-slate-900 block">{log.userName}</span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">{log.userRole}</span>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-800">
                    {log.patientName}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-600 max-w-xs">
                    {log.contextReason}
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    {log.isBreakGlass ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">
                        <ShieldAlert className="w-3 h-3" />
                        <span>Break-Glass</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Authorized</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
