'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Facility, FacilityCapability } from '@/types';

const ALL_CAPABILITIES: FacilityCapability[] = [
  'CARDIOLOGY',
  'CATH_LAB',
  'ECG',
  'EMERGENCY_24_7',
  'ICU',
  'TRAUMA_CARE',
  'NEUROLOGY',
  'ORTHOPEDICS',
  'PEDIATRICS',
  'DIAGNOSTIC_CT_MRI',
  'GENERAL_MEDICINE',
];

export default function FacilityCapabilitiesPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadFacilities();
  }, []);

  const loadFacilities = async () => {
    try {
      const res = await fetch('/api/facilities');
      const data = await res.json();
      setFacilities(data);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCapability = async (facilityId: string, cap: FacilityCapability) => {
    setUpdatingId(`${facilityId}-${cap}`);
    try {
      const res = await fetch('/api/facilities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilityId, capability: cap }),
      });
      if (res.ok) {
        await loadFacilities();
      }
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-800 text-xs font-semibold">
          <Building2 className="w-3.5 h-3.5" />
          <span>Hospital Administration</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Facility Service & Capability Registry
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
          Toggle active facility capabilities. The facility matching engine immediately adapts:
          referrals requiring specific capabilities (e.g. <strong>CATH_LAB</strong> or <strong>TRAUMA_CARE</strong>)
          will dynamically include or exclude facilities based on verified real-time capabilities.
        </p>
      </div>

      {/* Facilities Grid */}
      <div className="grid grid-cols-1 gap-6">
        {facilities.map((fac) => (
          <div
            key={fac.id}
            className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{fac.name}</h2>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                    {fac.type}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {fac.address} • Contact: {fac.phone} • Emergency: <strong className="text-red-600">{fac.emergencyPhone}</strong>
                </p>
              </div>

              <div className="text-xs text-slate-400">
                {fac.capabilities.length} active capabilities
              </div>
            </div>

            {fac.demoNote && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>{fac.demoNote}</span>
              </div>
            )}

            {/* Capability Toggle Badges */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700">Configured Clinical Capabilities (Click to toggle):</span>
              <div className="flex flex-wrap gap-2">
                {ALL_CAPABILITIES.map((cap) => {
                  const isActive = fac.capabilities.includes(cap);
                  const isBusy = updatingId === `${fac.id}-${cap}`;
                  return (
                    <button
                      key={cap}
                      onClick={() => handleToggleCapability(fac.id, cap)}
                      disabled={isBusy}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {isActive ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-slate-300" />
                      )}
                      <span>{cap}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
