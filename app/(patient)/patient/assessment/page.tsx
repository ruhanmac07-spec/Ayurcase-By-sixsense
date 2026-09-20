'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Stethoscope,
  AlertOctagon,
  HelpCircle,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';
import { AssessmentResult } from '@/types';

interface QuestionStep {
  id: string;
  question: string;
  hint: string;
  options: {
    label: string;
    sublabel?: string;
    isEmergency?: boolean;
    value: string;
  }[];
}

const ASSESSMENT_QUESTIONS: QuestionStep[] = [
  {
    id: 'primary_symptom',
    question: 'What is the primary discomfort you are experiencing today?',
    hint: 'Select the option that best describes how you feel right now.',
    options: [
      { label: 'Chest pain, tightness, or burning pressure', sublabel: 'In chest, neck, or left shoulder', isEmergency: true, value: 'chest_pain' },
      { label: 'Severe breathlessness or difficulty inhaling', sublabel: 'Gasping for air or unable to speak full sentences', isEmergency: true, value: 'severe_dyspnea' },
      { label: 'Fever, sore throat, or common cold symptoms', sublabel: 'Mild body aches, running nose', value: 'viral_symptoms' },
      { label: 'Persistent joint or muscular back pain', sublabel: 'Discomfort during movement or walking', value: 'joint_back_pain' },
      { label: 'Digestive upset, mild stomach acidity or nausea', sublabel: 'Abdominal bloating or gas', value: 'mild_acidity' },
    ],
  },
  {
    id: 'onset_duration',
    question: 'When did these symptoms first start?',
    hint: 'Knowing the timeline helps determine if this is acute or chronic.',
    options: [
      { label: 'Within the last 1 to 2 hours (Sudden acute onset)', value: 'acute_hours' },
      { label: 'Earlier today (4 to 12 hours ago)', value: 'earlier_today' },
      { label: 'A few days ago (2 to 5 days)', value: 'few_days' },
      { label: 'More than a week or recurring periodically', value: 'chronic_recurring' },
    ],
  },
  {
    id: 'severity',
    question: 'How would you rate the pain or discomfort severity?',
    hint: 'On a simple scale from mild to unbearable.',
    options: [
      { label: 'Mild (1 - 3): Noticeable but manageable', value: 'mild' },
      { label: 'Moderate (4 - 6): Interfering with daily tasks', value: 'moderate' },
      { label: 'Severe (7 - 8): Intense pain or distress', value: 'severe' },
      { label: 'Unbearable (9 - 10): Worst discomfort imaginable', isEmergency: true, value: 'unbearable' },
    ],
  },
  {
    id: 'associated_signals',
    question: 'Are you experiencing any of these additional warning signs?',
    hint: 'These critical signals help us verify safety.',
    options: [
      { label: 'Profuse cold sweating, lightheadedness, or feeling faint', isEmergency: true, value: 'sweat_faint' },
      { label: 'Mild fatigue or sluggishness', value: 'fatigue' },
      { label: 'Slight headache or mild dry cough', value: 'headache_cough' },
      { label: 'None of the above', value: 'none' },
    ],
  },
];

