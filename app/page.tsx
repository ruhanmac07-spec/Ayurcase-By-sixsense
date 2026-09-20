'use client';

import React from 'react';
import Link from 'next/link';
import {
  HeartPulse,
  User,
  Stethoscope,
  Building2,
  AlertOctagon,
  FileCheck2,
  Network,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Layers,
  MapPin,
  CheckCircle2,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-12 py-4">
      {/* Hero Banner */}
      <section className="bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 text-white rounded-3xl p-8 sm:p-12 shadow-xl relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-200 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>TECHNEXA 2026 Challenge #5 Finalist Build</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Smart Healthcare Access & Connected Digital Referral
          </h1>

          <p className="text-base sm:text-lg text-teal-100/90 leading-relaxed">
            Bridging rural patients, primary health centers (PHCs), and tertiary specialty hospitals.
            Combining AI-assisted clinical decision support, capability-aware facility matching,
            and an immediate-dispatch Emergency SOS fast-lane.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href="/patient"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-sm shadow-md transition-all hover:scale-[1.02]"
            >
              <User className="w-4 h-4" />
              <span>Enter as Patient</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/doctor"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm backdrop-blur transition-all"
            >
              <Stethoscope className="w-4 h-4" />
              <span>PHC Doctor Workspace</span>
            </Link>

            <Link
              href="/hospital"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-200 font-semibold text-sm backdrop-blur transition-all"
            >
              <Building2 className="w-4 h-4" />
              <span>Hospital Emergency HUD</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Core Hackathon Demo Stories Banner */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Live Hackathon Demo Scenarios</h2>
            <p className="text-sm text-slate-500">
              Run any of the 4 complete end-to-end demo journeys required by the PRD without manual backend manipulation.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Demo 1 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-teal-500 transition-colors">
            <div className="space-y-3">
              <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h3 className="font-bold text-slate-900 text-base">Normal Symptom Assessment</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Patient describes symptoms → structured guided questions → deterministic triage → advice to visit PHC doctor (no fake diagnosis).
              </p>
            </div>
            <Link
              href="/patient/assessment"
              className="mt-4 inline-flex items-center justify-between text-xs font-semibold text-teal-700 hover:text-teal-800 pt-3 border-t border-slate-100"
            >
              <span>Launch Symptom Checker</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Demo 2 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-blue-500 transition-colors">
            <div className="space-y-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h3 className="font-bold text-slate-900 text-base">Doctor Referral + Override</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Lookup Ramesh Patel → review history & allergies → record findings → AI triage → doctor overrides triage → capability-aware facility matching → referral to hospital.
              </p>
            </div>
            <Link
              href="/doctor/workspace/pat-1"
              className="mt-4 inline-flex items-center justify-between text-xs font-semibold text-blue-700 hover:text-blue-800 pt-3 border-t border-slate-100"
            >
              <span>Open Ramesh Patel Case</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Demo 3 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-red-500 transition-colors">
            <div className="space-y-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 text-red-700 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h3 className="font-bold text-slate-900 text-base">Immediate Emergency SOS</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                One-tap SOS → 108 ambulance dispatch starts immediately → parallel AI questioning → patient history fused → Cath Lab facility matched → hospital alerted.
              </p>
            </div>
            <Link
              href="/patient/sos"
              className="mt-4 inline-flex items-center justify-between text-xs font-semibold text-red-700 hover:text-red-800 pt-3 border-t border-slate-100"
            >
              <span>Trigger Emergency SOS</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Demo 4 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-amber-500 transition-colors">
            <div className="space-y-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-sm">
                4
              </div>
              <h3 className="font-bold text-slate-900 text-base">Document OCR & Verification</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload discharge summary or blurry slip → AI extracts candidate fields → doctor reviews & verifies → committed into structured medical history without hallucination.
              </p>
            </div>
            <Link
              href="/patient/documents"
              className="mt-4 inline-flex items-center justify-between text-xs font-semibold text-amber-700 hover:text-amber-800 pt-3 border-t border-slate-100"
            >
              <span>Test Document OCR</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Architectural Pillars / Invariants Grid */}
      <section className="space-y-4 pt-4">
        <h2 className="text-xl font-bold text-slate-900">Key Architectural Invariants</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">SOS Fast-Lane Safety</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Ambulance action begins within 1 second of SOS press. Clinical questioning runs strictly in parallel and never blocks emergency dispatch or destination selection.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Clinician Stays in Control</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              AI provides structured decision support, never an autonomous diagnosis. Doctors can edit or completely override AI outputs; the verified decision is recorded separately.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Capability-Aware Matching</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Matches facilities based on specialized equipment and specialists (Cardiology, Cath Lab, ICU), avoiding arbitrary &quot;best hospital&quot; scores or distance-only traps.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
