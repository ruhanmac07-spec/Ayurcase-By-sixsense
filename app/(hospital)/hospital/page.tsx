'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  AlertOctagon,
  CheckCircle2,
  Clock,
  UserCheck,
  FileText,
  AlertTriangle,
  Pill,
  Send,
  XCircle,
  Activity,
  ArrowRight,
  ShieldAlert,
  Ambulance,
  Filter,
} from 'lucide-react';
import { DigitalReferral, EmergencyEvent, ReferralStatus } from '@/types';

export default function HospitalDashboardPage() {
  const [referrals, setReferrals] = useState<DigitalReferral[]>([]);
  const [emergencyEvents, setEmergencyEvents] = useState<EmergencyEvent[]>([]);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Outcome modal state
  const [isOutcomeModalOpen, setIsOutcomeModalOpen] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<DigitalReferral | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('Patient underwent emergency primary PCI (coronary stenting) with drug-eluting stent. Hemodynamically stable.');
  const [counterReferralNotes, setCounterReferralNotes] = useState('Advised Dual Antiplatelet Therapy (DAPT) for 12 months. Routine follow-up ECG & cardiac rehab at referring PHC in 14 days.');

  useEffect(() => {
    loadHospitalData();
    // Poll every 5s for realtime demonstration
    const timer = setInterval(loadHospitalData, 5000);
    return () => clearInterval(timer);
  }, []);

  const loadHospitalData = async () => {
    try {
      const [rRes, sRes] = await Promise.all([
        fetch('/api/referrals?facilityId=fac-hosp-1'),
        fetch('/api/sos'),
      ]);
      const rData = await rRes.json();
      const sData = await sRes.json();
      setReferrals(rData);
      setEmergencyEvents(sData);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (
    referralId: string,
    status: ReferralStatus,
    notes?: string,
    customOutcome?: string,
    customCounter?: string
  ) => {
    try {
      const res = await fetch(`/api/referrals/${referralId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'HOSPITAL_DOCTOR',
          'x-user-id': 'usr-hospital-doc-1',
        },
        body: JSON.stringify({
          status,
          notes,
          outcomeNotes: customOutcome,
          counterReferralFollowUp: customCounter,
        }),
      });
      const data = await res.json();
      if (data.referral) {
        await loadHospitalData();
        setIsOutcomeModalOpen(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredReferrals = referrals.filter((r) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'EMERGENCY') return r.urgency === 'EMERGENCY';
    if (activeTab === 'NEW') return r.status === 'CONFIRMED' || r.status === 'SENT';
    if (activeTab === 'ACCEPTED') return r.status === 'ACCEPTED';
    if (activeTab === 'ARRIVED') return r.status === 'ARRIVED';
    if (activeTab === 'COMPLETED') return r.status === 'COMPLETED_OUTCOME';
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Hospital Identity Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">
              Tertiary Care Intake HUD
            </span>
            <span className="text-xs text-slate-400">Dr. Rajesh Mehta (Cardiology Head)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Sterling Apex Heart & Multi-Specialty Hospital
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Realtime triage dashboard for incoming primary referrals and emergency 108 trauma fast-lane.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/hospital/facilities"
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
          >
            Admin Capabilities
          </Link>
        </div>
      </div>

      {/* EMERGENCY PRIORITY LANE (Top PRD Invariant) */}
      {emergencyEvents.length > 0 && (
        <div className="bg-red-600 text-white rounded-3xl p-6 sm:p-8 shadow-2xl border-4 border-red-500 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white text-red-600 flex items-center justify-center animate-bounce shadow-md">
                <AlertOctagon className="w-8 h-8" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-red-200 bg-red-800/80 px-2.5 py-0.5 rounded-full">
                  High-Priority Emergency Alert
                </span>
                <h2 className="text-xl sm:text-2xl font-black mt-1">
                  Incoming Critical Emergency Patient
                </h2>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <div className="font-mono text-2xl font-black text-white">
                ETA: ~{emergencyEvents[0].etaMinutes} MINS
              </div>
              <p className="text-xs text-red-200">Ambulance {emergencyEvents[0].ambulanceId} ({emergencyEvents[0].ambulanceStatus})</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
            <div className="p-4 rounded-2xl bg-red-700/60 border border-red-500 space-y-1">
              <span className="text-red-300 font-bold uppercase text-[10px]">Patient Dossier</span>
              <p className="font-extrabold text-white text-sm">{emergencyEvents[0].patientName} ({emergencyEvents[0].patientAge}y, {emergencyEvents[0].patientGender})</p>
              <p className="text-red-200">Blood: {emergencyEvents[0].bloodGroup || 'O+'} • Known {emergencyEvents[0].existingConditions[0]}</p>
            </div>

            <div className="p-4 rounded-2xl bg-red-700/60 border border-red-500 space-y-1">
              <span className="text-red-300 font-bold uppercase text-[10px]">Acute Emergency Symptoms</span>
              <p className="font-extrabold text-white">{emergencyEvents[0].emergencySymptoms[0]}</p>
              <p className="text-red-200">Care: {emergencyEvents[0].careRequirement}</p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-400 text-slate-950 font-bold space-y-1 flex flex-col justify-center">
              <span className="uppercase text-[10px] tracking-wider text-amber-950 font-black">Allergy Safety Alert</span>
              <p className="text-sm font-black">{emergencyEvents[0].allergies.join(', ') || 'No known allergies'}</p>
              <p className="text-[10px] text-amber-900">Check before drug administration</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-red-500">
            <span className="text-xs text-red-200">
              Hospital Status: <strong className="text-white uppercase">{emergencyEvents[0].hospitalStatus}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => alert('Emergency Trauma Bay & Cath Lab Team Mobilized for incoming ambulance!')}
                className="px-5 py-2.5 rounded-xl bg-white text-red-700 hover:bg-red-50 font-extrabold text-xs shadow-md transition-all"
              >
                ✓ Accept & Mobilize Bay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Referrals Queue & Filter Tabs */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Inbound Referrals Queue</h2>
            <p className="text-xs text-slate-500">Digital referrals received from primary and community clinics</p>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-2xl text-xs font-semibold">
            {['ALL', 'EMERGENCY', 'NEW', 'ACCEPTED', 'ARRIVED', 'COMPLETED'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Referrals List */}
        <div className="space-y-4">
          {filteredReferrals.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No referrals found in this category.
            </div>
          ) : (
            filteredReferrals.map((ref) => (
              <div
                key={ref.id}
                className="p-5 rounded-2xl border border-slate-200 hover:border-purple-300 transition-all bg-slate-50/50 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
                      {ref.referralCode}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full uppercase font-bold text-[10px] ${
                      ref.urgency === 'EMERGENCY' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'
                    }`}>
                      {ref.urgency}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full uppercase font-bold text-[10px] bg-emerald-100 text-emerald-800">
                      Status: {ref.status}
                    </span>
                    {ref.isDoctorOverridden && (
                      <span className="px-2 py-0.5 rounded-full uppercase font-bold text-[10px] bg-blue-100 text-blue-800">
                        Doctor Overridden
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400">{new Date(ref.createdAt).toLocaleTimeString()}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold uppercase text-[10px]">Patient</span>
                    <p className="font-bold text-slate-900 text-sm">{ref.patientSnapshot.name} ({ref.patientSnapshot.age}y, {ref.patientSnapshot.gender})</p>
                    <p className="text-slate-500">Contact: {ref.patientSnapshot.mobile} • Blood: {ref.patientSnapshot.bloodGroup || 'N/A'}</p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold uppercase text-[10px]">Clinical Care Requirement</span>
                    <p className="font-bold text-slate-900">{ref.careRequirement}</p>
                    <p className="text-slate-500 line-clamp-1">{ref.clinicalFindings}</p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold uppercase text-[10px]">Allergy & Safety</span>
                    <p className="font-bold text-amber-800">{ref.patientSnapshot.allergies.join(', ') || 'No known allergies'}</p>
                    <p className="text-slate-500">From: {ref.referringDoctorName}</p>
                  </div>
                </div>

                {/* Status Action Buttons for Hospital User */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
                  <div className="text-[11px] text-slate-500">
                    {ref.outcomeNotes && (
                      <span className="text-emerald-700 font-semibold">
                        Outcome: {ref.outcomeNotes}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {ref.status !== 'ACCEPTED' && ref.status !== 'ARRIVED' && ref.status !== 'COMPLETED_OUTCOME' && (
                      <button
                        onClick={() => handleUpdateStatus(ref.id, 'ACCEPTED', 'Referral accepted by hospital intake triage.')}
                        className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-sm"
                      >
                        ✓ Accept Referral
                      </button>
                    )}

                    {ref.status === 'ACCEPTED' && (
                      <button
                        onClick={() => handleUpdateStatus(ref.id, 'ARRIVED', 'Patient arrived at hospital emergency reception.')}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm"
                      >
                        Mark Patient Arrived
                      </button>
                    )}

                    {(ref.status === 'ARRIVED' || ref.status === 'ACCEPTED') && (
                      <button
                        onClick={() => {
                          setSelectedReferral(ref);
                          setIsOutcomeModalOpen(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                      >
                        Record Clinical Outcome
                      </button>
                    )}

                    <Link
                      href={`/patient/referrals?id=${ref.id}`}
                      className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs"
                    >
                      View Slip
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Outcome & Counter-Referral Modal */}
      {isOutcomeModalOpen && selectedReferral && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold">Update Clinical Outcome & Counter-Referral</h2>
            </div>
            <p className="text-xs text-slate-500">
              Record inpatient treatment outcomes and send discharge follow-up advice back to referring provider Dr. Priya Sharma.
            </p>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Hospital Treatment Outcome Notes</label>
                <textarea
                  rows={3}
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Counter-Referral / PHC Follow-Up Instructions</label>
                <textarea
                  rows={3}
                  value={counterReferralNotes}
                  onChange={(e) => setCounterReferralNotes(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsOutcomeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleUpdateStatus(
                    selectedReferral.id,
                    'COMPLETED_OUTCOME',
                    'Hospital care completed and outcome documented.',
                    outcomeNotes,
                    counterReferralNotes
                  )
                }
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
              >
                Submit Outcome & Notify Referring Doctor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