export default function SymptomAssessmentPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hasEmergencyFlag, setHasEmergencyFlag] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AssessmentResult | null>(null);

  const step = ASSESSMENT_QUESTIONS[currentStep];

  const handleSelectOption = (optionValue: string, isEmergency?: boolean) => {
    const updatedAnswers = { ...answers, [step.id]: optionValue };
    setAnswers(updatedAnswers);

    const isEmergencyDetected = hasEmergencyFlag || !!isEmergency;
    if (isEmergency) setHasEmergencyFlag(true);

    if (currentStep < ASSESSMENT_QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      finalizeAssessment(updatedAnswers, isEmergencyDetected);
    }
  };

  const finalizeAssessment = async (finalAnswers: Record<string, string>, emergencyDetected: boolean) => {
    setIsSubmitting(true);
    try {
      // Map selections to clinical text for deterministic triage service
      let chiefComplaint = 'General malaise';
      if (finalAnswers.primary_symptom === 'chest_pain') chiefComplaint = 'Chest pain and tightness radiating to shoulder';
      else if (finalAnswers.primary_symptom === 'severe_dyspnea') chiefComplaint = 'Severe shortness of breath and respiratory distress';
      else if (finalAnswers.primary_symptom === 'viral_symptoms') chiefComplaint = 'Fever and viral respiratory cold symptoms';
      else if (finalAnswers.primary_symptom === 'joint_back_pain') chiefComplaint = 'Chronic joint and muscular lumbar back discomfort';
      else if (finalAnswers.primary_symptom === 'mild_acidity') chiefComplaint = 'Mild abdominal indigestion and epigastric discomfort';

      const severityNum =
        finalAnswers.severity === 'unbearable'
          ? 9
          : finalAnswers.severity === 'severe'
          ? 7
          : finalAnswers.severity === 'moderate'
          ? 5
          : 2;

      const res = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chiefComplaint,
          duration: finalAnswers.onset_duration,
          severity: severityNum,
          additionalNotes: `Selected associated signs: ${finalAnswers.associated_signals || 'None'}`,
        }),
      });

      const data = await res.json();
      setResult({
        id: `asmt-${Date.now()}`,
        patientId: 'pat-1',
        chiefComplaint,
        answers: finalAnswers,
        urgencyLevel: data.urgencyLevel,
        careRequirement: data.careRequirement,
        recommendedCapabilities: data.requiredCapabilities || [],
        aiReasoning: data.aiReasoning || [],
        patientAdvice: data.recommendedAction,
        isEmergencyAlert: data.isEmergencyAlert || emergencyDetected,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    setAnswers({});
    setHasEmergencyFlag(false);
    setResult(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-4">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Structured Clinical Assessment</span>
          </div>
          <span className="text-xs text-slate-400">
            Step {currentStep + 1} of {ASSESSMENT_QUESTIONS.length}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Symptom Self-Assessment
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          This controlled tool helps phrase your symptoms accurately for your doctor. It does <strong>not</strong> provide an autonomous medical diagnosis.
        </p>

        {/* Progress bar */}
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-4">
          <div
            className="h-full bg-teal-600 transition-all duration-300 rounded-full"
            style={{ width: `${((currentStep + 1) / ASSESSMENT_QUESTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Interaction Card */}
      {!result ? (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">{step.question}</h2>
            <p className="text-xs text-slate-500">{step.hint}</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {step.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleSelectOption(opt.value, opt.isEmergency)}
                disabled={isSubmitting}
                className="text-left p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/40 transition-all group flex items-start justify-between gap-4 focus:ring-2 focus:ring-teal-500"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 text-sm group-hover:text-teal-900">
                      {opt.label}
                    </span>
                    {opt.isEmergency && (
                      <span className="text-[10px] uppercase font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">
                        Urgent Flag
                      </span>
                    )}
                  </div>
                  {opt.sublabel && <p className="text-xs text-slate-500">{opt.sublabel}</p>}
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-1 transition-all mt-1" />
              </button>
            ))}
          </div>

          {currentStep > 0 && (
            <div className="pt-2 flex justify-between">
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Back to previous question</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Final Assessment Outcome Card */
        <div className="space-y-6">
          {/* Emergency Alert vs Normal Outcome */}
          {result.isEmergencyAlert ? (
            <div className="bg-red-50 border-2 border-red-500 rounded-3xl p-6 sm:p-8 space-y-6 shadow-md">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center flex-shrink-0 animate-bounce">
                  <AlertOctagon className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs uppercase font-extrabold text-red-800 tracking-wider">
                    Emergency Alert Triggered
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-red-950">
                    Urgent Emergency Care Recommended
                  </h2>
                  <p className="text-xs sm:text-sm text-red-800 leading-relaxed">
                    Your answers indicate high-risk symptoms (such as acute chest discomfort or severe breathing distress).
                    Do not wait for a routine clinic visit.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-red-200 space-y-3">
                <h3 className="font-bold text-slate-900 text-sm">Emergency Assessment Summary</h3>
                <p className="text-xs text-slate-700 font-medium">Care Requirement: <strong>{result.careRequirement}</strong></p>
                <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                  {result.aiReasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <Link
                  href="/patient/sos"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-base shadow-lg transition-transform hover:scale-[1.02]"
                >
                  <AlertOctagon className="w-5 h-5" />
                  <span>Launch Emergency SOS Fast-Lane Now</span>
                </Link>
                <button
                  onClick={handleReset}
                  className="text-xs font-semibold text-red-800 hover:underline py-2"
                >
                  Start Over
                </button>
              </div>
            </div>
          ) : (
            /* Normal Care Outcome */
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs uppercase font-extrabold text-teal-700 tracking-wider">
                    Assessment Complete
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                    Advise: Consult a Medical Practitioner
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Based on your responses, there are no immediate life-threatening emergency flags detected.
                    Please visit your local Primary Health Center (PHC) or doctor for proper clinical evaluation.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">Structured Clinical Summary</h3>
                <p className="text-xs text-slate-700 font-semibold">{result.chiefComplaint}</p>
                <p className="text-xs text-slate-600">{result.patientAdvice}</p>
                <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-200 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-teal-600" />
                  <span>This summary is ready to share with your PHC medical officer.</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Link
                  href="/patient"
                  className="px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm shadow-sm"
                >
                  Return to Patient Home
                </Link>
                <button
                  onClick={handleReset}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Retake Assessment
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
