'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Stethoscope,
  Search,
  QrCode,
  Users,
  AlertOctagon,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Building2,
  FileText,
  Activity,
} from 'lucide-react';
import { DigitalReferral, PatientProfile, EmergencyEvent } from '@/types';

export default function DoctorDashboardPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [referrals, setReferrals] = useState<DigitalReferral[]>([]);
  const [emergencyEvents, setEmergencyEvents] = useState<EmergencyEvent[]>([]);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [rRes, sRes, pRes] = await Promise.all([
          fetch('/api/referrals'),
          fetch('/api/sos'),
          fetch('/api/patient'),
        ]);
        const rData = await rRes.json();
        const sData = await sRes.json();
        const pData = await pRes.json();
        setReferrals(Array.isArray(rData) ? rData : []);
        setEmergencyEvents(Array.isArray(sData) ? sData : []);
        setPatients(Array.isArray(pData) ? pData : [pData]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/doctor/patients?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
              Primary Health Centre (PHC)
            </span>
            <span className="text-xs text-slate-400">Anand Rural Clinic</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Dr. Priya Sharma (Medical Officer)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Outpatient clinical documentation, AI-assisted care routing, and specialist referral pipeline.
          </p>
        </div>

        {/* Quick Patient Search Input */}
        <form onSubmit={handleSearchSubmit} className="w-full md:w-80 space-y-1">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search ID, QR, Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
          <p className="text-[10px] text-slate-400 px-1">Try: <strong>PAT-1081-SEC</strong> or <strong>98250 12345</strong></p>
        </form>
      </div>

      {/* Emergency Alert Banner if Active SOS Cases Exist */}
      {emergencyEvents.length > 0 && (
        <div className="bg-red-50 border-2 border-red-500 rounded-3xl p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-900 font-extrabold text-sm">
              <AlertOctagon className="w-5 h-5 text-red-600 animate-pulse" />
              <span>ACTIVE EMERGENCY SOS BROADCAST ({emergencyEvents.length})</span>
            </div>
            <span className="text-[10px] uppercase font-bold text-red-800 bg-red-100 px-2.5 py-1 rounded-full">
              Realtime Fast-Lane
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {emergencyEvents.slice(0, 2).map((ev) => (
              <div key={ev.id} className="p-3.5 rounded-2xl bg-white border border-red-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">{ev.patientName} ({ev.patientAge}y)</span>
                  <p className="text-red-700 font-semibold text-[11px]">{ev.emergencySymptoms[0]}</p>
                  <p className="text-slate-400 text-[10px]">Ambulance: {ev.ambulanceId} • {ev.ambulanceStatus}</p>
                </div>
                <Link
                  href="/patient/sos"
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                >
                  View HUD
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Access Pre-Seeded Patient Workspace Buttons */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 sm:p-8 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">Live Demo Roster</span>
            <h2 className="text-lg font-bold">1-Click Clinical Patient Workspace</h2>
          </div>
          <Link
            href="/doctor/patients"
            className="text-xs text-teal-300 hover:underline flex items-center gap-1"
          >
            <span>Scan QR / Search Patient</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <Link
            href="/doctor/workspace/pat-1"
            className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left space-y-2 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white group-hover:text-teal-300">Ramesh Patel (52M)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-teal-400">PAT-1081</span>
            </div>
            <p className="text-xs text-slate-300">Chief Complaint: Exertional chest heaviness, hypertension</p>
            <div className="text-[10px] text-amber-400 font-semibold">Allergy: Sulfa Drugs</div>
          </Link>

          <Link
            href="/doctor/workspace/pat-2"
            className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left space-y-2 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white group-hover:text-teal-300">Priya Shah (28F)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-teal-400">PAT-2094</span>
            </div>
            <p className="text-xs text-slate-300">Chief Complaint: Acute wheezing, bronchial asthma</p>
            <div className="text-[10px] text-red-400 font-extrabold">Allergy: PENICILLIN (ANAPHYLAXIS)</div>
          </Link>

          <Link
            href="/doctor/workspace/pat-3"
            className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left space-y-2 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white group-hover:text-teal-300">Vikram Singh (34M)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-teal-400">PAT-3382</span>
            </div>
            <p className="text-xs text-slate-300">Chief Complaint: Highway collision trauma, compound injury</p>
            <div className="text-[10px] text-emerald-400 font-semibold">Blood: AB+ • NKDA</div>
          </Link>
        </div>
      </div>

      {/* Outbound Referrals Queue */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Today&apos;s Outbound Referrals ({referrals.length})</h2>
            <p className="text-xs text-slate-500">Track referrals generated from this primary care facility</p>
          </div>
        </div>

        <div className="space-y-3">
          {referrals.map((ref) => (
            <div
              key={ref.id}
              className="p-4 rounded-2xl border border-slate-200 hover:border-blue-400 transition-colors bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-blue-700">{ref.referralCode}</span>
                  <span className={`px-2 py-0.5 rounded-full uppercase font-bold ${
                    ref.urgency === 'EMERGENCY' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {ref.urgency}
                  </span>
                  <span className="px-2 py-0.5 rounded-full uppercase font-bold bg-emerald-100 text-emerald-800">
                    Status: {ref.status}
                  </span>
                  {ref.isDoctorOverridden && (
                    <span className="px-2 py-0.5 rounded-full uppercase font-bold bg-purple-100 text-purple-800">
                      Doctor Overridden
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-sm">{ref.patientSnapshot.name} ({ref.patientSnapshot.age}y) — {ref.careRequirement}</h3>
                <p className="text-slate-500">
                  Destination: <strong>{ref.receivingFacilityName}</strong>
                </p>
              </div>

              <Link
                href={`/patient/referrals?id=${ref.id}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 font-semibold text-slate-800 shadow-sm"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Open Referral</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
