import React, { useState, useEffect, useRef } from 'react';
import * as api from '@/api/endpoints';
import * as T from '@/api/types';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  User,
  Activity,
  Heart,
  FileText,
  Pill,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  X,
  FileCheck,
  Printer,
  Eye,
  Calendar,
  AlertTriangle,
  Phone,
  MapPin,
  PlusCircle,
} from 'lucide-react';

interface PatientHistoryViewProps {
  patientId: string;
  patientName?: string;
  patientUhid?: string;
  onClose?: () => void;
  onCreateNewVisit?: (patient: T.Patient) => void;
}

export const PatientHistoryView: React.FC<PatientHistoryViewProps> = (props) => {
  return (
    <ErrorBoundary fallbackTitle="Longitudinal Patient Summary Recovery">
      <PatientHistoryContent {...props} />
    </ErrorBoundary>
  );
};

const PatientHistoryContent: React.FC<PatientHistoryViewProps> = ({
  patientId,
  patientName: initialPatientName,
  patientUhid: initialPatientUhid,
  onClose,
  onCreateNewVisit,
}) => {
  const [patient, setPatient] = useState<T.Patient | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);

  // Document preview modal & printing
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewPdfBlobUrl, setPreviewPdfBlobUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewPdfBlobUrl) {
        URL.revokeObjectURL(previewPdfBlobUrl);
      }
    };
  }, [previewPdfBlobUrl]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch patient profile details
      try {
        const p = await api.getPatient(patientId);
        setPatient(p);
      } catch (_) {
        // Fallback to initial props if getPatient fails
      }

      // 2. Fetch longitudinal visits
      const data = await api.getPatientHistory(patientId);
      const safeData = Array.isArray(data) ? data : [];
      setHistory(safeData);

      if (safeData.length > 0) {
        const firstId = safeData[0].visit?.id || safeData[0].id;
        if (firstId) {
          setExpandedVisitId(firstId);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load patient longitudinal medical record.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) {
      loadData();
    }
  }, [patientId]);

  const toggleExpand = (visitId: string) => {
    setExpandedVisitId((prev) => (prev === visitId ? null : visitId));
  };

  const handleOpenDocPreview = async (docId: string) => {
    setPreviewDocId(docId);
    if (previewPdfBlobUrl) {
      URL.revokeObjectURL(previewPdfBlobUrl);
      setPreviewPdfBlobUrl(null);
    }
    setIsPreviewLoading(true);
    setPrintError(null);
    try {
      let blobUrl: string;
      try {
        blobUrl = await api.getDocumentHtmlBlobUrl(docId);
      } catch {
        blobUrl = await api.getDocumentPdfBlobUrl(docId);
      }
      setPreviewPdfBlobUrl(blobUrl);
    } catch (err: any) {
      setPrintError(err.message || 'Unable to load sealed document from server.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleCloseDocPreview = () => {
    setPreviewDocId(null);
    if (previewPdfBlobUrl) {
      URL.revokeObjectURL(previewPdfBlobUrl);
      setPreviewPdfBlobUrl(null);
    }
  };

  const handlePrintDocument = async (docId: string) => {
    setPrintError(null);
    try {
      if (printFrameRef.current?.contentWindow) {
        printFrameRef.current.contentWindow.focus();
        printFrameRef.current.contentWindow.print();
        return;
      }

      let blobUrl = previewPdfBlobUrl;
      if (!blobUrl || previewDocId !== docId) {
        try {
          blobUrl = await api.getDocumentHtmlBlobUrl(docId);
        } catch {
          blobUrl = await api.getDocumentPdfBlobUrl(docId);
        }
        setPreviewPdfBlobUrl(blobUrl);
      }
      setPreviewDocId(docId);
      setTimeout(() => {
        try {
          printFrameRef.current?.contentWindow?.focus();
          printFrameRef.current?.contentWindow?.print();
        } catch (_) {}
      }, 500);
    } catch (err: any) {
      setPrintError('Prescription saved and finalized, but printing could not be completed.');
    }
  };

  const patientDisplayName = patient?.full_name || initialPatientName || 'Patient Record';
  const patientCode = patient?.patient_code || initialPatientUhid || '—';
  const age = patient?.date_of_birth
    ? `${new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()} yrs`
    : null;

  return (
    <div className="space-y-4 max-w-5xl mx-auto select-none">
      {/* Hidden iframe for native desktop system printing */}
      <iframe
        ref={printFrameRef}
        title="print_frame"
        className="hidden"
        style={{ position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 }}
      />

      {/* 1. PATIENT CONTEXT HEADER (Identity & Basic Permitted Details) */}
      <div className="bg-surface-base border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-charcoal">{patientDisplayName}</h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-brand-light text-brand-primary font-bold">
                Patient Code: {patientCode}
              </span>
              {patient?.status && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {patient.status}
                </span>
              )}
            </div>
            <div className="text-xs text-charcoal-muted flex flex-wrap items-center gap-3">
              {patient?.sex && <span>Sex: <strong className="text-charcoal">{patient.sex}</strong></span>}
              {age && <span>• Age: <strong className="text-charcoal">{age}</strong></span>}
              {patient?.phone && (
                <span className="flex items-center space-x-1">
                  <Phone className="w-3 h-3 text-gray-400" />
                  <span className="font-mono">{patient.phone}</span>
                </span>
              )}
              {patient?.address && (
                <span className="flex items-center space-x-1 truncate max-w-xs">
                  <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                  <span className="truncate">{patient.address}</span>
                </span>
              )}
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center space-x-2 shrink-0">
            {onCreateNewVisit && patient && (
              <button
                type="button"
                onClick={() => onCreateNewVisit(patient)}
                className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1 shadow-sm"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New Visit</span>
              </button>
            )}
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center space-x-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close history modal"
                title="Close (Esc)"
                className="p-1.5 rounded-md text-charcoal-muted hover:bg-gray-100 hover:text-charcoal transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Print / View Error Alert */}
      {printError && (
        <div className="p-3 bg-amber-50 text-amber-900 border border-amber-200 rounded-md text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{printError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPrintError(null)}
            className="text-amber-700 hover:text-amber-900 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. VISITS TIMELINE (Individual Clinical Encounters) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-charcoal-muted flex items-center space-x-1.5">
            <Calendar className="w-3.5 h-3.5 text-brand-primary" />
            <span>Clinical Encounters History ({history.length})</span>
          </h3>
          <span className="text-[11px] text-charcoal-muted">
            Click any encounter to inspect complete vitals, diagnosis, and prescriptions
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-charcoal-muted space-y-2 bg-white rounded-lg border border-gray-200">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-brand-primary" />
            <div>Loading comprehensive clinical history from SIXSENSE Server...</div>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 space-y-2">
            <div className="font-bold flex items-center space-x-1">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Failed to load medical history</span>
            </div>
            <p>{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="btn-secondary text-xs py-1 px-2.5"
            >
              Retry
            </button>
          </div>
        ) : history.length === 0 ? (
          <div className="py-12 text-center text-charcoal-muted text-xs bg-canvas-subtle rounded-lg border border-dashed border-gray-300 space-y-2">
            <div>No prior clinical visits or consultations recorded for this patient yet.</div>
            {onCreateNewVisit && patient && (
              <button
                type="button"
                onClick={() => onCreateNewVisit(patient)}
                className="btn-primary text-xs py-1.5 px-3"
              >
                Create First Visit Encounter
              </button>
            )}
          </div>
        ) : (
          <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-gray-200">
            {history.map((record, index) => {
              // Extract visit object safely
              const visit = record.visit || record;
              const visitId = visit.id || record.id || `vis_idx_${index}`;
              // Prefer patient_visit_seq (e.g. 1, 2, 3) for Visit No. display
              const rawSeq = visit.patient_visit_seq ?? record.patient_visit_seq;
              const visitNum = rawSeq != null
                ? `Visit No. ${String(rawSeq).padStart(2, '0')}`
                : (visit.visit_number || record.visit_number
                    ? `Visit No. ${visit.visit_number || record.visit_number}`
                    : `Visit No. ${history.length - index}`);
              // Per-visit OPD number (new system) — preferred over patient-level opd_case_id
              const visitOpd = visit.opd_number || record.opd_number || null;
              const visitDate = visit.visit_date || record.visit_date || visit.created_at;
              const visitStatus = visit.status || record.status || 'RECORDED';
              const doctorName = record.doctor_name || visit.doctor_name || 'Attending Physician';
              const purpose = visit.purpose || record.purpose || 'General Consultation';

              const vitals = record.vitals || (record.pulse_rate || record.blood_pressure || record.temperature_f ? record : null);
              const complaints = record.complaints || (record.chief_complaint || record.chief_complaints_text ? { chief_complaint: record.chief_complaint || record.chief_complaints_text } : null);
              const complaintsList: T.VisitComplaint[] = Array.isArray(record.complaints_list) ? record.complaints_list : [];
              const ayushCase = record.ayush_case || record.case_sheet;
              const diagnoses = Array.isArray(record.diagnoses) ? record.diagnoses : [];
              const prescription = record.prescription;
              const rxItems = Array.isArray(prescription?.items) ? prescription.items : [];
              const documents = Array.isArray(record.documents) ? record.documents : [];
              const hasDocs = documents.length > 0 || !!record.has_document;

              const isExpanded = expandedVisitId === visitId;

              return (
                <div key={visitId} className="relative group">
                  {/* Timeline Node */}
                  <div
                    className={`absolute -left-[27px] top-3.5 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center transition-colors ${
                      visitStatus === 'FINALIZED' || visitStatus === 'COMPLETED'
                        ? 'border-emerald-500 text-emerald-600'
                        : 'border-brand-primary text-brand-primary'
                    }`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        visitStatus === 'FINALIZED' || visitStatus === 'COMPLETED'
                          ? 'bg-emerald-500'
                          : 'bg-brand-primary'
                      }`}
                    />
                  </div>

                  {/* Visit Card */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden transition-all">
                    {/* Header (Accordion Toggle) */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleExpand(visitId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExpand(visitId);
                        }
                      }}
                      className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-canvas-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="text-charcoal-muted">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-charcoal">
                              {visitDate
                                ? new Date(visitDate).toLocaleDateString('en-GB', {
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : 'Visit Encounter'}
                            </span>
                            <span className="font-mono text-[11px] font-bold text-brand-primary">
                              {visitNum}
                            </span>
                            {visitOpd && (
                              <span className="font-mono text-[10px] text-charcoal-muted bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                                OPD: {visitOpd}
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                                visitStatus === 'FINALIZED' || visitStatus === 'COMPLETED'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-blue-50 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {visitStatus}
                            </span>
                          </div>

                          <div className="text-[11px] text-charcoal-muted flex items-center space-x-3 mt-0.5">
                            <span className="flex items-center space-x-1">
                              <User className="w-3 h-3 text-gray-400" />
                              <span>{doctorName}</span>
                            </span>
                            <span>•</span>
                            <span>Purpose: <strong className="text-charcoal">{purpose}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Right summary badges */}
                      <div className="flex items-center space-x-2 text-[11px]">
                        {diagnoses.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-brand-light text-brand-primary font-medium">
                            {diagnoses[0].name || diagnoses[0].code || 'Diagnosis'}
                            {diagnoses.length > 1 ? ` +${diagnoses.length - 1}` : ''}
                          </span>
                        )}
                        {hasDocs && (
                          <span className="flex items-center text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-medium">
                            <FileCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            Sealed Document
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3. EXPANDED VISIT DETAILS */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 p-4 space-y-4 bg-canvas-subtle/30 text-xs">
                        {/* Vitals */}
                        {vitals && (
                          <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                            <h4 className="font-bold text-charcoal flex items-center space-x-1.5 text-[11px]">
                              <Activity className="w-3.5 h-3.5 text-brand-primary" />
                              <span>Clinical Vitals &amp; Intake Metrics</span>
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-[11px]">
                              <div className="bg-canvas-subtle p-2 rounded">
                                <span className="text-charcoal-muted block text-[10px]">Pulse Rate</span>
                                <span className="font-bold text-charcoal">
                                  {vitals.pulse_rate || vitals.pulse_bpm || '—'} bpm
                                </span>
                              </div>
                              <div className="bg-canvas-subtle p-2 rounded">
                                <span className="text-charcoal-muted block text-[10px]">Blood Pressure</span>
                                <span className="font-bold text-charcoal">
                                  {vitals.systolic_bp && vitals.diastolic_bp
                                    ? `${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg`
                                    : vitals.bp_systolic && vitals.bp_diastolic
                                    ? `${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg`
                                    : vitals.blood_pressure
                                    ? `${vitals.blood_pressure} mmHg`
                                    : '—'}
                                </span>
                              </div>
                              <div className="bg-canvas-subtle p-2 rounded">
                                <span className="text-charcoal-muted block text-[10px]">Temperature</span>
                                <span className="font-bold text-charcoal">
                                  {vitals.temperature || vitals.temperature_f || '—'} °F
                                </span>
                              </div>
                              <div className="bg-canvas-subtle p-2 rounded">
                                <span className="text-charcoal-muted block text-[10px]">SpO2</span>
                                <span className="font-bold text-charcoal">
                                  {vitals.oxygen_saturation || vitals.spo2_percent || '—'} %
                                </span>
                              </div>
                              <div className="bg-canvas-subtle p-2 rounded">
                                <span className="text-charcoal-muted block text-[10px]">Resp. Rate</span>
                                <span className="font-bold text-charcoal">
                                  {vitals.respiratory_rate || '—'} /min
                                </span>
                              </div>
                              <div className="bg-canvas-subtle p-2 rounded">
                                <span className="text-charcoal-muted block text-[10px]">Weight</span>
                                <span className="font-bold text-charcoal">
                                  {vitals.weight_kg || '—'} kg
                                </span>
                              </div>
                              <div className="bg-canvas-subtle p-2 rounded">
                                <span className="text-charcoal-muted block text-[10px]">Height</span>
                                <span className="font-bold text-charcoal">
                                  {vitals.height_cm || '—'} cm
                                </span>
                              </div>
                            </div>
                            {vitals.notes && (
                              <div className="text-[10px] text-charcoal-muted pt-1">
                                Notes: {vitals.notes}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Complaints & History */}
                        {complaints && (
                          <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-1.5">
                            <h4 className="font-bold text-charcoal flex items-center space-x-1.5 text-[11px]">
                              <FileText className="w-3.5 h-3.5 text-brand-medium" />
                              <span>Clinical Notes &amp; History of Present Illness</span>
                            </h4>
                            {complaintsList.length > 0 ? (
                              <div className="space-y-1.5 py-1">
                                {complaintsList.map((item, idx) => (
                                  <div key={idx} className="flex items-center space-x-2 text-xs">
                                    <span className="font-mono text-[10px] font-bold text-brand-primary bg-brand-light px-1.5 py-0.5 rounded">
                                      #{idx + 1}
                                    </span>
                                    <span className="font-semibold text-charcoal">{item.complaint_text}</span>
                                    {item.duration_value != null && (
                                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-mono">
                                        {item.duration_value} {item.duration_unit || 'Days'}
                                      </span>
                                    )}
                                    {item.notes && (
                                      <span className="text-[11px] text-charcoal-muted italic">
                                        — {item.notes}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-charcoal text-xs whitespace-pre-wrap leading-relaxed">
                                {complaints.chief_complaint ||
                                  complaints.chief_complaints_text ||
                                  'No chief complaints recorded.'}
                              </div>
                            )}
                            {(complaints.history_text || complaints.history_present_illness) && (
                              <div className="pt-2 border-t border-gray-100 text-charcoal-muted text-[11px]">
                                <strong className="text-charcoal">History:</strong>{' '}
                                {complaints.history_text || complaints.history_present_illness}
                              </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-[10px] text-charcoal-muted">
                              {complaints.past_history && (
                                <div><strong>Past History:</strong> {complaints.past_history}</div>
                              )}
                              {complaints.family_history && (
                                <div><strong>Family History:</strong> {complaints.family_history}</div>
                              )}
                              {complaints.personal_history && (
                                <div><strong>Personal/Diet:</strong> {complaints.personal_history}</div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Ayush Clinical Assessment & Ashtavidha Pariksha */}
                        {ayushCase && (
                          <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                            <h4 className="font-bold text-charcoal flex items-center space-x-1.5 text-[11px]">
                              <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" />
                              <span>Ayush Clinical Assessment &amp; Ashtavidha Pariksha</span>
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-[11px]">
                              {ayushCase.prakriti && (
                                <div className="bg-canvas-subtle p-2 rounded">
                                  <span className="text-charcoal-muted block text-[10px]">Prakriti</span>
                                  <span className="font-semibold text-charcoal">{ayushCase.prakriti}</span>
                                </div>
                              )}
                              {ayushCase.vikriti && (
                                <div className="bg-canvas-subtle p-2 rounded">
                                  <span className="text-charcoal-muted block text-[10px]">Vikriti</span>
                                  <span className="font-semibold text-charcoal">{ayushCase.vikriti}</span>
                                </div>
                              )}
                              {(ayushCase.ashtavidha_nadi || ayushCase.nadi) && (
                                <div className="bg-canvas-subtle p-2 rounded">
                                  <span className="text-charcoal-muted block text-[10px]">Nadi (Pulse)</span>
                                  <span className="font-semibold text-charcoal">{ayushCase.ashtavidha_nadi || ayushCase.nadi}</span>
                                </div>
                              )}
                              {ayushCase.agni && (
                                <div className="bg-canvas-subtle p-2 rounded">
                                  <span className="text-charcoal-muted block text-[10px]">Agni (Digestive Fire)</span>
                                  <span className="font-semibold text-charcoal">{ayushCase.agni}</span>
                                </div>
                              )}
                              {ayushCase.kostha && (
                                <div className="bg-canvas-subtle p-2 rounded">
                                  <span className="text-charcoal-muted block text-[10px]">Kostha (Bowel)</span>
                                  <span className="font-semibold text-charcoal">{ayushCase.kostha}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Diagnoses */}
                        {diagnoses.length > 0 && (
                          <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                            <h4 className="font-bold text-charcoal flex items-center space-x-1.5 text-[11px]">
                              <Heart className="w-3.5 h-3.5 text-brand-primary" />
                              <span>Physician-Confirmed Diagnosis</span>
                            </h4>
                            <div className="space-y-1.5">
                              {diagnoses.map((d: any, dIdx: number) => (
                                <div
                                  key={d.id || d.diagnosis_id || dIdx}
                                  className="p-2 rounded bg-canvas-subtle border border-gray-100 flex items-center justify-between"
                                >
                                  <div>
                                    <span className="font-mono text-xs font-bold text-brand-primary mr-2">
                                      {d.code || d.diagnosis_code || d.icd11_code || d.namaste_code || 'DIAG'}
                                    </span>
                                    <span className="font-semibold text-charcoal">
                                      {d.name || d.diagnosis_name || d.disease_name || d.diagnosis_text}
                                    </span>
                                  </div>
                                  {d.diagnosis_text && d.diagnosis_text !== (d.name || d.disease_name) && (
                                    <span className="text-[10px] text-charcoal-muted italic">
                                      {d.diagnosis_text}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Prescription Items */}
                        {rxItems.length > 0 && (
                          <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-charcoal flex items-center space-x-1.5 text-[11px]">
                                <Pill className="w-3.5 h-3.5 text-brand-medium" />
                                <span>Prescribed Formulations ({rxItems.length})</span>
                              </h4>
                              {prescription?.status && (
                                <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  Status: {prescription.status}
                                </span>
                              )}
                            </div>

                            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                              {rxItems.map((it: any, itIdx: number) => (
                                <div key={it.id || itIdx} className="p-2.5 flex items-start justify-between bg-canvas-subtle">
                                  <div>
                                    <div className="font-semibold text-charcoal text-xs">
                                      {it.medicine_name_snapshot || it.medicine_name || 'Prescription Item'}
                                    </div>
                                    <div className="text-[11px] text-charcoal-muted mt-0.5">
                                      <strong>Regimen:</strong> {it.dosage_text || it.dosage || (it.dosage_form && it.strength ? `${it.dosage_form} (${it.strength})` : it.dosage_form || it.strength || '—')} •{' '}
                                      <strong>Timing:</strong> {it.frequency_text || it.timing || it.frequency || '—'} •{' '}
                                      <strong>Duration:</strong> {it.duration_text || it.duration || (it.duration_days ? `${it.duration_days} days` : '—')}
                                    </div>
                                    {(it.anupana_text || it.instructions) && (
                                      <div className="text-[10px] text-charcoal-muted mt-0.5">
                                        <strong>Anupana / Vehicle:</strong> {it.anupana_text || it.instructions}
                                      </div>
                                    )}
                                    {(it.pathya_text || it.apathya_text) && (
                                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                        {it.pathya_text && (
                                          <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded">
                                            <strong>✓ Pathya:</strong> {it.pathya_text}
                                          </span>
                                        )}
                                        {it.apathya_text && (
                                          <span className="text-[10px] bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded">
                                            <strong>✗ Apathya:</strong> {it.apathya_text}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                      it.source_type === 'RULE_SUGGESTION'
                                        ? 'bg-brand-tint text-brand-primary'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    {it.source_type === 'RULE_SUGGESTION' ? 'Rule Suggestion' : 'Doctor Added'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Documents & Printing */}
                        {documents.length > 0 && (
                          <div className="bg-emerald-50/70 p-3 rounded-lg border border-emerald-200 space-y-2">
                            <h4 className="font-bold text-emerald-950 flex items-center space-x-1.5 text-[11px]">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Tamper-Evident Sealed Documents ({documents.length})</span>
                            </h4>
                            <div className="space-y-2">
                              {documents.map((doc: any) => (
                                <div
                                  key={doc.id}
                                  className="bg-white p-2.5 rounded border border-emerald-200 flex items-center justify-between"
                                >
                                  <div>
                                    <div className="font-bold text-xs text-charcoal">
                                      {doc.document_type === 'PRESCRIPTION_PDF' ? 'Official Clinical Prescription' : 'Clinical Case Sheet'}
                                    </div>
                                    <div className="text-[10px] text-charcoal-muted font-mono mt-0.5">
                                      SHA-256: {doc.file_hash ? `${doc.file_hash.substring(0, 24)}...` : 'Archived'}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenDocPreview(doc.id)}
                                      className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-charcoal-muted" />
                                      <span>View Document</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handlePrintDocument(doc.id)}
                                      className="btn-primary text-xs py-1 px-2.5 flex items-center space-x-1 shadow-sm"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                      <span>Print Prescription</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sealed Document Preview Modal */}
      {previewDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-surface-base">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-brand-primary" />
                <h3 className="text-sm font-bold text-charcoal">
                  Sealed Clinical Document Preview
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handlePrintDocument(previewDocId)}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1 shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  aria-label="Close document preview"
                  onClick={handleCloseDocPreview}
                  className="p-1.5 rounded-md text-charcoal-muted hover:bg-gray-100 hover:text-charcoal transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {isPreviewLoading ? (
                <div className="py-16 text-center text-xs text-charcoal-muted space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-brand-primary" />
                  <div>Rendering styled clinical document from SIXSENSE Server...</div>
                </div>
              ) : previewPdfBlobUrl ? (
                <iframe
                  ref={printFrameRef}
                  src={previewPdfBlobUrl}
                  className="w-full h-[75vh] border border-gray-200 rounded-md bg-white shadow-sm"
                  title="Sealed Clinical Document"
                />
              ) : (
                <div className="py-16 text-center text-xs text-charcoal-muted">
                  No preview available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
