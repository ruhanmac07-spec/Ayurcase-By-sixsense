import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../state/AuthContext';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import { Modal } from '../../components/Modal';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import {
  Save,
  CheckCircle2,
  Printer,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Info,
  ShieldCheck,
  RefreshCw,
  Eye,
  X,
  FileCheck,
  Search,
  BookOpen,
  BarChart2,
} from 'lucide-react';

interface ConsultationWorkspaceProps {
  visitId: string;
  onBack: () => void;
}

export interface ComplaintItemState {
  id?: string;
  complaint_text: string;
  duration_value: number | string;
  duration_unit: string;
  notes: string;
}

export const COMPLAINT_SUGGESTIONS = [
  'Kasa (Cough)',
  'Shwasa (Dyspnea)',
  'Jwara (Fever)',
  'Sandhishoola (Joint Pain)',
  'Amlapitta (Hyperacidity)',
  'Atisara (Diarrhea)',
  'Grahani (Malabsorption)',
  'Prameha (Frequent Urination)',
  'Twak Vikara (Skin Eruptions)',
  'Vatarakta (Gouty Pain)',
  'Katishoola (Low Back Pain)',
];

export const ConsultationWorkspace: React.FC<ConsultationWorkspaceProps> = (props) => {
  return (
    <ErrorBoundary fallbackTitle="Consultation Workspace Recovery">
      <ConsultationWorkspaceContent {...props} />
    </ErrorBoundary>
  );
};

