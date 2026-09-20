'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  PhoneCall,
  Ambulance,
  Navigation,
  Clock,
  HeartPulse,
  Building2,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  AlertTriangle,
  User,
  Radio,
  Pill,
} from 'lucide-react';
import { EmergencyEvent, FacilityMatchResult } from '@/types';

export default function EmergencySosPage() {
  const [event, setEvent] = useState<EmergencyEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchingFacilities, setMatchingFacilities] = useState<FacilityMatchResult[]>([]);
  const [isSelectingFacility, setIsSelectingFacility] = useState(false);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
  const [showQuestions, setShowQuestions] = useState(false);
  const [emergencyNotes, setEmergencyNotes] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // 1. Critical Invariant: Trigger SOS immediately on load!
  useEffect(() => {
    async function initiateSos() {
      try {
        const res = await fetch('/api/sos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: 'pat-1',
            symptoms: ['Acute crushing chest pain (9/10)', 'Sudden cold perspiration'],
          }),
        });
        const data = await res.json();
        if (data.event) {
          setEvent(data.event);
          setSelectedFacilityId(data.event.selectedFacilityId || '');

          // Immediately fetch capability-aware emergency facilities
          const facRes = await fetch('/api/facilities/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requiredCapabilities: ['CARDIOLOGY', 'CATH_LAB', 'EMERGENCY_24_7', 'ICU'],
              isEmergency: true,
              maxResults: 3,
            }),
          });
          const facData = await facRes.json();
          setMatchingFacilities(facData.matches || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    initiateSos();
  }, []);

  const handleCancelSos = async () => {
    if (!event) return;
    const confirmCancel = window.confirm(
      'Are you sure you want to cancel this emergency request? An audit log will record this as a false alarm.'
    );
    if (!confirmCancel) return;

    setIsCancelling(true);
    try {
      const res = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CANCEL',
          eventId: event.id,
          cancellationReason: 'Cancelled by patient from SOS interface (False alarm)',
        }),
      });
      const data = await res.json();
      if (data.event) {
        setEvent(data.event);
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSelectFacility = async (facilityId: string) => {
    if (!event) return;
    setIsSelectingFacility(true);
    try {
      const res = await fetch('/api/sos/select-facility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          facilityId,
          notes: emergencyNotes,
        }),
      });
      const data = await res.json();
      if (data.event) {
        setEvent(data.event);
        setSelectedFacilityId(facilityId);
      }
    } finally {
      setIsSelectingFacility(false);
    }
  };

  const handleAdvanceAmbulanceStatus = async (nextStatus: string, nextEta: number) => {
    if (!event) return;
    try {
      const res = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ADVANCE_STATUS',
          eventId: event.id,
          ambulanceStatus: nextStatus,
          etaMinutes: nextEta,
        }),
      });
      const data = await res.json();
      if (data.event) {
        setEvent(data.event);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-red-600 text-white flex items-center justify-center animate-bounce shadow-xl">
          <AlertOctagon className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-black text-red-600 tracking-wider uppercase">
          Initiating 108 Emergency Action...
        </h2>
        <p className="text-xs text-slate-500">Dispatching nearest available emergency life support vehicle</p>
      </div>
    );
  }

  // Calculate the 6-state HUD indicator index (1-6)
  const isCancelled = event?.isCancelled || event?.ambulanceStatus === 'CANCELLED';
  const hasFacility = !!event?.selectedFacilityId || !!selectedFacilityId;
  const isHospitalNotified = event?.hospitalStatus === 'ALERTED' || event?.hospitalStatus === 'PRE_ARRIVAL_ACKNOWLEDGED';

  const hudSteps = [
    { label: 'SOS Activated', state: 'SOS_ACTIVATED', done: true },
    { label: 'Ambulance Initiated', state: 'AMBULANCE_INITIATED', done: true },
    { label: 'Collecting Info', state: 'COLLECTING_INFO', done: true },
    { label: 'Matching Facilities', state: 'MATCHING_FACILITIES', done: matchingFacilities.length > 0 },
    { label: 'Facility Selected', state: 'FACILITY_SELECTED', done: hasFacility },
    { label: 'Hospital Notified', state: 'HOSPITAL_NOTIFIED', done: isHospitalNotified },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* 6-State Emergency HUD Progress Indicator */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            Emergency Lifecycle State (6-State Invariant HUD)
          </span>
          <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full">
            {isCancelled ? 'CANCELLED / FALSE ALARM' : isHospitalNotified ? 'STATE 6/6: HOSPITAL NOTIFIED' : hasFacility ? 'STATE 5/6: FACILITY SELECTED' : 'STATE 4/6: MATCHING FACILITIES'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[11px]">
          {hudSteps.map((step, idx) => (
            <div
              key={step.state}
              className={`p-2.5 rounded-xl border transition-all ${
                isCancelled
                  ? 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                  : step.done
                  ? 'bg-red-50 border-red-300 font-bold text-red-900 shadow-sm'
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
            >
              <div className="text-[10px] text-slate-400">Step {idx + 1}</div>
              <div className="truncate">{step.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cancellation Notice if Cancelled */}
      {isCancelled && (
        <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 border-2 border-slate-700 shadow-xl space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 flex-shrink-0" />
            <div>
              <h2 className="text-xl font-black">Emergency Dispatch Stood Down (False Alarm)</h2>
              <p className="text-xs text-slate-300">
                This emergency event was cancelled. Responders have been notified and stand-down was logged into the audit trail.
              </p>
            </div>
          </div>
          {event?.cancellationReason && (
            <p className="text-xs text-slate-400 italic bg-slate-800 p-3 rounded-xl border border-slate-700">
              Reason: &ldquo;{event.cancellationReason}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Active Emergency HUD Banner */}
      {!isCancelled && (
        <div className="bg-red-600 text-white rounded-3xl p-6 sm:p-8 shadow-2xl border-4 border-red-500 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/30 border border-white/20 text-white text-xs font-black uppercase tracking-widest animate-pulse">
                <Radio className="w-3.5 h-3.5 text-red-300" />
                <span>EMERGENCY DISPATCH ACTIVE</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                Ambulance Action Initiated
              </h1>
              <p className="text-sm text-red-100 max-w-xl leading-relaxed">
                Medical emergency response has been automatically triggered for{' '}
                <strong>{event?.patientName}</strong>. Clinical context is being streamed to emergency responders.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              {/* Direct 108 Phone Call Trigger */}
              <a
                href="tel:108"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-white text-red-700 font-extrabold text-base shadow-lg hover:bg-red-50 transition-transform hover:scale-105"
              >
                <PhoneCall className="w-5 h-5 animate-pulse" />
                <span>Call 108 Direct</span>
              </a>

              {/* Cancel False Alarm Button */}
              <button
                onClick={handleCancelSos}
                disabled={isCancelling}
                className="w-full sm:w-auto px-4 py-4 rounded-2xl bg-red-900/60 hover:bg-red-900 text-red-100 border border-red-400/40 text-xs font-bold transition-all text-center"
              >
                {isCancelling ? 'Cancelling...' : 'Cancel (False Alarm)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ambulance Live Telematics Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
              <Ambulance className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm text-slate-900">{event?.ambulanceId}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 uppercase">
                  {event?.ambulanceStatus}
                </span>
              </div>
              <p className="text-xs text-slate-500">Advanced Cardiac Life Support (ACLS) Unit</p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-2xl font-extrabold text-red-600 font-mono">
              ETA: ~{event?.etaMinutes} mins
            </div>
            <div className="text-[11px] text-slate-400">Live GPS tracking active</div>
          </div>
        </div>

        {/* Telemetry Progression Steps */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className={`p-2.5 rounded-xl border ${
            event?.ambulanceStatus === 'DISPATCHED' ? 'bg-red-50 border-red-300 font-bold text-red-900' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            1. Dispatched
          </div>
          <div className={`p-2.5 rounded-xl border ${
            event?.ambulanceStatus === 'EN_ROUTE' ? 'bg-red-50 border-red-300 font-bold text-red-900' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            2. En Route
          </div>
          <div className={`p-2.5 rounded-xl border ${
            event?.ambulanceStatus === 'AT_SCENE' ? 'bg-red-50 border-red-300 font-bold text-red-900' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            3. At Scene
          </div>
          <div className={`p-2.5 rounded-xl border ${
            event?.ambulanceStatus === 'IN_TRANSIT' || event?.ambulanceStatus === 'ARRIVED_FACILITY' ? 'bg-red-50 border-red-300 font-bold text-red-900' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            4. In Transit
          </div>
        </div>

        {/* Hackathon Telemetry Simulator Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs border-t border-slate-100">
          <span className="text-slate-400 font-medium">Demo Status Simulator:</span>
          <button
            onClick={() => handleAdvanceAmbulanceStatus('EN_ROUTE', 5)}
            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
          >
            Advance to En Route (5m)
          </button>
          <button
            onClick={() => handleAdvanceAmbulanceStatus('AT_SCENE', 0)}
            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
          >
            Arrived at Scene
          </button>
          <button
            onClick={() => handleAdvanceAmbulanceStatus('IN_TRANSIT', 12)}
            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
          >
            In Transit to Hospital
          </button>
        </div>
      </div>

      {/* Combined Clinical Profile (Fused with Emergency Record) */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-red-600" />
            <span>Fused Emergency Patient Dossier</span>
          </h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            Auto-Transmitted to Responders
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-400 font-semibold uppercase text-[10px]">Patient</span>
            <p className="font-bold text-slate-900 text-sm">{event?.patientName}</p>
            <p className="text-slate-500">{event?.patientAge} yrs, {event?.patientGender}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-400 font-semibold uppercase text-[10px]">Blood Group</span>
            <p className="font-extrabold text-red-600 text-sm">{event?.bloodGroup || 'O+'}</p>
            <p className="text-slate-500">Universal donor compatibility</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1">
            <span className="text-amber-800 font-bold uppercase text-[10px]">Allergies</span>
            <p className="font-bold text-amber-950 text-xs">{event?.allergies.join(', ') || 'NKDA'}</p>
            <p className="text-[10px] text-amber-700">Contraindicated drugs flagged</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-400 font-semibold uppercase text-[10px]">Current Medications</span>
            <p className="font-bold text-slate-900 text-xs">{event?.currentMedications.join(', ')}</p>
            <p className="text-[10px] text-slate-500">Known antihypertensives</p>
          </div>
        </div>

        {/* Emergency Care Requirement */}
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 space-y-1">
          <span className="text-[10px] uppercase font-extrabold text-red-800 tracking-wider">
            Identified Care Requirement
          </span>
          <p className="font-bold text-red-950 text-sm">{event?.careRequirement}</p>
        </div>
      </div>

      {/* Emergency Facility Matching & Destination Selection */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Suitable Emergency Facilities
          </h2>
          <p className="text-xs text-slate-500">
            Capability-aware matched destinations. Only facilities with active 24/7 emergency and cardiac catheterization cover are recommended.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {matchingFacilities.map((match) => {
            const isSelected = event?.selectedFacilityId === match.facility.id || selectedFacilityId === match.facility.id;
            return (
              <div
                key={match.facility.id}
                className={`p-5 rounded-2xl border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isSelected
                    ? 'border-red-600 bg-red-50/50 shadow-md ring-2 ring-red-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className={`w-4 h-4 ${isSelected ? 'text-red-600' : 'text-slate-500'}`} />
                    <h3 className="font-bold text-slate-900 text-base">{match.facility.name}</h3>
                    {isSelected && (
                      <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-red-600 text-white">
                        Selected Destination
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500">
                    {match.facility.location} • <strong>{match.facility.distanceKm} km</strong> (~{match.facility.travelTimeMins} mins)
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {match.facility.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          match.matchedCapabilities.includes(cap)
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}
                      >
                        ✓ {cap}
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-slate-600 italic pt-1">{match.matchExplanation}</p>
                </div>

                <div className="flex-shrink-0">
                  <button
                    onClick={() => handleSelectFacility(match.facility.id)}
                    disabled={isSelectingFacility}
                    className={`w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-xs shadow-sm transition-all ${
                      isSelected
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {isSelected ? '✓ Destination Alerted' : 'Select Facility & Alert ER'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hospital Pre-Arrival Alert Confirmation Card */}
      {event?.selectedFacilityName && (
        <div className="bg-emerald-50 border-2 border-emerald-500 rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-emerald-950 text-base">
                Receiving Emergency Hospital Alerted
              </h3>
              <p className="text-xs text-emerald-800">
                <strong>{event.selectedFacilityName}</strong> has received this emergency broadcast.
                The emergency triage team has pre-arrival access to vitals, allergies, and ECG indications.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 text-xs text-emerald-900 font-semibold border-t border-emerald-200">
            <span>Hospital Status: <strong>{event.hospitalStatus}</strong></span>
            <Link
              href="/hospital"
              className="text-emerald-800 hover:underline flex items-center gap-1 font-bold"
            >
              <span>View Hospital Dashboard HUD</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
