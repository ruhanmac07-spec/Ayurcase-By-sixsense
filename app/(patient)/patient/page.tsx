'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  HeartPulse,
  AlertOctagon,
  Stethoscope,
  FileText,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Pill,
  Activity,
  QrCode,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  PhoneCall,
  User,
} from 'lucide-react';
import { PatientProfile, DigitalReferral } from '@/types';
import QRCode from 'qrcode';

export default function PatientHomePage() {
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [referrals, setReferrals] = useState<DigitalReferral[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const pRes = await fetch('/api/patient');
        const pData = await pRes.json();
        setPatient(pData);

        if (pData?.secureTokenId) {
          // Generate opaque signed QR code (never raw medical payload)
          const qrUrl = await QRCode.toDataURL(`CARECONNECT_AUTH:${pData.secureTokenId}`, {
            width: 160,
            margin: 1,
            color: { dark: '#0F172A', light: '#FFFFFF' },
          });
          setQrDataUrl(qrUrl);
        }

        const rRes = await fetch(`/api/referrals?patientId=${pData.id}`);
        const rData = await rRes.json();
        setReferrals(rData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading patient record...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      {/* Patient Greeting & Fast SOS Bar */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
              Patient Portal
            </span>
            <span className="text-xs text-slate-400">ID: {patient?.id}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Welcome, {patient?.name}
          </h1>
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <span>{patient?.age} yrs, {patient?.gender}</span>
            <span>•</span>
            <span>Blood Group: <strong className="text-slate-800">{patient?.bloodGroup || 'Not specified'}</strong></span>
            <span>•</span>
            <span>{patient?.location}</span>
          </p>
        </div>

        {/* Big High-Visibility Emergency Action Button */}
        <div className="w-full md:w-auto">
          <Link
            href="/patient/sos"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 animate-pulse-subtle border-2 border-red-500"
          >
            <AlertOctagon className="w-7 h-7 animate-bounce" />
            <div className="text-left">
              <div className="text-xs font-medium uppercase tracking-wider text-red-100">Immediate Fast-Lane</div>
              <div className="leading-tight">EMERGENCY SOS</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Main Two Action Pathways */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Normal Care Path: Check Symptoms */}
        <div className="bg-gradient-to-br from-teal-500 to-teal-700 text-white rounded-3xl p-6 sm:p-8 shadow-md flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white">
              <Stethoscope className="w-7 h-7" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold">Check My Symptoms</h2>
            <p className="text-teal-100 text-sm leading-relaxed">
              Feeling unwell? Answer a few guided questions to receive clinically-grounded care recommendations and guidance to visit your nearby doctor.
            </p>
          </div>
          <Link
            href="/patient/assessment"
            className="inline-flex items-center justify-between px-5 py-3.5 rounded-xl bg-white text-teal-800 font-bold text-sm shadow-sm hover:bg-teal-50 transition-colors"
          >
            <span>Start Symptom Assessment</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Secure Digital Health Identity / QR Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-3 text-left">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              <span>Opaque Token Authorization</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Digital Health ID & QR</h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
              Present this token to your PHC doctor or emergency worker to authorize clinical history access. Contains no raw medical payload.
            </p>
            <div className="text-xs font-mono font-bold bg-slate-100 px-3 py-1.5 rounded-lg text-slate-800 inline-block border border-slate-200">
              {patient?.secureTokenId}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Patient Secure QR" className="w-28 h-28 rounded-lg" />
            ) : (
              <div className="w-28 h-28 bg-slate-200 rounded-lg animate-pulse" />
            )}
            <span className="text-[10px] text-slate-400 font-medium">Scan with Doctor App</span>
          </div>
        </div>
      </div>

      {/* Critical Health Alerts & Profile Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Allergies Alert (Must never be hidden deep) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Allergies</span>
            </div>
            <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              Critical Alert
            </span>
          </div>
          {patient?.allergies && patient.allergies.length > 0 ? (
            <div className="space-y-1.5">
              {patient.allergies.map((allergy, i) => (
                <div
                  key={i}
                  className="px-3 py-2 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs font-semibold text-amber-900"
                >
                  {allergy}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No known drug allergies reported.</p>
          )}
        </div>

        {/* Ongoing Medications */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Pill className="w-4 h-4 text-teal-600" />
              <span>Current Medications</span>
            </div>
            <span className="text-xs font-semibold text-slate-500">{patient?.currentMedications.length} active</span>
          </div>
          <div className="space-y-2">
            {patient?.currentMedications.map((med, i) => (
              <div key={i} className="flex items-start justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="font-semibold text-slate-800">{med.name} {med.dosage}</span>
                <span className="text-[11px] text-slate-500">{med.frequency}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <PhoneCall className="w-4 h-4 text-blue-600" />
              <span>Emergency Contact</span>
            </div>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Verified
            </span>
          </div>
          <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 space-y-1 text-xs">
            <p className="font-bold text-slate-800">{patient?.emergencyContact.name}</p>
            <p className="text-slate-500">{patient?.emergencyContact.relationship}</p>
            <p className="font-mono font-semibold text-blue-700 pt-1">{patient?.emergencyContact.phone}</p>
          </div>
        </div>
      </div>

      {/* Recent Referrals Section */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Active & Recent Referrals</h2>
            <p className="text-xs text-slate-500">Track connected digital care journeys and destination hospital statuses</p>
          </div>
          <Link
            href="/patient/referrals"
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
          >
            <span>View All</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {referrals.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No active referrals found for this profile.
          </div>
        ) : (
          <div className="space-y-3">
            {referrals.map((ref) => (
              <div
                key={ref.id}
                className="p-4 rounded-2xl border border-slate-200 hover:border-teal-400 transition-colors bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-teal-700">{ref.referralCode}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      ref.urgency === 'EMERGENCY' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {ref.urgency}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-800">
                      Status: {ref.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">{ref.careRequirement}</h3>
                  <p className="text-xs text-slate-500">
                    Referred to: <strong>{ref.receivingFacilityName}</strong> by {ref.referringDoctorName}
                  </p>
                </div>

                <Link
                  href={`/patient/referrals?id=${ref.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 shadow-sm"
                >
                  <FileText className="w-3.5 h-3.5 text-teal-600" />
                  <span>View Referral Slip</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