const ConsultationWorkspaceContent: React.FC<ConsultationWorkspaceProps> = ({
  visitId,
  onBack,
}) => {
  const { user } = useAuth();
  const [data, setData] = useState<{
    visit_detail: T.VisitDetailResponse;
    diagnoses: T.VisitDiagnosisDetail[];
    prescription: T.PrescriptionDetail | null;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'notes' | 'ayush' | 'diagnosis' | 'prescription' | 'intelligence'>('notes');

  // Historical Memory & Observational Analytics
  const [similarCases, setSimilarCases] = useState<T.HistoricalCase[]>([]);
  const [isLoadingSimilarCases, setIsLoadingSimilarCases] = useState(false);
  const [similarSearchQuery, setSimilarSearchQuery] = useState('');
  const [observationalAnalytics, setObservationalAnalytics] = useState<T.ObservationalAnalytics | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Clinical Notes state
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [complaintsList, setComplaintsList] = useState<ComplaintItemState[]>([
    { complaint_text: '', duration_value: '', duration_unit: 'Days', notes: '' },
  ]);
  const [historyText, setHistoryText] = useState('');
  const [pastHistory, setPastHistory] = useState('');
  const [familyHistory, setFamilyHistory] = useState('');
  const [personalHistory, setPersonalHistory] = useState('');

  // AYUSH Case Taking state (Versioned JSON)
  const [prakriti, setPrakriti] = useState('Vata-Pitta');
  const [nadi, setNadi] = useState('Manduka (Frog-like)');
  const [agni, setAgni] = useState('Vishamagni');
  const [koshtha, setKoshtha] = useState('Madhyama');
  const [customAyushNotes, setCustomAyushNotes] = useState('');

  // Master Catalogue & Diagnoses
  const [catalog, setCatalog] = useState<T.DiagnosisCatalog[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [diagNotes, setDiagNotes] = useState('');
  const [diagSearchQuery, setDiagSearchQuery] = useState('');
  const [diagSearchResults, setDiagSearchResults] = useState<T.DiagnosisCatalog[]>([]);
  const [isSearchingDiag, setIsSearchingDiag] = useState(false);
  const [isDiagDropdownOpen, setIsDiagDropdownOpen] = useState(false);
  const [diagDuplicateWarning, setDiagDuplicateWarning] = useState<string | null>(null);

  // Validated Assistance
  const [validatedAssistance, setValidatedAssistance] = useState<T.ValidatedAssistanceResult | null>(null);
  const [isLoadingAssistance, setIsLoadingAssistance] = useState(false);

  // Prescription Items Draft
  const [rxItems, setRxItems] = useState<Array<{
    medicine_id?: string;
    medicine_name_snapshot: string;
    dosage_text: string;
    frequency_text: string;
    duration_text: string;
    anupana_text: string;
    pathya_text?: string;
    apathya_text?: string;
    source_type: 'RULE_SUGGESTION' | 'DOCTOR_ADDED';
    rule_id?: string;
    rule_version?: number;
  }>>([]);

  // Master Medicines Catalog for bilingual prescription selection
  const [masterMedicines, setMasterMedicines] = useState<T.Medicine[]>([]);

  // Fast Clinical Medicine Search State
  const [medSearchQuery, setMedSearchQuery] = useState('');
  const [medSearchResults, setMedSearchResults] = useState<T.MedicineSearchResult[]>([]);
  const [isSearchingMeds, setIsSearchingMeds] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Finalization & Document state
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<T.Document | null>(null);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Robust Save State UX: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveTimestamp, setSaveTimestamp] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // PDF Preview and Print state
  const [previewDocModalOpen, setPreviewDocModalOpen] = useState(false);
  const [previewPdfBlobUrl, setPreviewPdfBlobUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  // Element Refs for programmatic focus management
  const notesInputRef = useRef<HTMLInputElement | null>(null);
  const ayushSelectRef = useRef<HTMLSelectElement | null>(null);
  const diagSelectRef = useRef<HTMLSelectElement | null>(null);
  const rxAddBtnRef = useRef<HTMLButtonElement | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  // Helper to build backward-compatible summary string from multiple complaints
  const buildComplaintSummary = (list: ComplaintItemState[]): string => {
    const active = list.filter((c) => c.complaint_text.trim());
    if (active.length === 0) return '';
    if (active.length === 1) {
      const c = active[0];
      return c.duration_value
        ? `${c.complaint_text.trim()} (${c.duration_value} ${c.duration_unit || 'Days'})`
        : c.complaint_text.trim();
    }
    return active
      .map((c, i) => {
        const dur = c.duration_value ? ` (${c.duration_value} ${c.duration_unit || 'Days'})` : '';
        return `${i + 1}. ${c.complaint_text.trim()}${dur}`;
      })
      .join('; ');
  };

  const handleAddComplaint = () => {
    setComplaintsList((prev) => [
      ...prev,
      { complaint_text: '', duration_value: '', duration_unit: 'Days', notes: '' },
    ]);
  };

  const handleRemoveComplaint = (index: number) => {
    setComplaintsList((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      const nextList =
        updated.length === 0
          ? [{ complaint_text: '', duration_value: '', duration_unit: 'Days', notes: '' }]
          : updated;
      setChiefComplaint(buildComplaintSummary(nextList));
      return nextList;
    });
  };

  const handleComplaintChange = (
    index: number,
    field: keyof ComplaintItemState,
    value: any
  ) => {
    setComplaintsList((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      setChiefComplaint(buildComplaintSummary(updated));
      return updated;
    });
  };

  const handleAddComplaintSuggestion = (suggestion: string) => {
    if (data?.visit_detail.visit.status === 'FINALIZED') return;
    setComplaintsList((prev) => {
      const last = prev[prev.length - 1];
      if (last && !last.complaint_text.trim()) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          complaint_text: suggestion,
          duration_value: last.duration_value || 3,
          duration_unit: last.duration_unit || 'Days',
        };
        setChiefComplaint(buildComplaintSummary(updated));
        return updated;
      }
      const updated = [
        ...prev,
        { complaint_text: suggestion, duration_value: 3, duration_unit: 'Days', notes: '' },
      ];
      setChiefComplaint(buildComplaintSummary(updated));
      return updated;
    });
  };

  // Fast Medicine Search effect
  useEffect(() => {
    const q = medSearchQuery.trim();
    if (!q) {
      setMedSearchResults([]);
      setIsSearchDropdownOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingMeds(true);
      try {
        const results = await api.searchMedicines(q, 15);
        setMedSearchResults(results);
        setSelectedSearchIndex(0);
        setIsSearchDropdownOpen(results.length > 0);
      } catch (_) {
      } finally {
        setIsSearchingMeds(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [medSearchQuery]);

  // Fast Diagnosis Search effect
  useEffect(() => {
    const q = diagSearchQuery.trim();
    if (!q) {
      setDiagSearchResults([]);
      setIsDiagDropdownOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingDiag(true);
      try {
        const results = await api.searchDiagnosisCatalog(q, 25);
        setDiagSearchResults(results);
        setIsDiagDropdownOpen(results.length > 0);
      } catch (_) {
      } finally {
        setIsSearchingDiag(false);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [diagSearchQuery]);

  // Clean up PDF blob URLs on unmount
  useEffect(() => {
    return () => {
      if (previewPdfBlobUrl) {
        URL.revokeObjectURL(previewPdfBlobUrl);
      }
    };
  }, [previewPdfBlobUrl]);

  const handleSelectDiagnosisResult = (item: T.DiagnosisCatalog) => {
    const alreadyAttached = diagnoses.some(
      (d) => d.diagnosis_id === item.id || d.code.toUpperCase() === item.code.toUpperCase()
    );
    if (alreadyAttached) {
      setDiagDuplicateWarning(`"${item.code} - ${item.name}" is already attached to this visit.`);
      setTimeout(() => setDiagDuplicateWarning(null), 3500);
      setIsDiagDropdownOpen(false);
      return;
    }
    setDiagDuplicateWarning(null);
    setSelectedCatalogId(item.id);
    setDiagSearchQuery(`${item.code} — ${item.name}`);
    setIsDiagDropdownOpen(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearchDropdownOpen || medSearchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSearchIndex((prev) => (prev + 1) % medSearchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSearchIndex((prev) => (prev - 1 + medSearchResults.length) % medSearchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (medSearchResults[selectedSearchIndex]) {
        handleSelectMedicine(medSearchResults[selectedSearchIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsSearchDropdownOpen(false);
    }
  };

  const handleSelectMedicine = (med: T.MedicineSearchResult) => {
    const topRef = med.references?.[0];
    const nameDisplay = med.name_hi ? `${med.name} (${med.name_hi})` : med.name;

    const newItem = {
      medicine_id: med.id,
      medicine_name_snapshot: nameDisplay,
      dosage_text: topRef?.dose || (med.form ? `1 ${med.form}` : '1 dose'),
      frequency_text: topRef?.frequency || 'Twice daily',
      duration_text: topRef?.duration_context || '14 Days',
      anupana_text: topRef?.anupana || 'Warm water',
      pathya_text: '',
      apathya_text: '',
      source_type: 'DOCTOR_ADDED' as const,
    };

    setRxItems((prev) => [...prev, newItem]);
    setMedSearchQuery('');
    setMedSearchResults([]);
    setIsSearchDropdownOpen(false);
  };

  // Load Consultation Workspace
  const loadWorkspace = async () => {
    setIsLoading(true);
    try {
      const res = await api.getConsultationWorkspace(visitId);
      setData(res);

      if (res.visit_detail.complaints_list && res.visit_detail.complaints_list.length > 0) {
        setComplaintsList(
          res.visit_detail.complaints_list.map((c) => ({
            id: c.id,
            complaint_text: c.complaint_text,
            duration_value: c.duration_value != null ? c.duration_value : '',
            duration_unit: c.duration_unit || 'Days',
            notes: c.notes || '',
          }))
        );
        setChiefComplaint(res.visit_detail.complaints?.chief_complaint || '');
      } else if (res.visit_detail.complaints) {
        setChiefComplaint(res.visit_detail.complaints.chief_complaint || '');
        if (res.visit_detail.complaints.chief_complaint) {
          setComplaintsList([
            {
              complaint_text: res.visit_detail.complaints.chief_complaint,
              duration_value: '',
              duration_unit: 'Days',
              notes: '',
            },
          ]);
        }
      }

      if (res.visit_detail.complaints) {
        setHistoryText(res.visit_detail.complaints.history_text || '');
        setPastHistory(res.visit_detail.complaints.past_history || '');
        setFamilyHistory(res.visit_detail.complaints.family_history || '');
        setPersonalHistory(res.visit_detail.complaints.personal_history || '');
      }

      if (res.visit_detail.ayush_case) {
        try {
          const parsed = JSON.parse(res.visit_detail.ayush_case.data_json);
          if (parsed.prakriti) setPrakriti(parsed.prakriti);
          if (parsed.nadi) setNadi(parsed.nadi);
          if (parsed.agni) setAgni(parsed.agni);
          if (parsed.koshtha) setKoshtha(parsed.koshtha);
          if (parsed.notes) setCustomAyushNotes(parsed.notes);
        } catch (_) {}
      }

      if (res.prescription) {
        setRxItems(
          res.prescription.items.map((i) => ({
            medicine_id: i.medicine_id,
            medicine_name_snapshot: i.medicine_name_snapshot,
            dosage_text: i.dosage_text || '',
            frequency_text: i.frequency_text || '',
            duration_text: i.duration_text || '',
            anupana_text: i.anupana_text || '',
            pathya_text: i.pathya_text,
            apathya_text: i.apathya_text,
            source_type: i.source_type as any,
            rule_id: i.rule_id,
            rule_version: i.rule_version,
          }))
        );
      }

      // Check if primary diagnosis exists to query validated assistance
      if (res.diagnoses.length > 0) {
        fetchAssistance(res.diagnoses[0].diagnosis_id);
      }
    } catch (err: any) {
      setSaveStatus('error');
      setSaveError(err.message || 'Failed to load consultation encounter from SIXSENSE Server');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCatalog = async () => {
    try {
      const [diagList, medList] = await Promise.all([
        api.listDiagnosisCatalog(),
        api.listMedicines(),
      ]);
      setCatalog(diagList);
      if (diagList.length > 0) setSelectedCatalogId(diagList[0].id);
      setMasterMedicines(medList.filter((m) => m.status === 'ACTIVE'));
    } catch (_) {}
  };

  useEffect(() => {
    loadWorkspace();
    loadCatalog();
  }, [visitId]);

  // Focus management on tab change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'notes') {
        notesInputRef.current?.focus();
      } else if (activeTab === 'ayush') {
        ayushSelectRef.current?.focus();
      } else if (activeTab === 'diagnosis') {
        diagSelectRef.current?.focus();
      } else if (activeTab === 'prescription') {
        rxAddBtnRef.current?.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const fetchAssistance = async (diagnosisId: string) => {
    setIsLoadingAssistance(true);
    try {
      const res = await api.getValidatedAssistance(diagnosisId);
      setValidatedAssistance(res);
    } catch (_) {
      setValidatedAssistance(null);
    } finally {
      setIsLoadingAssistance(false);
    }
  };

  const handleSearchSimilarCases = async (q?: string) => {
    setIsLoadingSimilarCases(true);
    try {
      const queryToUse = q !== undefined ? q : (similarSearchQuery || chiefComplaint);
      const res = await api.searchSimilarCases({
        workspace_id: user?.workspace_id,
        query: queryToUse,
        exclude_visit_id: visitId,
      });
      setSimilarCases(res);
    } catch (err) {
      console.error('Failed to search similar cases', err);
    } finally {
      setIsLoadingSimilarCases(false);
    }
  };

  const handleLoadAnalytics = async () => {
    setIsLoadingAnalytics(true);
    try {
      const res = await api.getPatternAnalytics(user?.workspace_id);
      setObservationalAnalytics(res);
    } catch (err) {
      console.error('Failed to fetch pattern analytics', err);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  // 1. SAVE CLINICAL NOTES (Returns boolean, confirms persistence)
  const handleSaveNotes = async (): Promise<boolean> => {
    if (saveStatus === 'saving') return false;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const ayushJson = JSON.stringify({
        prakriti,
        nadi,
        agni,
        koshtha,
        notes: customAyushNotes,
      });

      // Validate that complaints have valid positive duration values if text is entered
      for (let i = 0; i < complaintsList.length; i++) {
        const c = complaintsList[i];
        if (c.complaint_text.trim()) {
          const num = Number(c.duration_value);
          if (c.duration_value === '' || isNaN(num) || num <= 0) {
            setSaveStatus('error');
            setSaveError(`Complaint #${i + 1} ("${c.complaint_text.trim()}") requires a valid positive duration value.`);
            return false;
          }
        }
      }

      const activeComplaints = complaintsList.filter((c) => c.complaint_text.trim());
      const summaryText = buildComplaintSummary(complaintsList);

      await api.saveClinicalNotes(visitId, {
        chief_complaint: summaryText || undefined,
        complaints_list: activeComplaints.map((c, idx) => ({
          complaint_text: c.complaint_text.trim(),
          duration_value:
            c.duration_value !== '' && !isNaN(Number(c.duration_value))
              ? Number(c.duration_value)
              : null,
          duration_unit: c.duration_unit || 'Days',
          notes: c.notes?.trim() || null,
          sort_order: idx,
        })),
        history_text: historyText.trim() || undefined,
        past_history: pastHistory.trim() || undefined,
        family_history: familyHistory.trim() || undefined,
        personal_history: personalHistory.trim() || undefined,
        ayush_data_json: ayushJson,
        schema_version: 'v1.0-draft',
      });

      setSaveStatus('saved');
      const now = new Date();
      setSaveTimestamp(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      return true;
    } catch (err: any) {
      setSaveStatus('error');
      setSaveError(err.message || 'Failed to persist clinical notes to SIXSENSE Server');
      return false;
    }
  };

  // 2. SAVE PRESCRIPTION DRAFT (Returns boolean, confirms persistence)
  const handleSaveRxDraft = async (): Promise<boolean> => {
    if (saveStatus === 'saving') return false;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await api.savePrescriptionDraft(visitId, {
        source_rule_id: validatedAssistance?.has_validated_rule
          ? (validatedAssistance.rule_id?.trim() || undefined)
          : undefined,
        source_rule_version: validatedAssistance?.has_validated_rule
          ? validatedAssistance.version
          : undefined,
        items: rxItems.map((item) => ({
          medicine_id: item.medicine_id?.trim() || undefined,
          medicine_name_snapshot: item.medicine_name_snapshot?.trim() || 'Prescribed formulation',
          dosage_text: item.dosage_text?.trim() || undefined,
          frequency_text: item.frequency_text?.trim() || undefined,
          duration_text: item.duration_text?.trim() || undefined,
          anupana_text: item.anupana_text?.trim() || undefined,
          pathya_text: item.pathya_text?.trim() || undefined,
          apathya_text: item.apathya_text?.trim() || undefined,
          source_type: item.source_type === 'RULE_SUGGESTION' && item.rule_id ? 'RULE_SUGGESTION' : 'DOCTOR_ADDED',
          rule_id: item.rule_id?.trim() || undefined,
          rule_version: item.rule_version,
        })),
      });

      setSaveStatus('saved');
      const now = new Date();
      setSaveTimestamp(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      await loadWorkspace();
      return true;
    } catch (err: any) {
      setSaveStatus('error');
      setSaveError(err.message || 'Failed to persist prescription draft to SIXSENSE Server');
      return false;
    }
  };

  // Generic Save Active Form (used by Ctrl+S)
  const handleSaveActiveForm = async (): Promise<boolean> => {
    if (activeTab === 'notes' || activeTab === 'ayush') {
      return handleSaveNotes();
    } else if (activeTab === 'prescription') {
      return handleSaveRxDraft();
    }
    return true;
  };

  // Save -> Next Navigation Flows
  const handleSaveAndProceedToAyush = async () => {
    const success = await handleSaveNotes();
    if (success) {
      setActiveTab('ayush');
    }
  };

  const handleSaveAndProceedToDiagnosis = async () => {
    const success = await handleSaveNotes();
    if (success) {
      setActiveTab('diagnosis');
    }
  };

  const handleProceedToPrescription = () => {
    setActiveTab('prescription');
  };

  const handleAttachDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatalogId) {
      setDiagDuplicateWarning('Please select a condition from the search results or catalog.');
      setTimeout(() => setDiagDuplicateWarning(null), 3000);
      return;
    }

    const alreadyAttached = diagnoses.some((d) => d.diagnosis_id === selectedCatalogId);
    if (alreadyAttached) {
      setDiagDuplicateWarning('This diagnosis is already attached to this visit.');
      setTimeout(() => setDiagDuplicateWarning(null), 3500);
      return;
    }

    try {
      const attached = await api.attachDiagnosis(visitId, selectedCatalogId, diagNotes.trim() || undefined);
      setDiagNotes('');
      setDiagSearchQuery('');
      setDiagDuplicateWarning(null);
      fetchAssistance(attached.diagnosis_id);
      loadWorkspace();
    } catch (err: any) {
      setDiagDuplicateWarning(err.message || 'Failed to attach diagnosis');
    }
  };

  const handleRemoveDiagnosis = async (diagId: string) => {
    try {
      await api.removeDiagnosis(visitId, diagId);
      setValidatedAssistance(null);
      loadWorkspace();
    } catch (err: any) {
      alert(err.message || 'Failed to remove diagnosis');
    }
  };

  const handleApplyValidatedAssistance = () => {
    if (!validatedAssistance || !validatedAssistance.has_validated_rule) return;

    const newItems = validatedAssistance.items.map((item) => {
      const med = masterMedicines.find(
        (m) => m.id === item.medicine_id || m.name.toLowerCase() === item.medicine_name.toLowerCase()
      );
      const bName =
        med?.name_hi && !item.medicine_name.includes(med.name_hi)
          ? `${item.medicine_name} (${med.name_hi})`
          : item.medicine_name;

      return {
        medicine_id: item.medicine_id,
        medicine_name_snapshot: bName,
        dosage_text: item.dosage_text || '',
        frequency_text: item.frequency_text || '',
        duration_text: item.duration_text || '',
        anupana_text: validatedAssistance.anupana || '',
        pathya_text: validatedAssistance.pathya,
        apathya_text: validatedAssistance.apathya,
        source_type: 'RULE_SUGGESTION' as const,
        rule_id: validatedAssistance.rule_id,
        rule_version: validatedAssistance.version,
      };
    });

    setRxItems((prev) => [...prev, ...newItems]);
    setActiveTab('prescription');
  };

  const handleAddDoctorItem = () => {
    setRxItems((prev) => [
      ...prev,
      {
        medicine_name_snapshot: '',
        dosage_text: '',
        frequency_text: 'Twice daily',
        duration_text: '7 days',
        anupana_text: 'Warm water',
        source_type: 'DOCTOR_ADDED',
      },
    ]);
  };

  // SAVE-FIRST RULE ON FINALIZATION
  const handleFinalizePrescription = async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    setSaveError(null);
    try {
      // 1. Enforce SAVE-FIRST: Must successfully persist notes and prescription before finalization
      const notesSaved = await handleSaveNotes();
      if (!notesSaved) {
        throw new Error('Clinical notes could not be saved to server. Finalization cancelled to protect clinical integrity.');
      }

      const rxSaved = await handleSaveRxDraft();
      if (!rxSaved) {
        throw new Error('Prescription items could not be saved to server. Finalization cancelled to protect clinical integrity.');
      }

      // 2. Finalize prescription on SIXSENSE Server
      await api.finalizePrescription(visitId);
      setIsFinalizeModalOpen(false);
      await loadWorkspace();

      // 3. Automatically generate sealed clinical document
      await handleGenerateDocument();
    } catch (err: any) {
      setSaveStatus('error');
      setSaveError(err.message || 'Failed to finalize prescription');
    } finally {
      setIsFinalizing(false);
    }
  };

  // Sealed Document Generation
  const handleGenerateDocument = async (): Promise<T.Document | null> => {
    setIsGeneratingDoc(true);
    setDocError(null);
    try {
      if (data?.prescription?.prescription.status === 'FINALIZED') {
        try {
          await api.generatePrescription(visitId);
        } catch (_) {}
      }
      const doc = await api.generateCaseSheet(visitId);
      setGeneratedDoc(doc);
      return doc;
    } catch (err: any) {
      setDocError(err.message || 'PDF / Document generation failed. Your clinical data remains safely saved.');
      return null;
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  // View Clinical Document (PDF) in Modal
  const handleViewPrescription = async () => {
    setIsLoadingPreview(true);
    setPreviewDocModalOpen(true);
    setPrintError(null);
    try {
      let doc = generatedDoc;
      if (!doc) {
        doc = await handleGenerateDocument();
      }
      if (doc) {
        if (previewPdfBlobUrl) {
          URL.revokeObjectURL(previewPdfBlobUrl);
        }
        let blobUrl: string;
        try {
          blobUrl = await api.getDocumentHtmlBlobUrl(doc.id);
        } catch {
          blobUrl = await api.getDocumentPdfBlobUrl(doc.id);
        }
        setPreviewPdfBlobUrl(blobUrl);
      }
    } catch (err: any) {
      setPrintError(err.message || 'Failed to load prescription document.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleClosePreviewModal = () => {
    setPreviewDocModalOpen(false);
    if (previewPdfBlobUrl) {
      URL.revokeObjectURL(previewPdfBlobUrl);
      setPreviewPdfBlobUrl(null);
    }
  };

  // Native System Desktop Print Dialog
  const handlePrintPrescription = async () => {
    setPrintError(null);
    try {
      if (printFrameRef.current?.contentWindow) {
        printFrameRef.current.contentWindow.focus();
        printFrameRef.current.contentWindow.print();
        return;
      }

      let doc = generatedDoc;
      if (!doc) {
        doc = await handleGenerateDocument();
      }

      if (!doc) {
        throw new Error('Clinical document could not be generated.');
      }

      let blobUrl = previewPdfBlobUrl;
      if (!blobUrl) {
        try {
          blobUrl = await api.getDocumentHtmlBlobUrl(doc.id);
        } catch {
          blobUrl = await api.getDocumentPdfBlobUrl(doc.id);
        }
        setPreviewPdfBlobUrl(blobUrl);
      }

      setPreviewDocModalOpen(true);
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

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S: Save current form
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveActiveForm();
      }

      // Ctrl+P / Cmd+P: Print finalized prescription
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        const isFin = data?.prescription?.prescription.status === 'FINALIZED';
        if (isFin) {
          e.preventDefault();
          handlePrintPrescription();
        }
      }

      // Esc: Close any modal
      if (e.key === 'Escape') {
        if (previewDocModalOpen) setPreviewDocModalOpen(false);
        if (isFinalizeModalOpen) setIsFinalizeModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, chiefComplaint, historyText, pastHistory, familyHistory, personalHistory, prakriti, nadi, agni, koshtha, customAyushNotes, rxItems, data, previewDocModalOpen, isFinalizeModalOpen]);

  if (isLoading) {
    return (
      <div className="p-12 text-center text-charcoal-muted text-sm flex items-center justify-center space-x-2">
        <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
        <span>Loading clinical encounter from SIXSENSE Server...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] bg-surface-base p-6">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-charcoal-primary mb-2">
            Unable to Load Consultation Encounter
          </h3>
          <p className="text-xs text-charcoal-muted mb-6 leading-relaxed">
            {saveError || 'Could not retrieve encounter data from the SIXSENSE server. The visit may have been transferred, cancelled, or the server connection was interrupted.'}
          </p>
          <div className="flex items-center justify-center space-x-3">
            <button
              type="button"
              onClick={onBack}
              className="btn-secondary text-xs py-2 px-4"
            >
              Back to Queue
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                loadWorkspace();
              }}
              className="btn-primary text-xs py-2 px-4 flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Connection</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { visit_detail, diagnoses, prescription } = data;
  const isFinalized = prescription?.prescription.status === 'FINALIZED';

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-surface-base select-none focus:outline-none">
      {/* Hidden iframe for native desktop system printing */}
      <iframe
        ref={printFrameRef}
        title="print_frame_consultation"
        className="hidden"
        style={{ position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 }}
      />

      {/* Top Context Header: Sticky Patient Profile, Vitals & Global Actions */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={onBack}
            className="btn-ghost text-xs py-1 px-2 flex items-center space-x-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Queue</span>
          </button>

          <div className="h-6 w-px bg-gray-200" />

          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-charcoal">{visit_detail.patient_name}</span>
              <span className="text-xs font-mono bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                Patient Code: {visit_detail.patient_code}
              </span>
              <span className="text-xs text-charcoal-muted">
                Current Visit: <strong>
                  {visit_detail.visit.patient_visit_seq != null
                    ? `Visit No. ${String(visit_detail.visit.patient_visit_seq).padStart(2, '0')}`
                    : visit_detail.visit.visit_number}
                </strong>
              </span>
              {visit_detail.visit.opd_number && (
                <span className="font-mono text-[11px] text-charcoal-muted bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                  OPD: {visit_detail.visit.opd_number}
                </span>
              )}
              {isFinalized && (
                <span className="inline-flex items-center text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  Locked &amp; Finalized
                </span>
              )}
            </div>
            <div className="text-[11px] text-charcoal-muted flex items-center space-x-3 mt-0.5">
              <span>Purpose: {visit_detail.visit.purpose || 'General Consultation'}</span>
              <span>• Consent: {visit_detail.consent?.consent_status || 'GIVEN'}</span>
              {visit_detail.vitals && (
                <span className="text-brand-medium font-medium">
                  • BP: {visit_detail.vitals.systolic_bp || '-'}/{visit_detail.vitals.diastolic_bp || '-'} mmHg |
                  Pulse: {visit_detail.vitals.pulse_rate || '-'} bpm | Temp: {visit_detail.vitals.temperature || '-'}°F |
                  SpO2: {visit_detail.vitals.oxygen_saturation || '-'}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Global Save / Finalize / Print Actions */}
        <div className="flex items-center space-x-3">
          {/* Save Status UX */}
          {saveStatus === 'saving' && (
            <span className="text-xs font-medium text-brand-medium flex items-center">
              <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
              Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Saved {saveTimestamp && `(${saveTimestamp})`}
            </span>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 flex items-center">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                Save failed
              </span>
              <button
                type="button"
                onClick={handleSaveActiveForm}
                className="btn-secondary text-[11px] py-0.5 px-2"
              >
                Retry
              </button>
            </div>
          )}

          {!isFinalized && (
            <>
              <button
                type="button"
                onClick={handleSaveActiveForm}
                disabled={saveStatus === 'saving'}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1"
                title="Shortcut: Ctrl+S"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Draft (Ctrl+S)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFinalizeModalOpen(true)}
                className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Finalize Prescription</span>
              </button>
            </>
          )}

          {/* First-Class Finalized Actions: [View Prescription] [Print Prescription] */}
          {isFinalized && (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleViewPrescription}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1"
              >
                <Eye className="w-3.5 h-3.5 text-charcoal-muted" />
                <span>View Prescription</span>
              </button>
              <button
                type="button"
                onClick={handlePrintPrescription}
                disabled={isGeneratingDoc}
                className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1 shadow-sm"
                title="Shortcut: Ctrl+P"
              >
                {isGeneratingDoc ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Printer className="w-3.5 h-3.5" />
                )}
                <span>Print Prescription (Ctrl+P)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs (Arrow Key Navigable) */}
      <div
        role="tablist"
        aria-label="Clinical workflow sections"
        className="bg-white border-b border-gray-200 px-6 flex items-center space-x-6 text-xs font-semibold text-charcoal-muted shrink-0"
        onKeyDown={(e) => {
          const tabs: Array<'notes' | 'ayush' | 'diagnosis' | 'prescription' | 'intelligence'> = [
            'notes',
            'ayush',
            'diagnosis',
            'prescription',
            'intelligence',
          ];
          const curIdx = tabs.indexOf(activeTab);
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            const nextIdx = (curIdx + 1) % tabs.length;
            setActiveTab(tabs[nextIdx]);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const prevIdx = (curIdx - 1 + tabs.length) % tabs.length;
            setActiveTab(tabs[prevIdx]);
          }
        }}
      >
        <button
          role="tab"
          aria-selected={activeTab === 'notes'}
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`py-2.5 border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
            activeTab === 'notes'
              ? 'border-brand-primary text-brand-primary font-bold'
              : 'border-transparent hover:text-charcoal'
          }`}
        >
          1. Complaints &amp; History
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'ayush'}
          type="button"
          onClick={() => setActiveTab('ayush')}
          className={`py-2.5 border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
            activeTab === 'ayush'
              ? 'border-brand-primary text-brand-primary font-bold'
              : 'border-transparent hover:text-charcoal'
          }`}
        >
          2. AYUSH Case Taking
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'diagnosis'}
          type="button"
          onClick={() => setActiveTab('diagnosis')}
          className={`py-2.5 border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
            activeTab === 'diagnosis'
              ? 'border-brand-primary text-brand-primary font-bold'
              : 'border-transparent hover:text-charcoal'
          }`}
        >
          3. Diagnosis &amp; Validated Assistance ({diagnoses.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'prescription'}
          type="button"
          onClick={() => setActiveTab('prescription')}
          className={`py-2.5 border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
            activeTab === 'prescription'
              ? 'border-brand-primary text-brand-primary font-bold'
              : 'border-transparent hover:text-charcoal'
          }`}
        >
          4. Prescription Builder ({rxItems.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'intelligence'}
          type="button"
          onClick={() => {
            setActiveTab('intelligence');
            if (similarCases.length === 0) handleSearchSimilarCases();
            if (!observationalAnalytics) handleLoadAnalytics();
          }}
          className={`py-2.5 border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
            activeTab === 'intelligence'
              ? 'border-brand-primary text-brand-primary font-bold'
              : 'border-transparent hover:text-charcoal'
          }`}
        >
          5. Historical Memory &amp; Patterns
        </button>
      </div>

      {/* Main Form Content Area */}
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
        {/* Error notification for save failures */}
        {saveError && (
          <div className="p-3 bg-red-50 text-red-900 border border-red-200 rounded-md text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{saveError}</span>
            </div>
            <button
              type="button"
              onClick={handleSaveActiveForm}
              className="btn-secondary text-xs py-1 px-2.5"
            >
              Retry Save
            </button>
          </div>
        )}

        {/* Print Error Notification with Safe Retry */}
        {printError && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-md text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Notice:</strong> {printError}
              </span>
            </div>
            <button
              type="button"
              onClick={handlePrintPrescription}
              className="btn-secondary text-xs py-1 px-3"
            >
              Retry Print
            </button>
          </div>
        )}

        {/* Document Generation Error Notification with Safe Retry */}
        {docError && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-md text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Record saved.</strong> PDF generation encountered an issue. Saved clinical data remains intact.
              </span>
            </div>
            <button
              type="button"
              onClick={handleGenerateDocument}
              disabled={isGeneratingDoc}
              className="btn-secondary text-xs py-1 px-3"
            >
              Retry Document Generation
            </button>
          </div>
        )}

        {/* Generated Document Banner */}
        {generatedDoc && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-md text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2 text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <strong>Case Sheet Generated Successfully.</strong>
                <div className="text-[11px] text-emerald-700 font-mono">
                  SHA-256: {generatedDoc.file_hash?.substring(0, 24)}...
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleViewPrescription}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1"
              >
                <Eye className="w-3.5 h-3.5 text-charcoal-muted" />
                <span>View</span>
              </button>
              <button
                type="button"
                onClick={handlePrintPrescription}
                className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Complaints & History */}
        {activeTab === 'notes' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 shadow-xs">
            <div className="border-b border-gray-100 pb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-charcoal">Patient Complaints &amp; Clinical History</h3>
                <p className="text-xs text-charcoal-muted">Record primary clinical complaints and background.</p>
              </div>
              {!isFinalized && (
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="btn-secondary text-xs py-1 px-2.5"
                >
                  Save Notes (Ctrl+S)
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-charcoal">
                    Chief Complaints &amp; Durations (Pradhana Vedana) *
                  </label>
                  <p className="text-[11px] text-charcoal-muted">
                    Record each distinct symptom with its specific onset/duration.
                  </p>
                </div>
                {chiefComplaint.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('intelligence');
                      handleSearchSimilarCases(chiefComplaint);
                    }}
                    className="text-[11px] text-brand-primary font-medium hover:underline flex items-center space-x-1"
                  >
                    <span>Search Past Similar Cases →</span>
                  </button>
                )}
              </div>

              {/* Quick Suggestion Chips */}
              {!isFinalized && (
                <div className="space-y-1.5 bg-canvas-subtle p-2.5 rounded-md border border-gray-200">
                  <div className="text-[10px] font-bold text-charcoal-muted uppercase tracking-wider">
                    Quick Clinical Complaint Chips (Click to append)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COMPLAINT_SUGGESTIONS.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAddComplaintSuggestion(chip)}
                        className="text-[11px] px-2.5 py-0.5 rounded-full bg-white border border-gray-300 text-charcoal hover:border-brand-primary hover:text-brand-primary hover:bg-brand-light/30 transition-colors shadow-2xs"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Repeatable Complaints Table / Rows */}
              <div className="space-y-2">
                {complaintsList.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-gray-50/70 border border-gray-200 rounded-md space-y-2 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-mono font-bold text-brand-primary w-6 shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="flex-1">
                        <input
                          ref={idx === 0 ? notesInputRef : undefined}
                          type="text"
                          disabled={isFinalized}
                          value={item.complaint_text}
                          onChange={(e) => handleComplaintChange(idx, 'complaint_text', e.target.value)}
                          placeholder="Complaint (e.g. Shoola in Janu Sandhi, Kasa, Jwara)"
                          className="input-base text-xs font-semibold"
                        />
                      </div>
                      <div className="w-20 shrink-0">
                        <input
                          type="number"
                          min="1"
                          disabled={isFinalized}
                          value={item.duration_value}
                          onChange={(e) => handleComplaintChange(idx, 'duration_value', e.target.value)}
                          placeholder="Duration"
                          className="input-base text-xs font-mono text-center"
                        />
                      </div>
                      <div className="w-28 shrink-0">
                        <select
                          disabled={isFinalized}
                          value={item.duration_unit}
                          onChange={(e) => handleComplaintChange(idx, 'duration_unit', e.target.value)}
                          className="input-base text-xs font-medium"
                        >
                          <option value="Hours">Hours</option>
                          <option value="Days">Days</option>
                          <option value="Weeks">Weeks</option>
                          <option value="Months">Months</option>
                          <option value="Years">Years</option>
                        </select>
                      </div>
                      {!isFinalized && complaintsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveComplaint(idx)}
                          className="text-gray-400 hover:text-rose-600 p-1.5 rounded transition-colors"
                          title="Remove this complaint"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        disabled={isFinalized}
                        value={item.notes}
                        onChange={(e) => handleComplaintChange(idx, 'notes', e.target.value)}
                        placeholder="Optional characteristics (e.g. aggravated in morning or cold weather, sharp pain)"
                        className="input-base text-[11px] text-charcoal-muted bg-white"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {!isFinalized && (
                <button
                  type="button"
                  onClick={handleAddComplaint}
                  className="btn-secondary text-xs py-1 px-3 flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Chief Complaint</span>
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                History of Present Illness (Roga Vrittanta)
              </label>
              <textarea
                disabled={isFinalized}
                rows={3}
                value={historyText}
                onChange={(e) => setHistoryText(e.target.value)}
                placeholder="Onset, progression, aggravating/relieving factors..."
                className="input-base text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">Past History</label>
                <textarea
                  disabled={isFinalized}
                  rows={2}
                  value={pastHistory}
                  onChange={(e) => setPastHistory(e.target.value)}
                  placeholder="Previous illnesses, surgeries, allergies"
                  className="input-base text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">Family History</label>
                <textarea
                  disabled={isFinalized}
                  rows={2}
                  value={familyHistory}
                  onChange={(e) => setFamilyHistory(e.target.value)}
                  placeholder="Familial predisposition"
                  className="input-base text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">Personal / Diet History</label>
                <textarea
                  disabled={isFinalized}
                  rows={2}
                  value={personalHistory}
                  onChange={(e) => setPersonalHistory(e.target.value)}
                  placeholder="Dietary habits, sleep pattern, bowel"
                  className="input-base text-xs"
                />
              </div>
            </div>

            {/* SAVE -> NEXT Bottom Action */}
            {!isFinalized && (
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSaveAndProceedToAyush}
                  className="btn-primary text-xs py-2 px-4 flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Save &amp; Continue to AYUSH Case Taking</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: AYUSH Case Taking */}
        {activeTab === 'ayush' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 shadow-xs">
            <div className="border-b border-gray-100 pb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-charcoal">AYUSH Case Taking Examination</h3>
                <p className="text-xs text-charcoal-muted">
                  Structured container stored as validated JSON with schema versioning.
                </p>
              </div>
              {!isFinalized && (
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="btn-secondary text-xs py-1 px-2.5"
                >
                  Save AYUSH Notes (Ctrl+S)
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">Prakriti (Constitutional Assessment)</label>
                <select
                  ref={ayushSelectRef}
                  disabled={isFinalized}
                  value={prakriti}
                  onChange={(e) => setPrakriti(e.target.value)}
                  className="input-base text-xs font-medium"
                >
                  <option value="Vata-Pitta">Vata-Pitta</option>
                  <option value="Pitta-Kapha">Pitta-Kapha</option>
                  <option value="Kapha-Vata">Kapha-Vata</option>
                  <option value="Tridoshaja">Tridoshaja</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">Nadi (Pulse Examination)</label>
                <input
                  type="text"
                  disabled={isFinalized}
                  value={nadi}
                  onChange={(e) => setNadi(e.target.value)}
                  placeholder="e.g. Manduka (Frog-like movement)"
                  className="input-base text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">Agni (Digestive Fire)</label>
                <select
                  disabled={isFinalized}
                  value={agni}
                  onChange={(e) => setAgni(e.target.value)}
                  className="input-base text-xs"
                >
                  <option value="Samagni">Samagni (Balanced)</option>
                  <option value="Vishamagni">Vishamagni (Irregular / Vata)</option>
                  <option value="Tikshnagni">Tikshnagni (Sharp / Pitta)</option>
                  <option value="Mandagni">Mandagni (Sluggish / Kapha)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">Koshtha (Bowel Habit)</label>
                <select
                  disabled={isFinalized}
                  value={koshtha}
                  onChange={(e) => setKoshtha(e.target.value)}
                  className="input-base text-xs"
                >
                  <option value="Madhyama">Madhyama (Normal)</option>
                  <option value="Krura">Krura (Hard / Constipated)</option>
                  <option value="Mridu">Mridu (Soft / Lax)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                Clinical Observations &amp; Ashtavidha / Dashavidha Notes
              </label>
              <textarea
                disabled={isFinalized}
                rows={3}
                value={customAyushNotes}
                onChange={(e) => setCustomAyushNotes(e.target.value)}
                placeholder="Additional observational notes, tongue (jihva), voice (shabda), eyes (drik)..."
                className="input-base text-xs"
              />
            </div>

            {/* SAVE -> NEXT Bottom Action */}
            {!isFinalized && (
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSaveAndProceedToDiagnosis}
                  className="btn-primary text-xs py-2 px-4 flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Save &amp; Continue to Diagnosis</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Diagnosis & Validated Assistance */}
        {activeTab === 'diagnosis' && (
          <div className="space-y-6">
            {/* Manual Diagnosis Selector */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 shadow-xs">
              <div className="border-b border-gray-100 pb-2">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-charcoal">Doctor's Manual Diagnosis</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                    Physician Controlled
                  </span>
                </div>
                <p className="text-xs text-charcoal-muted mt-0.5">
                  The system does not autonomously diagnose. Select diagnoses from the master catalogue.
                </p>
              </div>

              {!isFinalized && (
                <div className="space-y-4">
                  {/* Diagnosis Search & Suggestions */}
                  <div className="relative">
                    <label className="block text-xs font-semibold text-charcoal mb-1">
                      Search Master Diagnoses (28 BAMS Conditions &amp; CCRAS Catalog) *
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={diagSearchQuery}
                        onChange={(e) => {
                          setDiagSearchQuery(e.target.value);
                          setIsDiagDropdownOpen(true);
                        }}
                        onFocus={() => {
                          if (diagSearchResults.length > 0) setIsDiagDropdownOpen(true);
                        }}
                        placeholder="Type roga name (e.g. Amlapitta, Sandhigata Vata) or NAMC code (e.g. AMP-01)..."
                        className="input-base pl-9 text-xs font-medium"
                      />
                      {isSearchingDiag && (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-primary absolute right-3 top-2.5" />
                      )}
                    </div>

                    {/* Search Results Dropdown */}
                    {isDiagDropdownOpen && diagSearchResults.length > 0 && (
                      <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                        {diagSearchResults.map((item) => {
                          const isAttached = diagnoses.some(
                            (d) => d.diagnosis_id === item.id || d.code.toUpperCase() === item.code.toUpperCase()
                          );
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (!isAttached) {
                                  handleSelectDiagnosisResult(item);
                                }
                              }}
                              className={`p-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                                isAttached
                                  ? 'bg-gray-50 opacity-60 cursor-not-allowed'
                                  : 'hover:bg-brand-light/40'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-brand-light text-brand-primary">
                                    {item.code}
                                  </span>
                                  <span className="font-bold text-charcoal">{item.name}</span>
                                  {isAttached && (
                                    <span className="text-[10px] text-gray-500 font-semibold italic">
                                      (Already Attached)
                                    </span>
                                  )}
                                </div>
                                {item.description && (
                                  <div className="text-[11px] text-charcoal-muted line-clamp-1">
                                    {item.description}
                                  </div>
                                )}
                              </div>
                              {!isAttached && (
                                <span className="text-[11px] text-brand-primary font-bold ml-2 shrink-0">
                                  Select →
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Duplicate warning notice */}
                  {diagDuplicateWarning && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{diagDuplicateWarning}</span>
                    </div>
                  )}

                  {/* Attachment Form (Selected condition + Subtype Notes + Attach Button) */}
                  <form onSubmit={handleAttachDiagnosis} className="flex items-end space-x-3 bg-gray-50/70 p-3 rounded-md border border-gray-200">
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-charcoal mb-1">
                        Selected Master Diagnosis *
                      </label>
                      <select
                        ref={diagSelectRef}
                        value={selectedCatalogId}
                        onChange={(e) => {
                          setSelectedCatalogId(e.target.value);
                          setDiagDuplicateWarning(null);
                        }}
                        className="input-base text-xs font-medium bg-white"
                      >
                        <option value="">-- Choose condition ({catalog.length} available) --</option>
                        {catalog.map((c) => (
                          <option key={c.id} value={c.id}>
                            [{c.code}] {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-charcoal mb-1">
                        Physician's Clinical Subtype / Specific Notes
                      </label>
                      <input
                        type="text"
                        value={diagNotes}
                        onChange={(e) => setDiagNotes(e.target.value)}
                        placeholder="e.g. Vataja Kasa, dry night coughing, Pravriddha stage"
                        className="input-base text-xs bg-white"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!selectedCatalogId}
                      className="btn-primary text-xs py-2 px-3.5 shrink-0 shadow-sm"
                    >
                      + Attach Diagnosis
                    </button>
                  </form>
                </div>
              )}

              {/* List of Attached Diagnoses */}
              <div className="border border-gray-200 rounded-md divide-y divide-gray-100 overflow-hidden">
                {diagnoses.length === 0 ? (
                  <div className="p-4 text-center text-charcoal-muted text-xs">
                    No diagnosis entered yet. Select from the catalogue above.
                  </div>
                ) : (
                  diagnoses.map((d) => (
                    <div
                      key={d.id}
                      className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-brand-primary bg-brand-light px-1.5 py-0.2 rounded">
                            {d.code}
                          </span>
                          <span className="font-bold text-xs text-charcoal">{d.name}</span>
                        </div>
                        {d.diagnosis_text && (
                          <div className="text-[11px] text-charcoal-muted italic pl-1">
                            Notes: {d.diagnosis_text}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => fetchAssistance(d.diagnosis_id)}
                          className="btn-secondary text-[11px] py-1 px-2.5"
                        >
                          Check Guidelines
                        </button>
                        {!isFinalized && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDiagnosis(d.diagnosis_id)}
                            className="text-gray-400 hover:text-red-600 p-1 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Validated Decision Support Panel (Deterministically Bound) */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 shadow-xs">
              <div className="border-b border-gray-100 pb-2 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <FileCheck className="w-4 h-4 text-brand-primary" />
                    <h3 className="text-sm font-bold text-charcoal">
                      Validated Clinical Assistance (Rule Engine)
                    </h3>
                  </div>
                  <p className="text-[11px] text-charcoal-muted mt-0.5">
                    Evaluated server-side from approved clinical rules. Zero AI inference or internet connectivity.
                  </p>
                </div>

                {validatedAssistance?.has_validated_rule && !isFinalized && (
                  <button
                    type="button"
                    onClick={handleApplyValidatedAssistance}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1.5 shadow-sm"
                  >
                    <span>Adopt Suggestions into Prescription</span>
                  </button>
                )}
              </div>

              {isLoadingAssistance ? (
                <div className="p-6 text-center text-xs text-charcoal-muted flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
                  <span>Evaluating clinical rules...</span>
                </div>
              ) : !validatedAssistance ? (
                <div className="p-6 text-center text-xs text-charcoal-muted">
                  Select an attached diagnosis above to query approved clinical assistance rules.
                </div>
              ) : !validatedAssistance.has_validated_rule ? (
                <div className="p-6 text-center bg-gray-50 border border-gray-200 rounded-md space-y-1">
                  <Info className="w-5 h-5 text-gray-400 mx-auto" />
                  <div className="text-xs font-semibold text-charcoal">
                    {validatedAssistance.message || 'No validated recommendation available for this diagnosis.'}
                  </div>
                  <div className="text-[11px] text-charcoal-muted">
                    No approved clinical rule matches diagnosis ({validatedAssistance.diagnosis_name}). Proceed with doctor-controlled prescription.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Provenance Badge */}
                  <div className="flex items-center space-x-3 p-2.5 bg-brand-light rounded-md text-xs">
                    <span className="font-bold text-brand-primary">
                      Rule Provenance: {validatedAssistance.rule_code} (Version {validatedAssistance.version})
                    </span>
                    <span className="text-charcoal-muted">•</span>
                    <span className="text-charcoal-muted">
                      Target: {validatedAssistance.diagnosis_name}
                    </span>
                  </div>

                  {/* Dietary & Vehicle Instructions */}
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-surface-base rounded border border-gray-200">
                      <span className="font-bold text-charcoal block mb-1">Anupana (Vehicle):</span>
                      <span className="text-charcoal-medium">{validatedAssistance.anupana || 'None'}</span>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                      <span className="font-bold text-emerald-900 block mb-1">Pathya (Beneficial Diet):</span>
                      <span className="text-emerald-800">{validatedAssistance.pathya || 'None'}</span>
                    </div>
                    <div className="p-3 bg-rose-50 rounded border border-rose-200">
                      <span className="font-bold text-rose-900 block mb-1">Apathya (Diet to Avoid):</span>
                      <span className="text-rose-800">{validatedAssistance.apathya || 'None'}</span>
                    </div>
                  </div>

                  {/* Recommended Formulation Items */}
                  <div className="border border-gray-200 rounded overflow-hidden">
                    <div className="bg-surface-base px-3 py-2 text-xs font-semibold text-charcoal border-b border-gray-200">
                      Approved Medicine Formulations ({validatedAssistance.items.length})
                    </div>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-white text-charcoal-muted border-b border-gray-200">
                          <th className="py-2 px-3 font-semibold">Medicine Formulation</th>
                          <th className="py-2 px-3 font-semibold">Dosage</th>
                          <th className="py-2 px-3 font-semibold">Frequency</th>
                          <th className="py-2 px-3 font-semibold">Duration</th>
                          <th className="py-2 px-3 font-semibold">Instructions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {validatedAssistance.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="py-2.5 px-3 font-semibold text-charcoal">
                              {item.medicine_name}
                              {(() => {
                                const med = masterMedicines.find(
                                  (m) => m.id === item.medicine_id || m.name.toLowerCase() === item.medicine_name.toLowerCase()
                                );
                                return med?.name_hi ? (
                                  <span className="text-[11px] text-emerald-800 font-serif font-medium ml-1.5">
                                    ({med.name_hi})
                                  </span>
                                ) : null;
                              })()}
                              <span className="text-[11px] text-charcoal-muted ml-1.5">
                                ({item.form || 'Classical'} {item.strength || ''})
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-brand-medium">{item.dosage_text}</td>
                            <td className="py-2.5 px-3">{item.frequency_text}</td>
                            <td className="py-2.5 px-3">{item.duration_text}</td>
                            <td className="py-2.5 px-3 text-charcoal-muted">{item.instructions_text}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* SAVE -> NEXT Bottom Action */}
            {!isFinalized && (
              <div className="pt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleProceedToPrescription}
                  className="btn-primary text-xs py-2 px-4 flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Proceed to Prescription Builder</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Prescription Builder */}
        {activeTab === 'prescription' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 shadow-xs">
            <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-charcoal">Physician's Prescription Builder</h3>
                <p className="text-xs text-charcoal-muted">
                  Doctor maintains final prescribing responsibility. Edit, add, or remove items.
                </p>
              </div>

              {!isFinalized && (
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleViewPrescription}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1 hover:border-brand-primary/50"
                    title="Preview rendered hospital-grade clinical prescription"
                  >
                    <Eye className="w-3.5 h-3.5 text-brand-primary" />
                    <span>Preview Hospital Rx</span>
                  </button>
                  <button
                    ref={rxAddBtnRef}
                    type="button"
                    onClick={handleAddDoctorItem}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Formulation</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveRxDraft}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1 shadow-sm"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Rx Draft (Ctrl+S)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Fast Clinical Medicine Search & Quick Add */}
            {!isFinalized && (
              <div className="relative bg-canvas-subtle p-3 rounded-lg border border-gray-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-charcoal flex items-center space-x-1.5">
                    <Search className="w-3.5 h-3.5 text-brand-primary" />
                    <span>Clinical Medicine Fast Search &amp; Selection</span>
                  </label>
                  <span className="text-[10px] text-gray-500 font-mono">
                    Use ↑ ↓ to navigate, Enter to add, Esc to dismiss
                  </span>
                </div>
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={medSearchQuery}
                    onChange={(e) => {
                      setMedSearchQuery(e.target.value);
                      setIsSearchDropdownOpen(true);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => {
                      if (medSearchResults.length > 0) setIsSearchDropdownOpen(true);
                    }}
                    placeholder="Type English, Hindi, Sanskrit name, or Form (e.g. Sitopaladi, अश्वगंधा, Vati, Yogaraja, Kwatha)..."
                    className="input-base text-xs pr-8 font-medium shadow-2xs bg-white"
                  />
                  {isSearchingMeds && (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-primary absolute right-2.5 top-2.5" />
                  )}
                  {medSearchQuery && !isSearchingMeds && (
                    <button
                      type="button"
                      onClick={() => {
                        setMedSearchQuery('');
                        setMedSearchResults([]);
                        setIsSearchDropdownOpen(false);
                      }}
                      className="text-gray-400 hover:text-gray-600 absolute right-2.5 top-2.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown Results */}
                {isSearchDropdownOpen && medSearchResults.length > 0 && (
                  <div className="absolute left-3 right-3 top-full mt-1 bg-white rounded-md shadow-xl border border-gray-200 z-50 max-h-72 overflow-y-auto divide-y divide-gray-100">
                    {medSearchResults.map((med, idx) => {
                      const isHighlighted = idx === selectedSearchIndex;
                      const topRef = med.references?.[0];
                      return (
                        <div
                          key={med.id}
                          onClick={() => handleSelectMedicine(med)}
                          onMouseEnter={() => setSelectedSearchIndex(idx)}
                          className={`p-2.5 cursor-pointer text-xs transition-colors ${
                            isHighlighted ? 'bg-brand-light/40 border-l-4 border-brand-primary' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-charcoal">{med.name}</span>
                              {med.name_hi && (
                                <span className="font-serif text-emerald-800 font-medium text-[11px]">
                                  ({med.name_hi})
                                </span>
                              )}
                              {med.form && (
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-mono text-[10px]">
                                  {med.form}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-gray-400">{med.code}</span>
                          </div>

                          {topRef && (
                            <div className="mt-1 flex items-center space-x-3 text-[11px] text-gray-600">
                              {topRef.roga_name && (
                                <span>
                                  <strong className="text-charcoal">Indication:</strong> {topRef.roga_name}
                                </span>
                              )}
                              {topRef.dose && (
                                <span>
                                  <strong className="text-charcoal">Dose:</strong> {topRef.dose}
                                </span>
                              )}
                              {topRef.anupana && (
                                <span>
                                  <strong className="text-charcoal">Anupana:</strong> {topRef.anupana}
                                </span>
                              )}
                              <span className="text-[10px] text-brand-primary font-mono ml-auto">
                                [{topRef.source}]
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {rxItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-charcoal-muted space-y-2">
                <div>No items currently in the prescription draft.</div>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={handleAddDoctorItem}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    Add Medicine Manually
                  </button>
                  {validatedAssistance?.has_validated_rule && (
                    <button
                      type="button"
                      onClick={handleApplyValidatedAssistance}
                      className="btn-secondary text-xs py-1.5 px-3"
                    >
                      Adopt Validated Suggestions
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <datalist id="bilingual-medicines-list">
                  {masterMedicines.map((m) => {
                    const label = m.name_hi ? `${m.name} (${m.name_hi})` : m.name;
                    return <option key={m.id} value={label} />;
                  })}
                </datalist>

                {rxItems.map((item, index) => (
                  <div
                    key={index}
                    className="p-3.5 bg-white rounded-lg border border-gray-200 border-l-4 border-l-brand-primary shadow-xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-light text-brand-primary text-xs font-bold font-mono">
                          {index + 1}
                        </span>
                        <span className="font-bold text-xs text-charcoal">
                          {item.medicine_name_snapshot || 'Prescription Item'}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            item.source_type === 'RULE_SUGGESTION'
                              ? 'bg-brand-light text-brand-primary border border-brand-primary/20'
                              : 'bg-gray-100 text-gray-700 border border-gray-200'
                          }`}
                        >
                          {item.source_type === 'RULE_SUGGESTION'
                            ? `Protocol Guided (v${item.rule_version || 1})`
                            : 'Physician Prescribed'}
                        </span>
                      </div>

                      {!isFinalized && (
                        <button
                          type="button"
                          onClick={() => {
                            setRxItems((prev) => prev.filter((_, i) => i !== index));
                          }}
                          className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Remove Formulation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-charcoal mb-0.5">
                          Formulation Name (औषध योग) *
                        </label>
                        <input
                          type="text"
                          list="bilingual-medicines-list"
                          disabled={isFinalized}
                          value={item.medicine_name_snapshot}
                          onChange={(e) => {
                            const val = e.target.value;
                            const matched = masterMedicines.find(
                              (m) =>
                                m.name.toLowerCase() === val.toLowerCase() ||
                                (m.name_hi && `${m.name} (${m.name_hi})`.toLowerCase() === val.toLowerCase()) ||
                                (m.name_hi && m.name_hi === val) ||
                                m.code.toLowerCase() === val.toLowerCase()
                            );
                            setRxItems((prev) =>
                              prev.map((it, i) =>
                                i === index
                                  ? {
                                      ...it,
                                      medicine_id: matched ? matched.id : undefined,
                                      medicine_name_snapshot: val,
                                      dosage_text: it.dosage_text || (matched?.form ? matched.form : ''),
                                    }
                                  : it
                              )
                            );
                          }}
                          placeholder="Select / enter formulation (e.g. Ashwagandha Churna)"
                          className="input-base text-xs font-semibold"
                        />
                        {(() => {
                          const matched = masterMedicines.find(
                            (m) =>
                              m.id === item.medicine_id ||
                              m.name.toLowerCase() === item.medicine_name_snapshot.toLowerCase()
                          );
                          if (matched?.name_hi && !item.medicine_name_snapshot.includes(matched.name_hi)) {
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setRxItems((prev) =>
                                    prev.map((it, i) =>
                                      i === index
                                        ? {
                                            ...it,
                                            medicine_id: matched.id,
                                            medicine_name_snapshot: `${matched.name} (${matched.name_hi})`,
                                          }
                                        : it
                                    )
                                  );
                                }}
                                className="text-[10px] text-emerald-800 font-serif mt-0.5 hover:underline text-left block"
                              >
                                द्विभाषी जोड़ें: {matched.name} ({matched.name_hi})
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-charcoal mb-0.5">
                          Dosage (मात्रा)
                        </label>
                        <input
                          type="text"
                          disabled={isFinalized}
                          value={item.dosage_text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRxItems((prev) =>
                              prev.map((it, i) => (i === index ? { ...it, dosage_text: val } : it))
                            );
                          }}
                          placeholder="e.g. 10 ml / 2 tablets"
                          className="input-base text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-charcoal mb-0.5">
                          Frequency (काल)
                        </label>
                        <input
                          type="text"
                          disabled={isFinalized}
                          value={item.frequency_text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRxItems((prev) =>
                              prev.map((it, i) => (i === index ? { ...it, frequency_text: val } : it))
                            );
                          }}
                          placeholder="e.g. Twice daily (BD)"
                          className="input-base text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-charcoal mb-0.5">
                          Duration (अवधि)
                        </label>
                        <input
                          type="text"
                          disabled={isFinalized}
                          value={item.duration_text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRxItems((prev) =>
                              prev.map((it, i) => (i === index ? { ...it, duration_text: val } : it))
                            );
                          }}
                          placeholder="e.g. 14 Days"
                          className="input-base text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-charcoal mb-0.5">
                        Anupana / Vehicle (अनुपान)
                      </label>
                      <input
                        type="text"
                        disabled={isFinalized}
                        value={item.anupana_text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRxItems((prev) =>
                            prev.map((it, i) => (i === index ? { ...it, anupana_text: val } : it))
                          );
                        }}
                        placeholder="e.g. Lukewarm water / Honey / Warm milk after food"
                        className="input-base text-xs"
                      />
                    </div>

                    {/* Pathya & Apathya Guidance Fields */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[10.5px] font-semibold text-emerald-800 mb-0.5 flex items-center space-x-1">
                          <span>✓ Pathya (पथ्य / Recommended Regimen)</span>
                        </label>
                        <input
                          type="text"
                          disabled={isFinalized}
                          value={item.pathya_text || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRxItems((prev) =>
                              prev.map((it, i) => (i === index ? { ...it, pathya_text: val } : it))
                            );
                          }}
                          placeholder="e.g. Light warm diet, boiled water, moong dal soup"
                          className="input-base text-xs bg-emerald-50/40 border-emerald-200 focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-semibold text-rose-800 mb-0.5 flex items-center space-x-1">
                          <span>✗ Apathya (अपथ्य / Avoid / Contraindications)</span>
                        </label>
                        <input
                          type="text"
                          disabled={isFinalized}
                          value={item.apathya_text || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRxItems((prev) =>
                              prev.map((it, i) => (i === index ? { ...it, apathya_text: val } : it))
                            );
                          }}
                          placeholder="e.g. Cold water, oily/sour foods, curd at night"
                          className="input-base text-xs bg-rose-50/40 border-rose-200 focus:border-rose-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom Actions for Prescription */}
            {!isFinalized && (
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleSaveRxDraft}
                    className="btn-secondary text-xs py-2 px-3 flex items-center space-x-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Draft (Ctrl+S)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleViewPrescription}
                    className="btn-secondary text-xs py-2 px-3 flex items-center space-x-1"
                  >
                    <Eye className="w-3.5 h-3.5 text-brand-primary" />
                    <span>Preview Hospital Rx</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsFinalizeModalOpen(true)}
                  className="btn-primary text-xs py-2 px-4 flex items-center space-x-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Finalize Prescription</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Clinical Memory & Observational Intelligence */}
        {activeTab === 'intelligence' && (
          <div className="space-y-6">
            {/* Safety Guardrail Banner */}
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-md">
              <div className="flex items-start">
                <ShieldCheck className="w-5 h-5 text-amber-700 mr-3 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                    Strict Clinical Safety Protocol — Passive Memory &amp; Observational Analytics Only
                  </h4>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    This clinical memory module operates in strict read-only retrieval mode. It <strong>never</strong> autonomously diagnoses, <strong>never</strong> autonomously prescribes, and <strong>never</strong> modifies validated clinical rules. All historical cases and patterns are observational references requiring independent clinical evaluation by the licensed physician.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 1: Historical Similar Cases (Level 1 Passive Memory) */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 shadow-xs">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-charcoal flex items-center space-x-2">
                    <BookOpen className="w-4 h-4 text-brand-primary" />
                    <span>Level 1 — Historical Similar Cases (Passive Memory)</span>
                  </h3>
                  <p className="text-xs text-charcoal-muted mt-0.5">
                    Search authorized past visits in this department by complaint keywords, diagnoses, or notes.
                  </p>
                </div>
                <div className="text-[11px] font-mono bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded">
                  Workspace Scoped
                </div>
              </div>

              {/* Search bar */}
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={similarSearchQuery}
                    onChange={(e) => setSimilarSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchSimilarCases();
                      }
                    }}
                    placeholder="Search by chief complaint (e.g. cough, fever, kaphaja)..."
                    className="input-base pl-9 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSearchSimilarCases()}
                  disabled={isLoadingSimilarCases}
                  className="btn-primary text-xs py-2 px-4 flex items-center space-x-1.5 shadow-sm"
                >
                  {isLoadingSimilarCases ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Search</span>
                </button>
              </div>

              {/* Cases Results */}
              {isLoadingSimilarCases ? (
                <div className="text-center py-8 text-xs text-charcoal-muted flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
                  <span>Searching historical records...</span>
                </div>
              ) : similarCases.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg text-xs text-charcoal-muted space-y-1">
                  <p className="font-semibold text-charcoal">No matching historical cases found.</p>
                  <p>Try searching with another keyword or click Search with an empty query to view recent cases.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs font-semibold text-charcoal-muted">
                    Found {similarCases.length} historical reference {similarCases.length === 1 ? 'case' : 'cases'}:
                  </div>
                  {similarCases.map((c) => (
                    <div key={c.visit_id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-canvas-subtle hover:border-gray-300 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-charcoal">Visit No. {c.visit_number}</span>
                            <span className="text-[11px] font-mono bg-gray-200 text-charcoal px-1.5 py-0.5 rounded">
                              Patient Code: {c.patient_code}
                            </span>
                            <span className="text-[11px] text-charcoal-muted">{c.visit_date}</span>
                          </div>
                          <div className="text-xs text-charcoal">
                            <span className="font-semibold">Chief Complaint:</span> {c.chief_complaint}
                          </div>
                          {c.diagnoses.length > 0 && (
                            <div className="text-xs text-charcoal">
                              <span className="font-semibold">Diagnoses:</span> {c.diagnoses.join(', ')}
                            </div>
                          )}
                        </div>
                        {c.source_rule_code && (
                          <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">
                            Rule: {c.source_rule_code} (v{c.source_rule_version || 1})
                          </span>
                        )}
                      </div>

                      {/* Prescribed formulations snapshot */}
                      {c.medicines.length > 0 ? (
                        <div className="bg-white rounded border border-gray-200 p-2.5 space-y-1.5">
                          <div className="text-[11px] font-bold text-charcoal-muted uppercase tracking-wider">
                            Formulations Prescribed in this Visit:
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            {c.medicines.map((m, mIdx) => (
                              <div key={mIdx} className="bg-gray-50 p-2 rounded border border-gray-100 flex items-start justify-between">
                                <div>
                                  <div className="font-bold text-charcoal">{m.medicine_name}</div>
                                  <div className="text-[11px] text-charcoal-muted">
                                    {m.dosage || 'Standard dose'} • {m.frequency || 'Daily'} • {m.duration || 'Standard duration'}
                                  </div>
                                </div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-charcoal-muted font-mono">
                                  {m.source_type}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] italic text-charcoal-muted">No formulations recorded for this visit.</div>
                      )}

                      {/* Mandatory Disclaimer Badge */}
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 font-semibold flex items-center space-x-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>{c.disclaimer}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: Observational Pattern Analytics (Level 2 Read-Only Learning) */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 shadow-xs">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-charcoal flex items-center space-x-2">
                    <BarChart2 className="w-4 h-4 text-emerald-700" />
                    <span>Level 2 — Observational Pattern Analytics</span>
                  </h3>
                  <p className="text-xs text-charcoal-muted mt-0.5">
                    Aggregated department trends and clinical correlation patterns across completed visits.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLoadAnalytics}
                  disabled={isLoadingAnalytics}
                  className="btn-secondary text-xs py-1.5 px-3 flex items-center space-x-1"
                >
                  {isLoadingAnalytics ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>Refresh Analytics</span>
                </button>
              </div>

              {isLoadingAnalytics ? (
                <div className="text-center py-8 text-xs text-charcoal-muted flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" />
                  <span>Computing observational patterns...</span>
                </div>
              ) : observationalAnalytics ? (
                <div className="space-y-5">
                  <div className="text-xs text-charcoal-muted">
                    Total Completed Visits Analyzed: <strong className="text-charcoal">{observationalAnalytics.total_analyzed_visits}</strong>
                  </div>

                  {/* 1. Top Complaint Clusters */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-charcoal uppercase tracking-wider">
                      Most Frequent Complaint Clusters
                    </h4>
                    {observationalAnalytics.complaint_clusters.length === 0 ? (
                      <div className="text-xs italic text-charcoal-muted">No recorded complaints data yet.</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {observationalAnalytics.complaint_clusters.map((cl, idx) => (
                          <div key={idx} className="bg-gray-50 border border-gray-200 p-2.5 rounded flex items-center justify-between text-xs">
                            <span className="font-medium text-charcoal capitalize">{cl.complaint}</span>
                            <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-gray-200 text-charcoal">
                              {cl.count} {cl.count === 1 ? 'case' : 'cases'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 2. Top Prescribed Medicines per Diagnosis */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-charcoal uppercase tracking-wider">
                      Most Prescribed Formulations by Diagnosis
                    </h4>
                    {observationalAnalytics.diagnosis_patterns.length === 0 ? (
                      <div className="text-xs italic text-charcoal-muted">No recorded diagnosis prescriptions yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {observationalAnalytics.diagnosis_patterns.map((dp, idx) => (
                          <div key={idx} className="bg-gray-50 border border-gray-200 rounded p-3 text-xs space-y-1.5">
                            <div className="font-bold text-charcoal">{dp.diagnosis_name}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {dp.top_medicines.map((tm, tIdx) => (
                                <span key={tIdx} className="bg-white border border-gray-200 px-2 py-1 rounded text-charcoal flex items-center space-x-1">
                                  <span>{tm.medicine_name}</span>
                                  <span className="text-[10px] text-charcoal-muted font-mono">({tm.count}x)</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Common Co-Prescriptions */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-charcoal uppercase tracking-wider">
                      Common Co-Prescription Pairs
                    </h4>
                    {observationalAnalytics.common_co_prescriptions.length === 0 ? (
                      <div className="text-xs italic text-charcoal-muted">No co-prescription correlations yet.</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {observationalAnalytics.common_co_prescriptions.map((pair, idx) => (
                          <div key={idx} className="bg-gray-50 border border-gray-200 p-2.5 rounded flex items-center justify-between">
                            <span className="font-medium text-charcoal">
                              {pair.medicine_a} + {pair.medicine_b}
                            </span>
                            <span className="font-mono text-charcoal-muted text-[11px]">
                              {pair.count} times
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Mandatory Analytics Disclaimer */}
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 font-medium flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>{observationalAnalytics.disclaimer}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-charcoal-muted">
                  Click &ldquo;Refresh Analytics&rdquo; to compute pattern correlations.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Deliberate Finalization Confirmation (Strict Confirmation Safeguard) */}
      <Modal
        isOpen={isFinalizeModalOpen}
        onClose={() => setIsFinalizeModalOpen(false)}
        title="Finalize Clinical Encounter &amp; Lock Prescription"
        subtitle="This action commits and legally locks the prescription. Server-side persistence is confirmed."
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-md text-xs text-amber-900 space-y-1">
            <div className="font-bold flex items-center">
              <AlertTriangle className="w-4 h-4 mr-1 text-amber-600" />
              Doctor-Controlled Legal Finalization
            </div>
            <p>
              Once finalized, the prescription and clinical notes will be locked against modifications. The visit status transitions to FINALIZED on SIXSENSE Server.
            </p>
          </div>

          <div className="text-xs space-y-1 bg-surface-base p-3 rounded border border-gray-200">
            <div>Patient: <strong>{visit_detail.patient_name}</strong> • Patient Code: <strong className="font-mono">{visit_detail.patient_code}</strong></div>
            <div>Treating Physician: <strong>Dr. {user?.full_name}</strong></div>
            <div>Prescribed Formulations: <strong>{rxItems.length} items</strong></div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsFinalizeModalOpen(false)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Back to Edit
            </button>
            <button
              type="button"
              disabled={isFinalizing}
              onClick={handleFinalizePrescription}
              className="btn-primary text-xs py-1.5 px-3 shadow-sm"
            >
              {isFinalizing ? (
                <span className="flex items-center space-x-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Locking Record...</span>
                </span>
              ) : (
                'Confirm & Finalize Prescription'
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: View Prescription Document Preview */}
      {previewDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-surface-base">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-brand-primary" />
                <h3 className="text-sm font-bold text-charcoal">
                  Sealed Clinical Prescription Document
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handlePrintPrescription}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1 shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document (Ctrl+P)</span>
                </button>
                <button
                  type="button"
                  onClick={handleClosePreviewModal}
                  className="p-1.5 rounded-md text-charcoal-muted hover:bg-gray-100 hover:text-charcoal transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {isLoadingPreview ? (
                <div className="py-16 text-center text-xs text-charcoal-muted space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-brand-primary" />
                  <div>Loading prescription document (PDF) from SIXSENSE Server...</div>
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
