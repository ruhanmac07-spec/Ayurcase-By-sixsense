'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Stethoscope,
  HeartPulse,
  AlertTriangle,
  Pill,
  Activity,
  FileText,
  Building2,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Edit3,
  RotateCcw,
  ArrowRight,
  Send,
  Printer,
  ChevronDown,
} from 'lucide-react';
import {
  PatientProfile,
  FacilityMatchResult,
  FacilityCapability,
  UrgencyLevel,
} from '@/types';

export default function DoctorWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const patientId = (params?.id as string) || 'pat-1';

  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Clinical encounter form
  const [chiefComplaint, setChiefComplaint] = useState('Substernal chest heaviness radiating to left shoulder on exertion');
  const [duration, setDuration] = useState('Started 2 hours ago during morning walk');
  const [severity, setSeverity] = useState(8);
  const [bp, setBp] = useState('154/96');
  const [heartRate, setHeartRate] = useState(92);
  const [spo2, setSpo2] = useState(97);
  const [bloodSugar, setBloodSugar] = useState(142);
  const [tempF, setTempF] = useState(98.4);
  const [findingsNotes, setFindingsNotes] = useState('Patient visibly diaphoretic. PHC 12-lead ECG reveals acute 1.5mm ST segment depression in leads V4-V6. Bilateral chest auscultation clear.');

  // AI-Assisted Triage State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiTriage, setAiTriage] = useState<{
    urgencyLevel: UrgencyLevel;
    careRequirement: string;
    requiredCapabilities: FacilityCapability[];
    aiReasoning: string[];
    recommendedAction: string;
  } | null>(null);

  // Doctor Override State
  const [isOverridden, setIsOverridden] = useState(false);
  const [doctorFinalUrgency, setDoctorFinalUrgency] = useState<UrgencyLevel>('URGENT');
  const [doctorFinalCareRequirement, setDoctorFinalCareRequirement] = useState('');
  const [doctorOverrideReason, setDoctorOverrideReason] = useState('');
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);

  // Facility Matching State
  const [isMatching, setIsMatching] = useState(false);
  const [matchedFacilities, setMatchedFacilities] = useState<FacilityMatchResult[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('fac-hosp-1');

  // Referral Finalization
  const [isCreatingReferral, setIsCreatingReferral] = useState(false);
  const [createdReferralCode, setCreatedReferralCode] = useState<string | null>(null);

  useEffect(() => {
    async function loadPatient() {
      try {
        const res = await fetch(`/api/patient?id=${patientId}`);
        const data = await res.json();
        setPatient(data);

        // Run initial clinical decision support triage
        triggerTriage(data);
      } finally {
        setLoading(false);
      }
    }
    loadPatient();
  }, [patientId]);

  const triggerTriage = async (pData?: PatientProfile) => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chiefComplaint,
          duration,
          severity,
          vitals: {
            bloodPressure: bp,
            heartRate,
            spo2,
            bloodGlucose: bloodSugar,
            temperatureF: tempF,
          },
          patientHistory: pData?.existingConditions || patient?.existingConditions,
          allergies: pData?.allergies || patient?.allergies,
          additionalNotes: findingsNotes,
        }),
      });

      const triageData = await res.json();
      setAiTriage(triageData);
      setDoctorFinalUrgency(triageData.urgencyLevel);
      setDoctorFinalCareRequirement(triageData.careRequirement);

      // Match facilities with required capabilities
      fetchMatchedFacilities(triageData.requiredCapabilities);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchMatchedFacilities = async (capabilities: FacilityCapability[]) => {
    setIsMatching(true);
    try {
      const res = await fetch('/api/facilities/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requiredCapabilities: capabilities,
          maxResults: 3,
        }),
      });
      const data = await res.json();
      setMatchedFacilities(data.matches || []);
      if (data.matches?.length > 0) {
        setSelectedFacilityId(data.matches[0].facility.id);
      }
    } finally {
      setIsMatching(false);
    }
  };

  const handleApplyOverride = () => {
    setIsOverridden(true);
    setIsOverrideModalOpen(false);
    // Re-match if capabilities were influenced
    if (aiTriage) {
      fetchMatchedFacilities(aiTriage.requiredCapabilities);
    }
  };

  const handleCreateReferral = async () => {
    if (!patient || !aiTriage || isCreatingReferral) return;
    setIsCreatingReferral(true);

    const chosenFacility = matchedFacilities.find((m) => m.facility.id === selectedFacilityId)?.facility || matchedFacilities[0]?.facility;

    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'DOCTOR',
          'x-user-id': 'usr-doctor-1',
        },
        body: JSON.stringify({
          patientId: patient.id,
          patientSnapshot: {
            name: patient.name,
            age: patient.age,
            gender: patient.gender,
            mobile: patient.mobile,
            bloodGroup: patient.bloodGroup,
            allergies: patient.allergies,
            medications: patient.currentMedications.map((m) => ({ name: m.name, dosage: m.dosage })),
            conditions: patient.existingConditions,
          },
          referringDoctorId: 'usr-doctor-1',
          referringDoctorName: 'Dr. Priya Sharma (MBBS, Medical Officer)',
          referringClinic: 'Anand Rural Community PHC',
          receivingFacilityId: chosenFacility.id,
          receivingFacilityName: chosenFacility.name,
          urgency: doctorFinalUrgency,
          chiefComplaint,
          duration,
          clinicalFindings: findingsNotes,
          vitals: {
            bloodPressure: bp,
            heartRate,
            spo2,
            bloodGlucose: bloodSugar,
            temperatureF: tempF,
          },
          careRequirement: doctorFinalCareRequirement,
          requiredCapabilities: aiTriage.requiredCapabilities,
          aiAssessmentSummary: `AI Suggestion: ${aiTriage.urgencyLevel} - ${aiTriage.careRequirement}`,
          doctorConfirmedDecision: isOverridden
            ? `Confirmed by Dr. Priya Sharma (OVERRIDDEN): ${doctorFinalCareRequirement}. Rationale: ${doctorOverrideReason}`
            : `Confirmed by Dr. Priya Sharma: ${doctorFinalCareRequirement}. Findings consistent with Acute Coronary Syndrome.`,
          isDoctorOverridden: isOverridden,
          doctorOverrideReason: isOverridden ? doctorOverrideReason : undefined,
        }),
      });

      const data = await res.json();
      if (data.referral) {
        setCreatedReferralCode(data.referral.referralCode);
      }
    } finally {
      setIsCreatingReferral(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Patient Dossier Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded">
                {patient?.secureTokenId}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ✓ Consent Authorized
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
              {patient?.name}
            </h1>
            <p className="text-xs text-slate-500">
              {patient?.age} yrs, {patient?.gender} • Blood Group: <strong>{patient?.bloodGroup}</strong> • Weight: {patient?.weightKg} kg • {patient?.location}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400">Attending Provider</span>
            <div className="text-sm font-bold text-slate-800">Dr. Priya Sharma</div>
            <div className="text-xs text-slate-500">Anand Rural Community PHC</div>
          </div>
        </div>

        {/* High-Visibility Clinical Safety Strip (Allergies + Meds Must NEVER be hidden deep) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 space-y-1">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>CRITICAL ALLERGIES:</span>
            </div>
            <p className="text-sm font-extrabold text-amber-950">
              {patient?.allergies && patient.allergies.length > 0 ? patient.allergies.join(', ') : 'No Known Drug Allergies'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
              <Pill className="w-4 h-4 text-teal-600" />
              <span>CURRENT MEDICATIONS:</span>
            </div>
            <p className="text-xs font-semibold text-slate-900">
              {patient?.currentMedications.map((m) => `${m.name} ${m.dosage}`).join(', ') || 'None recorded'}
            </p>
          </div>
        </div>

        {/* Verified Medical History & Provenance Tracking */}
        {patient?.medicalHistory && patient.medicalHistory.length > 0 && (
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Verified Medical History & Data Provenance:</span>
              </span>
              <span className="text-[10px] text-slate-400">Audited clinical provenance</span>
            </div>
            <div className="space-y-2">
              {patient.medicalHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 text-xs gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                    <span className="font-bold text-slate-900">{item.condition}</span>
                    <span className="text-[10px] text-slate-400">
                      ({item.diagnosedDate || item.diagnosedYear || 'Documented'})
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                      {item.status}
                    </span>
                  </div>
                  {item.provenance && (
                    <div className="flex items-center gap-1.5 text-[10px]">
                      {typeof item.provenance === 'object' ? (
                        <>
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold border ${
                              item.provenance.sourceType === 'DOCUMENT_OCR_VERIFIED'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : item.provenance.sourceType === 'CLINICIAN_ENTERED'
                                ? 'bg-blue-50 text-blue-800 border-blue-300'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {item.provenance.sourceType.replace(/_/g, ' ')}
                          </span>
                          {item.provenance.verifiedBy && (
                            <span className="text-slate-500 italic">
                              by {item.provenance.verifiedBy}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full font-bold border bg-emerald-50 text-emerald-800 border-emerald-300">
                          {String(item.provenance).replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Current Encounter & Findings Form */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-blue-700" />
              <span>Current Encounter & Clinical Findings</span>
            </h2>
            <p className="text-xs text-slate-500">Record current symptoms, duration, vitals, and examination observations</p>
          </div>
          <button
            onClick={() => triggerTriage()}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs font-bold transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>{isAnalyzing ? 'Re-evaluating...' : 'Re-Run AI Triage'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1 sm:col-span-2">
            <label className="font-bold text-slate-700">Chief Complaint</label>
            <input
              type="text"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium text-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Onset & Duration</label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium text-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Severity Scale (1 to 10)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium text-slate-900"
            />
          </div>

          {/* Vitals Grid */}
          <div className="sm:col-span-2 space-y-2 pt-2">
            <span className="font-bold text-slate-700">Vital Signs:</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-[11px] text-slate-500">Blood Pressure</label>
                <input
                  type="text"
                  value={bp}
                  onChange={(e) => setBp(e.target.value)}
                  placeholder="120/80"
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">Pulse (bpm)</label>
                <input
                  type="number"
                  value={heartRate}
                  onChange={(e) => setHeartRate(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">SpO2 (%)</label>
                <input
                  type="number"
                  value={spo2}
                  onChange={(e) => setSpo2(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">Blood Sugar (mg/dL)</label>
                <input
                  type="number"
                  value={bloodSugar}
                  onChange={(e) => setBloodSugar(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">Temp (°F)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tempF}
                  onChange={(e) => setTempF(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2 pt-2">
            <label className="font-bold text-slate-700">Clinical Findings & Diagnostic Observations</label>
            <textarea
              rows={3}
              value={findingsNotes}
              onChange={(e) => setFindingsNotes(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 font-medium text-slate-900 leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* AI-Assisted Assessment vs Doctor Decision Card */}
      {aiTriage && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-800 text-xs font-semibold mb-1">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>AI-Assisted Assessment (Clinical Decision Support)</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Care Routing & Triage Recommendation
              </h2>
            </div>

            {/* Doctor Override & Control Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsOverrideModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isOverridden ? 'Edit Override' : 'Modify / Override AI'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Suggestion Card */}
            <div className="p-5 rounded-2xl bg-purple-50/50 border border-purple-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-900 uppercase text-[10px]">
                  AI Suggested Triage Output
                </span>
                <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase ${
                  aiTriage.urgencyLevel === 'EMERGENCY' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'
                }`}>
                  {aiTriage.urgencyLevel}
                </span>
              </div>

              <div>
                <span className="font-semibold text-slate-600">Care Requirement:</span>
                <p className="font-bold text-slate-900 text-sm">{aiTriage.careRequirement}</p>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-600">Clinical Reasoning:</span>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  {aiTriage.aiReasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1 pt-1">
                <span className="font-semibold text-slate-600">Required Facility Capabilities:</span>
                <div className="flex flex-wrap gap-1">
                  {aiTriage.requiredCapabilities.map((cap) => (
                    <span key={cap} className="px-2 py-0.5 rounded-full bg-white text-purple-800 border border-purple-200 font-mono text-[10px] font-bold">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Confirmed Doctor Decision Card (Dominant Invariant) */}
            <div className={`p-5 rounded-2xl border-2 space-y-3 text-xs ${
              isOverridden ? 'bg-blue-50/80 border-blue-600 shadow-sm' : 'bg-emerald-50/60 border-emerald-500'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase text-[10px] text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Clinician Confirmed Decision</span>
                </span>
                <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase ${
                  doctorFinalUrgency === 'EMERGENCY' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'
                }`}>
                  {doctorFinalUrgency}
                </span>
              </div>

              <div>
                <span className="font-semibold text-slate-600">Confirmed Care Requirement:</span>
                <p className="font-extrabold text-slate-900 text-sm">{doctorFinalCareRequirement}</p>
              </div>

              {isOverridden ? (
                <div className="p-3 rounded-xl bg-white border border-blue-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-blue-800">Doctor Clinical Override Rationale:</span>
                  <p className="font-medium text-slate-800 italic">{doctorOverrideReason}</p>
                </div>
              ) : (
                <p className="text-emerald-800 font-medium">
                  ✓ Doctor concurs with AI clinical decision support recommendations.
                </p>
              )}

              <div className="pt-2 text-[11px] text-slate-500">
                Governing Clinician: <strong>Dr. Priya Sharma</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Capability-Aware Facility Matching */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
            Capability-Aware Matching
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-2">
            Suitable Facilities for This Care Requirement
          </h2>
          <p className="text-xs text-slate-500">
            Screened against required capabilities: <strong>{aiTriage?.requiredCapabilities.join(', ')}</strong>.
            Facilities lacking critical interventional equipment (like Cath Lab) are excluded regardless of proximity.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {matchedFacilities.map((m) => {
            const isSelected = selectedFacilityId === m.facility.id;
            return (
              <div
                key={m.facility.id}
                onClick={() => setSelectedFacilityId(m.facility.id)}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/40 shadow-sm ring-1 ring-blue-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base">{m.facility.name}</h3>
                    {m.isFullMatch ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        100% Capability Match
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Partial Match
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500">
                    {m.facility.location} • <strong>{m.facility.distanceKm} km</strong> ({m.facility.travelTimeMins} mins travel time)
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {m.facility.capabilities.map((cap) => {
                      const isRequired = aiTriage?.requiredCapabilities.includes(cap);
                      return (
                        <span
                          key={cap}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                            isRequired
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                              : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                        >
                          {isRequired ? '✓ ' : ''}{cap}
                        </span>
                      );
                    })}
                  </div>

                  <p className="text-xs text-slate-600 italic">{m.matchExplanation}</p>
                </div>

                <div className="flex-shrink-0">
                  <div className={`px-4 py-2 rounded-xl text-xs font-bold text-center ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {isSelected ? '✓ Destination Selected' : 'Select'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Final Referral Creation Button */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Selected destination will receive an instant notification on its Hospital Emergency HUD.
          </div>

          <button
            onClick={handleCreateReferral}
            disabled={isCreatingReferral || !selectedFacilityId}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow-md transition-all hover:scale-105"
          >
            <Send className="w-4 h-4" />
            <span>{isCreatingReferral ? 'Transmitting Referral...' : 'Confirm & Generate Digital Referral'}</span>
          </button>
        </div>
      </div>

      {/* Referral Creation Success Confirmation Modal */}
      {createdReferralCode && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-emerald-300 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Digital Referral Dispatched</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Referral code <strong className="font-mono text-blue-700">{createdReferralCode}</strong> has been created and transmitted to the receiving hospital.
            </p>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => router.push('/hospital')}
                className="w-full py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-sm"
              >
                Switch to Hospital Dashboard to Accept
              </button>
              <button
                onClick={() => router.push(`/patient/referrals?id=${createdReferralCode}`)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
              >
                View Digital Referral Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doctor Override Modal */}
      {isOverrideModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Edit3 className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold">Doctor Clinical Override</h2>
            </div>
            <p className="text-xs text-slate-500">
              As the licensed physician, you hold complete clinical authority. You may modify or override the AI recommendation.
            </p>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Urgency Level Override</label>
                <select
                  value={doctorFinalUrgency}
                  onChange={(e) => setDoctorFinalUrgency(e.target.value as UrgencyLevel)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold bg-white"
                >
                  <option value="EMERGENCY">EMERGENCY (Immediate transfer)</option>
                  <option value="URGENT">URGENT (Within 24-48 hrs)</option>
                  <option value="ROUTINE">ROUTINE (Scheduled outpatient)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Clinical Care Requirement</label>
                <input
                  type="text"
                  value={doctorFinalCareRequirement}
                  onChange={(e) => setDoctorFinalCareRequirement(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Clinical Override Justification</label>
                <textarea
                  rows={3}
                  value={doctorOverrideReason}
                  onChange={(e) => setDoctorOverrideReason(e.target.value)}
                  placeholder="e.g. Overridden to Emergency due to worsening diaphoresis and ST depressions on repeat ECG..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyOverride}
                className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs shadow-sm"
              >
                Apply Clinical Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
