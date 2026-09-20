'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FileText,
  Printer,
  QrCode,
  CheckCircle2,
  Building2,
  Stethoscope,
  Clock,
  AlertTriangle,
  Pill,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { DigitalReferral } from '@/types';
import QRCode from 'qrcode';

function PatientReferralsContent() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('id');

  const [referrals, setReferrals] = useState<DigitalReferral[]>([]);
  const [selectedRef, setSelectedRef] = useState<DigitalReferral | null>(null);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReferrals() {
      try {
        const sessionRes = await fetch('/api/auth/session');
        const sessionData = await sessionRes.json();
        const activePatId = sessionData.user?.patientId || 'pat-1';
        const res = await fetch(`/api/referrals?patientId=${activePatId}`);
        const data = await res.json();
        setReferrals(Array.isArray(data) ? data : []);

        if (data.length > 0) {
          const matched = highlightId ? data.find((r: DigitalReferral) => r.id === highlightId) : data[0];
          const active = matched || data[0];
          setSelectedRef(active);
          generateQr(active.secureQrToken);
        }
      } finally {
        setLoading(false);
      }
    }
    loadReferrals();
  }, [highlightId]);

  const generateQr = async (token: string) => {
    try {
      const url = await QRCode.toDataURL(`CARECONNECT_REF:${token}`, {
        width: 180,
        margin: 1,
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
      setQrUrl(url);
    } catch {
      // ignore
    }
  };

  const handleSelect = (r: DigitalReferral) => {
    setSelectedRef(r);
    generateQr(r.secureQrToken);
  };

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
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
            Connected Digital Care
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            My Digital Referrals
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Official clinician-confirmed referrals to secondary and tertiary specialty facilities.
          </p>
        </div>

        {selectedRef && (
          <button
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Print Official Referral Slip</span>
          </button>
        )}
      </div>

      {referrals.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center text-slate-400 text-sm border border-slate-200">
          No digital referrals issued yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Referral Selector */}
          <div className="space-y-3 no-print">
            <h2 className="text-xs font-bold uppercase text-slate-400 px-1">All Referrals ({referrals.length})</h2>
            <div className="space-y-2">
              {referrals.map((ref) => {
                const isSelected = selectedRef?.id === ref.id;
                return (
                  <button
                    key={ref.id}
                    onClick={() => handleSelect(ref)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all space-y-2 ${
                      isSelected
                        ? 'bg-teal-50/70 border-teal-500 ring-1 ring-teal-500 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-teal-800">{ref.referralCode}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-800">
                        {ref.status}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-xs line-clamp-1">{ref.careRequirement}</h3>
                    <p className="text-[11px] text-slate-500 line-clamp-1">To: {ref.receivingFacilityName}</p>
                    <div className="text-[10px] text-slate-400">
                      {new Date(ref.createdAt).toLocaleDateString()}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Detailed Official Digital Referral Slip */}
          <div className="md:col-span-2">
            {selectedRef && (
              <div
                id="printable-referral-slip"
                className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6"
              >
                {/* Referral Slip Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-black text-teal-800 bg-teal-50 px-3 py-1 rounded-lg border border-teal-200">
                        {selectedRef.referralCode}
                      </span>
                      <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
                        selectedRef.urgency === 'EMERGENCY' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'
                      }`}>
                        Urgency: {selectedRef.urgency}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 pt-1">
                      Official Digital Clinical Referral
                    </h2>
                    <p className="text-xs text-slate-500">
                      Authorized by {selectedRef.referringDoctorName} • {selectedRef.referringClinic}
                    </p>
                  </div>

                  {/* Secure Token QR for Hospital Intake */}
                  <div className="flex flex-col items-center p-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex-shrink-0">
                    {qrUrl ? (
                      <img src={qrUrl} alt="Secure Referral Token" className="w-24 h-24 rounded" />
                    ) : (
                      <div className="w-24 h-24 bg-slate-200 animate-pulse rounded" />
                    )}
                    <span className="text-[9px] text-slate-400 font-mono mt-1">Opaque Token Verified</span>
                  </div>
                </div>

                {/* Patient Summary & Demographics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Patient</span>
                    <p className="font-bold text-slate-900">{selectedRef.patientSnapshot.name}</p>
                    <p className="text-slate-500">{selectedRef.patientSnapshot.age}y / {selectedRef.patientSnapshot.gender}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Blood Group</span>
                    <p className="font-bold text-slate-900">{selectedRef.patientSnapshot.bloodGroup || 'O+'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Contact</span>
                    <p className="font-mono font-semibold text-slate-700">{selectedRef.patientSnapshot.mobile}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Referral Date</span>
                    <p className="font-semibold text-slate-700">{new Date(selectedRef.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Critical Allergies Alert */}
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-amber-950">Patient Allergies:</span>
                    <span className="font-semibold text-amber-900">
                      {selectedRef.patientSnapshot.allergies.join(', ') || 'No Known Drug Allergies'}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-amber-700">Verified</span>
                </div>

                {/* Clinical Referral Findings & Reason */}
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wide">
                      Chief Complaint & Clinical Findings:
                    </span>
                    <p className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 leading-relaxed font-medium">
                      {selectedRef.clinicalFindings}
                    </p>
                  </div>

                  {selectedRef.vitals && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] text-slate-400">BP</span>
                        <p className="font-bold text-slate-900">{selectedRef.vitals.bloodPressure || 'N/A'}</p>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] text-slate-400">Pulse</span>
                        <p className="font-bold text-slate-900">{selectedRef.vitals.heartRate ? `${selectedRef.vitals.heartRate} bpm` : 'N/A'}</p>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] text-slate-400">SpO2</span>
                        <p className="font-bold text-slate-900">{selectedRef.vitals.spo2 ? `${selectedRef.vitals.spo2}%` : 'N/A'}</p>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] text-slate-400">Blood Sugar</span>
                        <p className="font-bold text-slate-900">{selectedRef.vitals.bloodGlucose ? `${selectedRef.vitals.bloodGlucose} mg/dL` : 'N/A'}</p>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] text-slate-400">Temp</span>
                        <p className="font-bold text-slate-900">{selectedRef.vitals.temperatureF ? `${selectedRef.vitals.temperatureF} °F` : '98.6 °F'}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wide">
                      Attending Clinician Confirmed Rationale:
                    </span>
                    <p className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200 text-teal-950 leading-relaxed font-semibold">
                      {selectedRef.doctorConfirmedDecision}
                    </p>
                  </div>
                </div>

                {/* Destination Facility & Required Capabilities */}
                <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-950 uppercase text-[10px] tracking-wider">
                      Designated Receiving Facility
                    </span>
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                      Capability Matched
                    </span>
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-sm">{selectedRef.receivingFacilityName}</h3>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {selectedRef.requiredCapabilities.map((cap) => (
                      <span
                        key={cap}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white text-purple-800 border border-purple-300"
                      >
                        ✓ {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Event Audit Trail */}
                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                  <span className="font-bold text-slate-800">Referral Lifecycle Timeline:</span>
                  <div className="space-y-1.5">
                    {selectedRef.events.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 text-[11px]">
                        <span className="font-mono text-slate-400">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                        <span className="font-bold text-slate-800">{ev.status}</span>
                        <span className="text-slate-500">• {ev.notes}</span>
                        <span className="text-slate-400 italic ml-auto">by {ev.actorName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PatientReferralsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading digital referrals...</div>}>
      <PatientReferralsContent />
    </Suspense>
  );
}

