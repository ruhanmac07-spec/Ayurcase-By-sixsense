'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  FileQuestion,
  FileCheck,
  Clock,
  Sparkles,
  ShieldCheck,
  Eye,
  FileCode,
  ArrowRight,
} from 'lucide-react';
import { MedicalDocument } from '@/types';

export default function PatientDocumentsPage() {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<MedicalDocument | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const res = await fetch('/api/documents?patientId=pat-1');
      const data = await res.json();
      setDocuments(data);
      if (data.length > 0 && !selectedDoc) {
        setSelectedDoc(data[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPreset = async (presetType: 'PRESET_CARDIAC' | 'PRESET_LAB' | 'PRESET_UNREADABLE') => {
    setIsUploading(true);
    try {
      let title = 'Uploaded Medical Report.pdf';
      let fileType: 'PDF' | 'IMAGE_JPG' = 'PDF';

      if (presetType === 'PRESET_CARDIAC') {
        title = 'Apex Hospital ECG & Discharge Note.pdf';
      } else if (presetType === 'PRESET_LAB') {
        title = 'Metropolis Lipid & HbA1c Pathology Report.pdf';
      } else if (presetType === 'PRESET_UNREADABLE') {
        title = 'Blurry Handwritten OPD Slip.jpg';
        fileType = 'IMAGE_JPG';
      }

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: 'pat-1',
          title,
          fileType,
          preset: presetType,
        }),
      });
      const data = await res.json();
      if (data.document) {
        await loadDocuments();
        setSelectedDoc(data.document);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleVerifyCandidateData = async (docId: string) => {
    if (!selectedDoc?.candidateExtraction) return;
    try {
      const res = await fetch('/api/documents/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'DOCTOR',
          'x-user-id': 'usr-doctor-1',
        },
        body: JSON.stringify({
          documentId: docId,
          verifiedConditions: selectedDoc.candidateExtraction.conditions,
          verifiedMedications: selectedDoc.candidateExtraction.medications,
        }),
      });
      const data = await res.json();
      if (data.document) {
        await loadDocuments();
        setSelectedDoc(data.document);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
          <FileText className="w-3.5 h-3.5" />
          <span>Medical Document Records & OCR Verification</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Medical Documents & Reports
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-2xl">
          Upload PDF discharge summaries, laboratory reports, or diagnostic slips.
          Our OCR engine extracts candidate medical entities for <strong>clinician verification</strong> before committing to trusted history.
        </p>
      </div>

      {/* Demo Upload Quick-Actions */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">1-Click Test Presets</span>
            <h2 className="text-lg font-bold">Simulate Document Ingestion</h2>
          </div>
          <span className="text-xs text-slate-400">Test readable vs unreadable fallback handling</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <button
            onClick={() => handleUploadPreset('PRESET_CARDIAC')}
            disabled={isUploading}
            className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left space-y-1 transition-all group"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
              <FileCheck className="w-4 h-4 text-teal-400" />
              <span>Readable Discharge Note</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Contains Hypertension, BP 150/90, Amlodipine. High confidence extraction.
            </p>
          </button>

          <button
            onClick={() => handleUploadPreset('PRESET_LAB')}
            disabled={isUploading}
            className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left space-y-1 transition-all group"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
              <FileCheck className="w-4 h-4 text-blue-400" />
              <span>Readable Blood Lab Report</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Contains HbA1c 6.8%, Fasting Blood Glucose 128 mg/dL, Dyslipidemia.
            </p>
          </button>

          <button
            onClick={() => handleUploadPreset('PRESET_UNREADABLE')}
            disabled={isUploading}
            className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-red-900/40 text-left space-y-1 transition-all group"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-red-300">
              <FileQuestion className="w-4 h-4 text-red-400" />
              <span>Blurry Handwritten Slip</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Demonstrates safe fallback: explains unreadable scan with zero hallucinated data.
            </p>
          </button>
        </div>
      </div>

      {/* Main Document Split View: List on Left, Detail / Extraction on Right */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Document List */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900 px-1">Uploaded Library ({documents.length})</h2>
          <div className="space-y-2">
            {documents.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all space-y-2 ${
                    isSelected
                      ? 'bg-teal-50/70 border-teal-500 shadow-sm ring-1 ring-teal-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900 text-xs leading-tight line-clamp-2">
                      {doc.title}
                    </h3>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {doc.fileType}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      doc.verificationStatus === 'VERIFIED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : doc.isReadable
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-red-100 text-red-900'
                    }`}>
                      {doc.verificationStatus === 'VERIFIED' ? '✓ Verified' : doc.isReadable ? 'Needs Verification' : 'Unreadable'}
                    </span>
                    <span className="text-slate-400">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Document Extraction Workspace */}
        <div className="md:col-span-2 space-y-6">
          {selectedDoc ? (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Document Detail</span>
                  <h2 className="text-lg font-bold text-slate-900">{selectedDoc.title}</h2>
                  <p className="text-xs text-slate-500">
                    Uploaded on {new Date(selectedDoc.uploadedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase ${
                    selectedDoc.verificationStatus === 'VERIFIED'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : selectedDoc.isReadable
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-red-100 text-red-900 border border-red-300'
                  }`}>
                    {selectedDoc.verificationStatus === 'VERIFIED'
                      ? 'Clinical History Verified'
                      : selectedDoc.isReadable
                      ? 'AI Extracted — Needs Verification'
                      : 'Unreadable Document'}
                  </span>
                </div>
              </div>

              {/* Raw Document OCR Preview */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700">Raw Document Text / Scan Transcript:</span>
                <pre className="p-4 rounded-2xl bg-slate-900 text-teal-300 font-mono text-xs whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {selectedDoc.rawTextPreview || 'No raw text could be acquired.'}
                </pre>
              </div>

              {/* Extraction Outcome */}
              {selectedDoc.isReadable && selectedDoc.candidateExtraction ? (
                <div className="space-y-4 bg-teal-50/50 p-5 rounded-2xl border border-teal-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-teal-700" />
                      <h3 className="font-bold text-slate-900 text-sm">Candidate Extracted Entities</h3>
                    </div>
                    <span className="text-xs font-semibold text-teal-800">
                      Confidence: {(selectedDoc.candidateExtraction.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1.5">
                      <span className="font-bold text-slate-700">Detected Conditions:</span>
                      {selectedDoc.candidateExtraction.conditions.map((c, i) => (
                        <div key={i} className="px-3 py-1.5 rounded-lg bg-white border border-teal-200 text-slate-800 font-medium">
                          {c}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <span className="font-bold text-slate-700">Detected Medications:</span>
                      {selectedDoc.candidateExtraction.medications.map((m, i) => (
                        <div key={i} className="px-3 py-1.5 rounded-lg bg-white border border-teal-200 text-slate-800 font-medium">
                          {m}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Doctor Verification Action */}
                  <div className="pt-3 border-t border-teal-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="text-[11px] text-slate-500">
                      {selectedDoc.verificationStatus === 'VERIFIED' ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified by {selectedDoc.verifiedByDoctorName} on {new Date(selectedDoc.verifiedAt || '').toLocaleDateString()}
                        </span>
                      ) : (
                        <span>Clinician review required before adding to persistent health history.</span>
                      )}
                    </div>

                    {selectedDoc.verificationStatus !== 'VERIFIED' && (
                      <button
                        onClick={() => handleVerifyCandidateData(selectedDoc.id)}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-sm transition-all"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify & Add to Patient Record</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Unreadable Case Warning */
                <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <h3 className="font-bold text-red-950">Reliable Extraction Unavailable</h3>
                      <p className="text-red-800 leading-relaxed">
                        Could not reliably extract structured data from this document.
                        The original document has been preserved safely without generating hallucinated medical facts.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center text-slate-400 text-xs">
              Select a document from the left to view candidate OCR extractions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
