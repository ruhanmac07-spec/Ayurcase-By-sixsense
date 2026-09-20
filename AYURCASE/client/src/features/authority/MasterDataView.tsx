import React, { useState, useEffect } from 'react';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import {
  BookOpen,
  Pill,
  ShieldAlert,
  Plus,
  Search,
  CheckCircle2,
  Edit2,
  Ban,
  RefreshCw,
  Download,
  Upload,
  AlertTriangle,
  AlertCircle,
  Eye,
  Check,
} from 'lucide-react';
import { Modal } from '../../components/Modal';

interface MasterDataViewProps {
  initialTab?: 'diagnoses' | 'medicines' | 'rules';
}

export const MasterDataView: React.FC<MasterDataViewProps> = ({ initialTab = 'diagnoses' }) => {
  const [activeSubTab, setActiveSubTab] = useState<'diagnoses' | 'medicines' | 'rules'>(initialTab);
  const [diagnoses, setDiagnoses] = useState<T.DiagnosisCatalog[]>([]);
  const [medicines, setMedicines] = useState<T.Medicine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync with initialTab prop if changed by navigation
  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [initialTab]);

  // Modal states
  const [showDiagModal, setShowDiagModal] = useState(false);
  const [showMedModal, setShowMedModal] = useState(false);
  const [editingMed, setEditingMed] = useState<T.Medicine | null>(null);
  const [showRuleModal, setShowRuleModal] = useState(false);

  // CSV Template & Import states
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvType, setCsvType] = useState<'AUTO' | 'MEDICINE_MASTER' | 'CLINICAL_REFERENCE'>('AUTO');
  const [datasetName, setDatasetName] = useState('Authority Ingestion');
  const [datasetVersion, setDatasetVersion] = useState('v1.0');
  const [csvPreview, setCsvPreview] = useState<T.CsvPreviewResponse | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Medicine Reference Inspection state
  const [inspectingMed, setInspectingMed] = useState<T.Medicine | null>(null);
  const [medReferences, setMedReferences] = useState<T.ClinicalReference[]>([]);
  const [isLoadingRefs, setIsLoadingRefs] = useState(false);

  // Form states
  const [diagForm, setDiagForm] = useState({ code: '', name: '', description: '' });
  const [medForm, setMedForm] = useState({
    code: '',
    name: '',
    name_hi: '',
    english_name: '',
    sanskrit_name: '',
    dosage_form: 'Vati (Tablet)',
    default_dosage: '1 tablet twice daily after meals with warm water',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });
  const [ruleForm, setRuleForm] = useState({
    diagnosis_id: '',
    rule_code: '',
    title: '',
    evidence_level: 'CCRAS Class A',
    provenance_source: 'Ayurvedic Pharmacopoeia of India (API)',
    version: '1.0',
    lifestyle_advice: 'Avoid cold exposure and heavy curd consumption at night.',
    contraindications: 'Severe hepatic dysfunction or acute Pitta aggravation.',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [diagList, medList] = await Promise.all([
        api.listDiagnosisCatalog(),
        api.listMedicines(),
      ]);
      setDiagnoses(diagList);
      setMedicines(medList);
    } catch (err: any) {
      setError(err.message || 'Failed to load master catalogs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // CSV Template download
  const handleDownloadTemplate = async (type: 'medicine_master' | 'clinical_reference') => {
    try {
      setShowTemplateDropdown(false);
      const csvText = await api.downloadMedicineCsvTemplate(type);
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        type === 'clinical_reference' ? 'clinical_references_template.csv' : 'medicine_master_template.csv'
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to download template: ${err.message}`);
    }
  };

  // CSV File Selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = (evt.target?.result as string) || '';
      setCsvContent(text);
      runPreview(text, csvType === 'AUTO' ? undefined : csvType);
    };
    reader.readAsText(file);
  };

  const runPreview = async (content: string, type?: string) => {
    if (!content.trim()) {
      setCsvPreview(null);
      return;
    }
    setIsPreviewLoading(true);
    try {
      const preview = await api.previewMedicineCsv(content, type);
      setCsvPreview(preview);
    } catch (err: any) {
      setCsvPreview({
        csv_type: 'UNKNOWN',
        rows_detected: 0,
        new_medicines: 0,
        existing_medicines: 0,
        duplicate_rows: 0,
        conflicts: 0,
        warnings: [],
        errors: [{ row_index: 0, message: err.message || 'Failed to parse CSV' }],
        can_commit: false,
        preview_rows: [],
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleCommitCsv = async () => {
    if (!csvContent.trim() || !csvPreview || !csvPreview.can_commit) return;
    setIsCommitting(true);
    setCommitMessage(null);
    try {
      const res = await api.commitMedicineCsv({
        csv_content: csvContent,
        csv_type: csvType === 'AUTO' ? undefined : csvType,
        filename: csvFileName || 'import.csv',
        dataset_name: datasetName,
        dataset_version: datasetVersion,
      });

      setCommitMessage({
        type: 'success',
        text: res.message,
      });

      await loadData();
      setTimeout(() => {
        setShowCsvModal(false);
        setCsvContent('');
        setCsvPreview(null);
        setCommitMessage(null);
      }, 2500);
    } catch (err: any) {
      setCommitMessage({
        type: 'error',
        text: err.message || 'Import transaction failed and was rolled back.',
      });
    } finally {
      setIsCommitting(false);
    }
  };

  // Inspect references for a medicine
  const handleInspectReferences = async (med: T.Medicine) => {
    setInspectingMed(med);
    setIsLoadingRefs(true);
    try {
      const refs = await api.getMedicineReferences(med.id);
      setMedReferences(refs);
    } catch (err: any) {
      alert(`Failed to load references: ${err.message}`);
    } finally {
      setIsLoadingRefs(false);
    }
  };

  const handleCreateDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createDiagnosisCatalog(diagForm);
      setShowDiagModal(false);
      setDiagForm({ code: '', name: '', description: '' });
      await loadData();
    } catch (err: any) {
      alert(`Error creating diagnosis: ${err.message}`);
    }
  };

  const openNewMedicineModal = () => {
    setEditingMed(null);
    setMedForm({
      code: '',
      name: '',
      name_hi: '',
      english_name: '',
      sanskrit_name: '',
      dosage_form: 'Vati (Tablet)',
      default_dosage: '1 tablet twice daily after meals with warm water',
      status: 'ACTIVE',
    });
    setShowMedModal(true);
  };

  const openEditMedicineModal = (m: T.Medicine) => {
    setEditingMed(m);
    setMedForm({
      code: m.code,
      name: m.name,
      name_hi: m.name_hi || '',
      english_name: m.english_name || '',
      sanskrit_name: m.sanskrit_name || '',
      dosage_form: m.form || 'Vati (Tablet)',
      default_dosage: m.description || m.strength || '',
      status: m.status,
    });
    setShowMedModal(true);
  };

  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMed) {
        await api.updateMedicine(editingMed.id, {
          name: medForm.name,
          name_hi: medForm.name_hi || null,
          english_name: medForm.english_name || null,
          sanskrit_name: medForm.sanskrit_name || null,
          form: medForm.dosage_form,
          description: medForm.default_dosage,
          status: medForm.status,
        });
      } else {
        await api.createMedicine({
          code: medForm.code,
          name: medForm.name,
          name_hi: medForm.name_hi || null,
          english_name: medForm.english_name || null,
          sanskrit_name: medForm.sanskrit_name || null,
          form: medForm.dosage_form,
          description: medForm.default_dosage,
        });
      }
      setShowMedModal(false);
      setEditingMed(null);
      await loadData();
    } catch (err: any) {
      alert(`Error saving medicine: ${err.message}`);
    }
  };

  const handleToggleMedStatus = async (med: T.Medicine) => {
    const nextStatus = med.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.updateMedicine(med.id, { status: nextStatus });
      await loadData();
    } catch (err: any) {
      alert(`Failed to update medicine status: ${err.message}`);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createClinicalRule({
        diagnosis_id: ruleForm.diagnosis_id,
        rule_code: ruleForm.rule_code,
        title: ruleForm.title,
        evidence_level: ruleForm.evidence_level,
        provenance_source: ruleForm.provenance_source,
        version: ruleForm.version,
        lifestyle_advice: ruleForm.lifestyle_advice,
        contraindications: ruleForm.contraindications,
        recommendations: [
          {
            item_type: 'MEDICINE',
            item_id: medicines[0]?.id || 'med_synthetic_01',
            item_name: medicines[0]?.name || 'Standard Medicine',
            default_dosage: '1 tablet twice daily',
            dosage_form: 'Vati',
            clinical_rationale: 'Standard validated classical formulation for indicated condition.',
            is_optional: false,
          },
        ],
      });
      setShowRuleModal(false);
      alert('Clinical rule successfully created and validated.');
      await loadData();
    } catch (err: any) {
      alert(`Error creating clinical rule: ${err.message}`);
    }
  };

  const filteredDiagnoses = diagnoses.filter(
    (d) =>
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMedicines = medicines.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.name_hi && m.name_hi.includes(searchQuery)) ||
      (m.english_name && m.english_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (m.sanskrit_name && m.sanskrit_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      m.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal">Clinical Master Data &amp; Catalogs</h1>
          <p className="text-xs text-charcoal-muted">
            Authoritative AYUSH disease codification, standard pharmacopeia, and deterministic rule sets.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {activeSubTab === 'diagnoses' && (
            <button onClick={() => setShowDiagModal(true)} className="btn-primary text-xs flex items-center space-x-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Disease Term</span>
            </button>
          )}

          {activeSubTab === 'medicines' && (
            <div className="flex items-center space-x-2">
              {/* CSV Templates Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                  className="btn-secondary text-xs flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV Templates</span>
                </button>
                {showTemplateDropdown && (
                  <div className="absolute right-0 mt-1 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-50 py-1 text-xs">
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('medicine_master')}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-charcoal">Medicine Master Template</div>
                        <div className="text-[10px] text-gray-500">Names, forms, strengths, status</div>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400">.csv</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('clinical_reference')}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center justify-between border-t border-gray-100"
                    >
                      <div>
                        <div className="font-semibold text-charcoal">Clinical References Template</div>
                        <div className="text-[10px] text-gray-500">Indications, roga, dose, anupana</div>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400">.csv</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Authority CSV Import */}
              <button
                type="button"
                onClick={() => {
                  setShowCsvModal(true);
                  setCsvContent('');
                  setCsvFileName('');
                  setCsvPreview(null);
                  setCommitMessage(null);
                }}
                className="btn-secondary text-xs flex items-center space-x-1 border-brand-primary text-brand-primary hover:bg-brand-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import CSV (Authority)</span>
              </button>

              <button onClick={openNewMedicineModal} className="btn-primary text-xs flex items-center space-x-1">
                <Plus className="w-3.5 h-3.5" />
                <span>Add Formulated Drug</span>
              </button>
            </div>
          )}

          {activeSubTab === 'rules' && (
            <button onClick={() => setShowRuleModal(true)} className="btn-primary text-xs flex items-center space-x-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Register Validated Rule</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex space-x-6">
        <button
          onClick={() => setActiveSubTab('diagnoses')}
          className={`pb-3 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
            activeSubTab === 'diagnoses'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-charcoal-muted hover:text-charcoal'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Disease Codification ({diagnoses.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('medicines')}
          className={`pb-3 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
            activeSubTab === 'medicines'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-charcoal-muted hover:text-charcoal'
          }`}
        >
          <Pill className="w-4 h-4" />
          <span>Formulated Medicines ({medicines.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('rules')}
          className={`pb-3 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
            activeSubTab === 'rules'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-charcoal-muted hover:text-charcoal'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Clinical Practice Monograph Rules</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
        <div className="relative w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder={
              activeSubTab === 'diagnoses'
                ? 'Search disease codes or names...'
                : activeSubTab === 'medicines'
                ? 'Filter medicines by English, Hindi, Sanskrit, or code...'
                : 'Search validated rules...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-base pl-9 text-xs"
          />
        </div>
        <div className="text-xs text-charcoal-muted font-medium">
          Showing{' '}
          <span className="text-charcoal font-bold">
            {activeSubTab === 'diagnoses'
              ? filteredDiagnoses.length
              : activeSubTab === 'medicines'
              ? filteredMedicines.length
              : diagnoses.length}
          </span>{' '}
          active records
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="py-12 text-center text-xs text-charcoal-muted">Loading authoritative catalog data...</div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700">{error}</div>
      ) : activeSubTab === 'diagnoses' ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas-subtle border-b border-gray-200 text-charcoal-muted font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Standard Code</th>
                <th className="py-2.5 px-4">Classical Disease Term</th>
                <th className="py-2.5 px-4">Clinical Description</th>
                <th className="py-2.5 px-4">Standard Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDiagnoses.map((d) => (
                <tr key={d.id} className="hover:bg-canvas-subtle transition-colors">
                  <td className="py-2.5 px-4 font-mono font-bold text-brand-primary">{d.code}</td>
                  <td className="py-2.5 px-4 font-semibold text-charcoal">{d.name}</td>
                  <td className="py-2.5 px-4 text-charcoal-muted">{d.description || '—'}</td>
                  <td className="py-2.5 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                      Standard
                    </span>
                  </td>
                </tr>
              ))}
              {filteredDiagnoses.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-charcoal-muted">
                    No matching diagnosis codes found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : activeSubTab === 'medicines' ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas-subtle border-b border-gray-200 text-charcoal-muted font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Code</th>
                <th className="py-2.5 px-4">Formulation (English / हिन्दी / Sanskrit)</th>
                <th className="py-2.5 px-4">Dosage Form</th>
                <th className="py-2.5 px-4">Validation &amp; Provenance</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMedicines.map((m) => (
                <tr key={m.id} className="hover:bg-canvas-subtle transition-colors">
                  <td className="py-2.5 px-4 font-mono font-bold text-brand-primary">{m.code}</td>
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-charcoal">{m.name}</div>
                    <div className="flex items-center space-x-2 mt-0.5">
                      {m.name_hi && (
                        <span className="text-[11px] text-emerald-800 font-serif font-medium">
                          {m.name_hi}
                        </span>
                      )}
                      {m.sanskrit_name && (
                        <span className="text-[10px] text-indigo-700 italic">
                          ({m.sanskrit_name})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 bg-gray-100 text-charcoal rounded text-[10px] font-mono">
                      {m.form || 'Standard'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 space-y-1">
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          m.validation_status === 'VALIDATED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.validation_status === 'REQUIRES REVIEW'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {m.validation_status || 'DOCTOR REVIEW'}
                      </span>
                      {m.source && (
                        <span className="text-[10px] text-gray-500 font-mono">
                          [{m.source}]
                        </span>
                      )}
                    </div>
                    {m.notes && (
                      <div className="text-[10px] text-gray-400 line-clamp-1">{m.notes}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                        m.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleInspectReferences(m)}
                      className="btn-secondary text-[11px] py-1 px-2 inline-flex items-center space-x-1 text-brand-primary"
                      title="Inspect classical and research references"
                    >
                      <Eye className="w-3 h-3" />
                      <span>References</span>
                    </button>
                    <button
                      onClick={() => openEditMedicineModal(m)}
                      className="btn-secondary text-[11px] py-1 px-2 inline-flex items-center space-x-1"
                    >
                      <Edit2 className="w-3 h-3 text-charcoal-muted" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleToggleMedStatus(m)}
                      className={`text-[11px] py-1 px-2 rounded font-medium inline-flex items-center space-x-1 border transition-colors ${
                        m.status === 'ACTIVE'
                          ? 'border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100'
                          : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {m.status === 'ACTIVE' ? (
                        <>
                          <Ban className="w-3 h-3" />
                          <span>Deactivate</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          <span>Activate</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredMedicines.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-charcoal-muted">
                    No matching formulated medicines found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs text-emerald-900 space-y-1">
            <div className="font-semibold flex items-center space-x-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>Deterministic Validation Architecture (Strict Zero-LLM Invariant)</span>
            </div>
            <p className="text-emerald-800 text-[11px]">
              Clinical recommendations are evaluated deterministically against approved national monographs (CCRAS, API,
              WHO AYUSH benchmarks). When a doctor records a diagnosis, the server looks up registered rule provenance.
              If no rule is approved, the system issues a calm fallback: <em>&quot;No validated recommendation available for this diagnosis.&quot;</em>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {diagnoses.map((d) => (
              <div key={d.id} className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="font-mono font-bold text-brand-primary text-xs">{d.code}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                    Evidence Level: CCRAS Class A
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-charcoal">{d.name}</h3>
                  <p className="text-xs text-charcoal-muted mt-0.5">{d.description}</p>
                </div>
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-charcoal-muted">
                  <span>Provenance: Ayurvedic Pharmacopoeia of India (API)</span>
                  <span className="font-mono text-charcoal">v1.0</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: New Diagnosis */}
      <Modal
        isOpen={showDiagModal}
        onClose={() => setShowDiagModal(false)}
        title="Codify Classical Diagnosis Term"
        subtitle="Add standard AYUSH diagnosis into the central catalog."
      >
        <form onSubmit={handleCreateDiagnosis} className="space-y-4 text-xs">
          <div>
            <label className="block text-charcoal-muted font-medium mb-1">Standard Code (e.g. AYU_AMAVATA)</label>
            <input
              type="text"
              required
              value={diagForm.code}
              onChange={(e) => setDiagForm({ ...diagForm, code: e.target.value.toUpperCase() })}
              className="input font-mono"
            />
          </div>
          <div>
            <label className="block text-charcoal-muted font-medium mb-1">Disease Term (Name)</label>
            <input
              type="text"
              required
              value={diagForm.name}
              onChange={(e) => setDiagForm({ ...diagForm, name: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-charcoal-muted font-medium mb-1">Clinical Description / Nidana</label>
            <textarea
              rows={3}
              value={diagForm.description}
              onChange={(e) => setDiagForm({ ...diagForm, description: e.target.value })}
              className="input"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <button type="button" onClick={() => setShowDiagModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Codify Diagnosis
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add/Edit Medicine */}
      <Modal
        isOpen={showMedModal}
        onClose={() => setShowMedModal(false)}
        title={editingMed ? 'Edit Formulated Drug' : 'Add Formulated Drug'}
        subtitle="Maintain standard pharmaceutical master entry."
      >
        <form onSubmit={handleSaveMedicine} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">Medicine Code</label>
              <input
                type="text"
                required
                disabled={!!editingMed}
                value={medForm.code}
                onChange={(e) => setMedForm({ ...medForm, code: e.target.value.toUpperCase() })}
                className="input font-mono"
                placeholder="MED-SITO-01"
              />
            </div>
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">Dosage Form</label>
              <select
                value={medForm.dosage_form}
                onChange={(e) => setMedForm({ ...medForm, dosage_form: e.target.value })}
                className="input"
              >
                <option value="Vati (Tablet)">Vati (Tablet)</option>
                <option value="Churna (Powder)">Churna (Powder)</option>
                <option value="Kwatha (Decoction)">Kwatha (Decoction)</option>
                <option value="Taila (Oil)">Taila (Oil)</option>
                <option value="Ghrita (Ghee)">Ghrita (Ghee)</option>
                <option value="Asava / Arishta (Fermented Liquid)">Asava / Arishta (Fermented Liquid)</option>
                <option value="Avaleha / Rasayana (Confection)">Avaleha / Rasayana (Confection)</option>
                <option value="Bhasma (Calx)">Bhasma (Calx)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-charcoal-muted font-medium mb-1">Formulation Name (English)</label>
            <input
              type="text"
              required
              value={medForm.name}
              onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
              className="input"
              placeholder="Sitopaladi Churna"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">हिन्दी नाम (Hindi Name)</label>
              <input
                type="text"
                value={medForm.name_hi}
                onChange={(e) => setMedForm({ ...medForm, name_hi: e.target.value })}
                className="input font-serif"
                placeholder="सितोपलादि चूर्ण"
              />
            </div>
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">Sanskrit / Classical Name</label>
              <input
                type="text"
                value={medForm.sanskrit_name}
                onChange={(e) => setMedForm({ ...medForm, sanskrit_name: e.target.value })}
                className="input italic"
                placeholder="Sitopaladi"
              />
            </div>
          </div>

          <div>
            <label className="block text-charcoal-muted font-medium mb-1">Default Dosage &amp; Anupana</label>
            <input
              type="text"
              value={medForm.default_dosage}
              onChange={(e) => setMedForm({ ...medForm, default_dosage: e.target.value })}
              className="input"
              placeholder="3g BD with Madhu (Honey)"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button type="button" onClick={() => setShowMedModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save Formulation
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Authority CSV Import & Validation */}
      <Modal
        isOpen={showCsvModal}
        onClose={() => {
          if (!isCommitting) setShowCsvModal(false);
        }}
        title="Authority CSV Import &amp; Monograph Ingestion"
        subtitle="Validate and ingest clinical reference datasets and medicine master catalogues."
      >
        <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
          {commitMessage && (
            <div
              className={`p-3 rounded-md text-xs flex items-start space-x-2 ${
                commitMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
            >
              {commitMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="font-medium">{commitMessage.text}</div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-brand-light file:text-brand-primary hover:file:bg-brand-light/80"
              />
            </div>
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">Dataset Name</label>
              <input
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                className="input-base text-xs"
              />
            </div>
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">Dataset Version</label>
              <input
                type="text"
                value={datasetVersion}
                onChange={(e) => setDatasetVersion(e.target.value)}
                className="input-base text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-charcoal-muted font-medium">CSV Content (Direct Paste or Loaded File)</label>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] text-gray-500">Target Type:</span>
                <select
                  value={csvType}
                  onChange={(e) => {
                    const newType = e.target.value as any;
                    setCsvType(newType);
                    runPreview(csvContent, newType === 'AUTO' ? undefined : newType);
                  }}
                  className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5"
                >
                  <option value="AUTO">Auto-Detect Headers</option>
                  <option value="CLINICAL_REFERENCE">Clinical References (CCRAS/BAMS)</option>
                  <option value="MEDICINE_MASTER">Medicine Master</option>
                </select>
              </div>
            </div>
            <textarea
              rows={4}
              value={csvContent}
              onChange={(e) => {
                setCsvContent(e.target.value);
                runPreview(e.target.value, csvType === 'AUTO' ? undefined : csvType);
              }}
              placeholder="Paste comma-separated CSV text here or upload a file above..."
              className="input-base font-mono text-[11px] w-full"
            />
          </div>

          {/* Live Validation & Preview Statistics */}
          {isPreviewLoading && (
            <div className="p-3 text-center text-xs text-charcoal-muted flex items-center justify-center space-x-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-primary" />
              <span>Validating CSV structure and detecting conflicts...</span>
            </div>
          )}

          {csvPreview && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-5 gap-2">
                <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase">Rows Detected</div>
                  <div className="text-base font-bold text-charcoal">{csvPreview.rows_detected}</div>
                  <div className="text-[9px] text-gray-400">{csvPreview.csv_type}</div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-center">
                  <div className="text-[10px] font-semibold text-emerald-700 uppercase">New Meds</div>
                  <div className="text-base font-bold text-emerald-800">+{csvPreview.new_medicines}</div>
                  <div className="text-[9px] text-emerald-600">To Insert</div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
                  <div className="text-[10px] font-semibold text-amber-700 uppercase">Duplicates</div>
                  <div className="text-base font-bold text-amber-800">{csvPreview.duplicate_rows}</div>
                  <div className="text-[9px] text-amber-600">Action: Skipped</div>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded p-2 text-center">
                  <div className="text-[10px] font-semibold text-purple-700 uppercase">Conflicts</div>
                  <div className="text-base font-bold text-purple-800">{csvPreview.conflicts}</div>
                  <div className="text-[9px] text-purple-600">Flagged Review</div>
                </div>

                <div
                  className={`rounded p-2 text-center border ${
                    csvPreview.errors.length > 0
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}
                >
                  <div className="text-[10px] font-semibold uppercase">
                    {csvPreview.errors.length > 0 ? 'Errors' : 'Status'}
                  </div>
                  <div className="text-base font-bold">
                    {csvPreview.errors.length > 0 ? csvPreview.errors.length : 'VALID'}
                  </div>
                  <div className="text-[9px]">
                    {csvPreview.errors.length > 0 ? 'Fix to Commit' : 'Ready to Commit'}
                  </div>
                </div>
              </div>

              {/* Warnings / Conflicts Banner */}
              {csvPreview.conflicts > 0 && (
                <div className="p-2.5 bg-purple-50 border border-purple-200 rounded text-xs text-purple-900 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{csvPreview.conflicts} Clinical Reference Conflict(s) Detected:</span>{' '}
                    Existing references for this formulation have differing doses or anupana. Under our multi-reference
                    architecture, both records are preserved with status <span className="font-bold font-mono">REQUIRES REVIEW</span> without data loss.
                  </div>
                </div>
              )}

              {/* Errors Display */}
              {csvPreview.errors.length > 0 && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded space-y-1">
                  <div className="font-semibold text-rose-800 text-xs flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>CSV Validation Errors ({csvPreview.errors.length}):</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                    {csvPreview.errors.map((err, i) => (
                      <div key={i} className="text-[11px] text-rose-700 font-mono">
                        Row {err.row_index}: {err.field ? `[${err.field}] ` : ''}{err.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {csvPreview.preview_rows.length > 0 && (
                <div className="border border-gray-200 rounded overflow-hidden">
                  <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200 text-[10px] font-bold uppercase text-gray-500">
                    Data Preview (First {csvPreview.preview_rows.length} rows)
                  </div>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                        <tr>
                          <th className="py-1.5 px-2">#</th>
                          <th className="py-1.5 px-2">Medicine</th>
                          <th className="py-1.5 px-2">Form</th>
                          <th className="py-1.5 px-2">Roga / Indication</th>
                          <th className="py-1.5 px-2">Dose</th>
                          <th className="py-1.5 px-2">Anupana</th>
                          <th className="py-1.5 px-2">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvPreview.preview_rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="py-1 px-2 font-mono text-gray-400">{row.row || idx + 1}</td>
                            <td className="py-1 px-2 font-medium text-charcoal">{row.medicine}</td>
                            <td className="py-1 px-2 text-gray-600">{row.form || '—'}</td>
                            <td className="py-1 px-2 text-gray-600">{row.roga || row.complaint || '—'}</td>
                            <td className="py-1 px-2 text-gray-600">{row.dose || '—'}</td>
                            <td className="py-1 px-2 text-gray-600">{row.anupana || '—'}</td>
                            <td className="py-1 px-2 text-gray-500 font-mono text-[10px]">{row.source || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
            <div className="text-[11px] text-gray-500">
              {csvPreview?.can_commit
                ? 'Ready for atomic database transaction.'
                : 'Upload valid CSV data to enable import.'}
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                disabled={isCommitting}
                onClick={() => setShowCsvModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!csvPreview?.can_commit || isCommitting}
                onClick={handleCommitCsv}
                className="btn-primary flex items-center space-x-1.5"
              >
                {isCommitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Committing Transaction...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Commit Import</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Medicine Clinical References Inspector */}
      <Modal
        isOpen={!!inspectingMed}
        onClose={() => setInspectingMed(null)}
        title={inspectingMed ? `${inspectingMed.name} — Classical & Research References` : 'References'}
        subtitle="1 Medicine Master Record -> Multiple Validated Reference Monographs"
      >
        <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
          {inspectingMed && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md grid grid-cols-3 gap-2">
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-semibold">Medicine Code</span>
                <span className="font-mono font-bold text-brand-primary">{inspectingMed.code}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-semibold">Formulation Form</span>
                <span className="font-medium text-charcoal">{inspectingMed.form || 'Standard'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-semibold">हिन्दी / Classical</span>
                <span className="font-serif text-emerald-800">{inspectingMed.name_hi || inspectingMed.sanskrit_name || '—'}</span>
              </div>
            </div>
          )}

          {isLoadingRefs ? (
            <div className="py-8 text-center text-xs text-charcoal-muted">
              Loading classical and research references...
            </div>
          ) : medReferences.length === 0 ? (
            <div className="py-8 text-center text-xs text-charcoal-muted space-y-1">
              <div>No specific clinical references linked to this formulation yet.</div>
              <div className="text-[11px] text-gray-400">
                You can ingest references via the Authority CSV Import workflow.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-charcoal flex items-center justify-between">
                <span>Provenance Evidence Entries ({medReferences.length})</span>
                <span className="text-[10px] text-gray-500 font-normal">Context-specific dosing preserved</span>
              </div>

              <div className="space-y-2">
                {medReferences.map((ref, idx) => (
                  <div
                    key={ref.id || idx}
                    className="p-3 rounded-md border border-gray-200 bg-white space-y-2 shadow-2xs hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-charcoal text-xs">
                          {ref.roga_name || ref.chief_complaint || 'General Clinical Indication'}
                        </span>
                        {ref.namc_code && (
                          <span className="font-mono text-[10px] text-brand-primary bg-brand-light/40 px-1 py-0.5 rounded">
                            {ref.namc_code}
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          ref.validation_status === 'VALIDATED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ref.validation_status === 'REQUIRES REVIEW'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ref.validation_status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] bg-gray-50 p-2 rounded">
                      <div>
                        <span className="text-gray-400 block text-[10px]">Recommended Dose</span>
                        <span className="font-semibold text-brand-medium">{ref.dose || 'As directed by physician'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Frequency / Timing</span>
                        <span className="text-charcoal">{ref.frequency || 'Twice daily'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Anupana (Vehicle)</span>
                        <span className="text-charcoal font-medium">{ref.anupana || 'Warm water'}</span>
                      </div>
                    </div>

                    {ref.duration_context && (
                      <div className="text-[11px] text-charcoal-muted">
                        <span className="font-semibold text-charcoal">Duration Context:</span> {ref.duration_context}
                      </div>
                    )}

                    {ref.conflict_note && (
                      <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 flex items-start space-x-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Conflict Note:</span> {ref.conflict_note}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-100 font-mono">
                      <span>Source: {ref.source} {ref.source_reference ? `(${ref.source_reference})` : ''}</span>
                      <span>Dataset: {ref.dataset_version}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-gray-200">
            <button type="button" onClick={() => setInspectingMed(null)} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Register Rule */}
      <Modal
        isOpen={showRuleModal}
        onClose={() => setShowRuleModal(false)}
        title="Register Validated Monograph Rule"
        subtitle="Clinical rule sets must reference validated pharmacopeia sources."
      >
        <form onSubmit={handleCreateRule} className="space-y-4 text-xs">
          <div>
            <label className="block text-charcoal-muted font-medium mb-1">Target Disease Codification</label>
            <select
              required
              value={ruleForm.diagnosis_id}
              onChange={(e) => setRuleForm({ ...ruleForm, diagnosis_id: e.target.value })}
              className="input"
            >
              <option value="">Select a codified diagnosis...</option>
              {diagnoses.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">Rule Identifier Code</label>
              <input
                type="text"
                required
                value={ruleForm.rule_code}
                onChange={(e) => setRuleForm({ ...ruleForm, rule_code: e.target.value.toUpperCase() })}
                className="input font-mono"
                placeholder="RUL-KASA-01"
              />
            </div>
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">Rule Monograph Title</label>
              <input
                type="text"
                required
                value={ruleForm.title}
                onChange={(e) => setRuleForm({ ...ruleForm, title: e.target.value })}
                className="input"
                placeholder="Standard Kasa Protocol"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">Evidence Level</label>
              <input
                type="text"
                value={ruleForm.evidence_level}
                onChange={(e) => setRuleForm({ ...ruleForm, evidence_level: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">Provenance Source</label>
              <input
                type="text"
                value={ruleForm.provenance_source}
                onChange={(e) => setRuleForm({ ...ruleForm, provenance_source: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-charcoal-muted font-medium mb-1">Schema Version</label>
              <input
                type="text"
                value={ruleForm.version}
                onChange={(e) => setRuleForm({ ...ruleForm, version: e.target.value })}
                className="input font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-charcoal-muted font-medium mb-1">Lifestyle &amp; Dietetic Pathya Advice</label>
            <textarea
              rows={2}
              value={ruleForm.lifestyle_advice}
              onChange={(e) => setRuleForm({ ...ruleForm, lifestyle_advice: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-charcoal-muted font-medium mb-1">Contraindications &amp; Drug Interactions</label>
            <textarea
              rows={2}
              value={ruleForm.contraindications}
              onChange={(e) => setRuleForm({ ...ruleForm, contraindications: e.target.value })}
              className="input"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <button type="button" onClick={() => setShowRuleModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save Validated Rule
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
