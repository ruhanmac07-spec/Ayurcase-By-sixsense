'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  QrCode,
  ShieldCheck,
  ShieldAlert,
  User,
  AlertTriangle,
  ArrowRight,
  Clock,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { PatientProfile } from '@/types';

function DoctorPatientLookupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [requiresConsent, setRequiresConsent] = useState(false);
  const [isBreakGlassModalOpen, setIsBreakGlassModalOpen] = useState(false);
  const [breakGlassReason, setBreakGlassReason] = useState('Unconscious patient arrived at PHC. Immediate clinical history required.');

  useEffect(() => {
    if (initialQuery) {
      handleLookup(initialQuery);
    }
  }, [initialQuery]);

  const handleLookup = async (searchStr: string, isBreakGlass = false) => {
    if (!searchStr.trim()) return;
    setIsSearching(true);
    setErrorMessage('');
    setRequiresConsent(false);

    try {
      const res = await fetch('/api/patient/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'DOCTOR',
          'x-user-id': 'usr-doctor-1',
        },
        body: JSON.stringify({
          query: searchStr.trim(),
          isBreakGlass,
          breakGlassReason: isBreakGlass ? breakGlassReason : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.requiresConsent) {
          setRequiresConsent(true);
        }
        setErrorMessage(data.error || 'Failed to lookup patient');
        setPatient(null);
      } else {
        setPatient(data.patient);
        setIsBreakGlassModalOpen(false);
      }
    } catch {
      setErrorMessage('Network error during lookup');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSimulateScan = (tokenId: string) => {
    setQuery(tokenId);
    handleLookup(tokenId);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Authorized Patient Identity Lookup</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Search & Authorize Patient Access
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Lookup by unique Patient ID, opaque QR token, or registered phone number. Access is audited and consent-governed.
        </p>
      </div>

      {/* Search Bar & QR Simulation */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLookup(query);
          }}
          className="flex flex-col sm:flex-row items-center gap-3"
        >
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
            <input
              type="text"
              placeholder="Enter Patient ID (pat-1), QR Token (PAT-1081-SEC), or Mobile..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={isSearching}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow-sm transition-all"
          >
            {isSearching ? 'Searching...' : 'Lookup Patient'}
          </button>
        </form>

        {/* 1-Click QR Scan Simulators */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
            Simulate Scanning Patient QR Codes:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleSimulateScan('PAT-1081-SEC')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              <QrCode className="w-3.5 h-3.5 text-teal-600" />
              <span>Scan Ramesh Patel (PAT-1081-SEC)</span>
            </button>
            <button
              onClick={() => handleSimulateScan('PAT-2094-SEC')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              <QrCode className="w-3.5 h-3.5 text-blue-600" />
              <span>Scan Priya Shah (PAT-2094-SEC)</span>
            </button>
            <button
              onClick={() => handleSimulateScan('PAT-3382-SEC')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              <QrCode className="w-3.5 h-3.5 text-purple-600" />
              <span>Scan Vikram Singh (PAT-3382-SEC)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error / Consent Prompt */}
      {errorMessage && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-900">Access Authorization Notice</h3>
              <p className="text-xs text-amber-800">{errorMessage}</p>
            </div>
          </div>

          {requiresConsent && (
            <div className="pt-2 border-t border-amber-200 flex items-center justify-between">
              <span className="text-xs text-amber-900">In an emergency situation, doctors can invoke break-glass access.</span>
              <button
                onClick={() => setIsBreakGlassModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm"
              >
                Emergency Break-Glass Override
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search Result Card */}
      {patient && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-md space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {patient.secureTokenId}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ✓ Patient Consent Authorized
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900">{patient.name}</h2>
              <p className="text-xs text-slate-500">
                {patient.age} yrs • {patient.gender} • Blood Group: <strong>{patient.bloodGroup || 'N/A'}</strong> • {patient.location}
              </p>
            </div>

            <button
              onClick={() => router.push(`/doctor/workspace/${patient.id}`)}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow-md transition-all hover:scale-105"
            >
              <span>Open Clinical Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-amber-800">Critical Allergies</span>
              <p className="font-bold text-amber-950">{patient.allergies.join(', ') || 'No known allergies'}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400">Current Medications</span>
              <p className="font-bold text-slate-800">
                {patient.currentMedications.map((m) => `${m.name} ${m.dosage}`).join(', ') || 'None recorded'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400">Known Conditions</span>
              <p className="font-bold text-slate-800">{patient.existingConditions.join(', ') || 'None reported'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Break-Glass Emergency Modal */}
      {isBreakGlassModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <ShieldAlert className="w-8 h-8" />
              <h2 className="text-lg font-bold text-slate-900">Emergency Break-Glass Access</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This action overrides routine patient consent. It will be recorded permanently in the tamper-evident
              audit log with your identity, timestamp, and clinical justification.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Clinical Emergency Justification</label>
              <textarea
                rows={3}
                value={breakGlassReason}
                onChange={(e) => setBreakGlassReason(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 text-xs font-medium text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsBreakGlassModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => handleLookup(query, true)}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm"
              >
                Confirm Break-Glass Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DoctorPatientLookupPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading patient search...</div>}>
      <DoctorPatientLookupContent />
    </Suspense>
  );
}

