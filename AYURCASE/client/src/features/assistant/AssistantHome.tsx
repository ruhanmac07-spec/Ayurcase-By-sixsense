import React, { useState, useEffect } from 'react';
import { useAuth } from '../../state/AuthContext';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import { Modal } from '../../components/Modal';
import {
  Search,
  UserPlus,
  CalendarPlus,
  AlertTriangle,
  Clock,
  Phone,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  History,
  Trash2,
} from 'lucide-react';
import { PatientHistoryView } from '../history/PatientHistoryView';

export const AssistantHome: React.FC = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<T.Patient[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Today's Queue Snapshot
  const [intakeQueue, setIntakeQueue] = useState<T.DoctorQueueItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);

  // Modals
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isNewVisitOpen, setIsNewVisitOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<T.Patient | null>(null);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<T.Patient | null>(null);

  // Active Doctors for routing
  const [doctors, setDoctors] = useState<T.UserSummary[]>([]);

  // Registration Form State
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regDob, setRegDob] = useState('');
  const [regSex, setRegSex] = useState('Male');
  const [regAddress, setRegAddress] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<T.Patient[] | null>(null);
  const [isCheckingDups, setIsCheckingDups] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // New Visit Form State
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [visitPurpose, setVisitPurpose] = useState('');
  const [consentStatus, setConsentStatus] = useState('GIVEN');
  const [temp, setTemp] = useState<string>('98.4');
  const [pulse, setPulse] = useState<string>('72');
  const [respRate, setRespRate] = useState<string>('16');
  const [sysBp, setSysBp] = useState<string>('120');
  const [diaBp, setDiaBp] = useState<string>('80');
  const [spo2, setSpo2] = useState<string>('98');
  const [heightCm, setHeightCm] = useState<string>('170');
  const [weightKg, setWeightKg] = useState<string>('68');
  const [vitalsNotes, setVitalsNotes] = useState('');
  const [isSubmittingVisit, setIsSubmittingVisit] = useState(false);
  const [visitSuccessMsg, setVisitSuccessMsg] = useState<string | null>(null);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [intakeComplaints, setIntakeComplaints] = useState<Array<{
    complaint_text: string;
    duration_value: number | string;
    duration_unit: string;
  }>>([
    { complaint_text: '', duration_value: '', duration_unit: 'Days' },
  ]);

  const handleAddIntakeComplaint = () => {
    setIntakeComplaints((prev) => [
      ...prev,
      { complaint_text: '', duration_value: '', duration_unit: 'Days' },
    ]);
  };

  const handleRemoveIntakeComplaint = (idx: number) => {
    setIntakeComplaints((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length === 0
        ? [{ complaint_text: '', duration_value: '', duration_unit: 'Days' }]
        : next;
    });
  };

  const handleIntakeComplaintChange = (idx: number, field: string, value: any) => {
    setIntakeComplaints((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const loadQueue = async () => {
    setIsLoadingQueue(true);
    try {
      const data = await api.getIntakeSnapshot();
      setIntakeQueue(data);
    } catch (_) {
      // Handled by network banner
    } finally {
      setIsLoadingQueue(false);
    }
  };

  const loadDoctors = async () => {
    try {
      const users = await api.listUsers(user?.workspace_id);
      setDoctors(users.filter((u) => u.role === 'DOCTOR' && u.status === 'ACTIVE'));
      if (users.length > 0 && !selectedDoctorId) {
        const firstDoc = users.find((u) => u.role === 'DOCTOR' && u.status === 'ACTIVE');
        if (firstDoc) setSelectedDoctorId(firstDoc.id);
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadQueue();
    loadDoctors();
  }, [user?.workspace_id]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await api.searchPatients(searchQuery, user?.workspace_id);
      setSearchResults(res);
    } catch (_) {
    } finally {
      setIsSearching(false);
    }
  };

  const handleCheckDuplicates = async () => {
    if (!regPhone && !regName) return;
    setIsCheckingDups(true);
    try {
      const res = await api.checkDuplicatePatients({
        phone: regPhone,
        full_name: regName,
        workspace_id: user?.workspace_id,
      });
      if (res.has_potential_duplicates) {
        setDuplicateWarning(res.duplicates);
      } else {
        setDuplicateWarning(null);
      }
    } finally {
      setIsCheckingDups(false);
    }
  };

  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) return;

    setRegError(null);
    try {
      const newPat = await api.createPatient({
        workspace_id: user?.workspace_id,
        full_name: regName.trim(),
        phone: regPhone.trim() || undefined,
        date_of_birth: regDob || undefined,
        sex: regSex,
        // opd_case_id intentionally omitted — OPD numbers are auto-generated per visit server-side
        address: regAddress.trim() || undefined,
      });

      setIsRegisterOpen(false);
      setDuplicateWarning(null);
      // Immediately open new visit modal for this newly created patient
      openNewVisitModal(newPat);
    } catch (err: any) {
      setRegError(err.message || 'Failed to register patient');
    }
  };

  const openNewVisitModal = (pat: T.Patient) => {
    setSelectedPatient(pat);
    setVisitPurpose('');
    setIntakeComplaints([
      { complaint_text: '', duration_value: '', duration_unit: 'Days' },
    ]);
    setVitalsNotes('');
    setVisitSuccessMsg(null);
    setVisitError(null);
    setIsNewVisitOpen(true);
  };

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !selectedDoctorId) return;

    setIsSubmittingVisit(true);
    setVisitError(null);
    try {
      const selectedDoc = doctors.find((d) => d.id === selectedDoctorId);

      const validComplaints = intakeComplaints
        .filter((c) => c.complaint_text.trim())
        .map((c, idx) => ({
          complaint_text: c.complaint_text.trim(),
          duration_value:
            c.duration_value !== '' && !isNaN(Number(c.duration_value))
              ? Number(c.duration_value)
              : null,
          duration_unit: c.duration_unit || 'Days',
          sort_order: idx,
        }));

      const res = await api.createVisitIntake({
        workspace_id: user?.workspace_id,
        patient_id: selectedPatient.id,
        doctor_id: selectedDoctorId,
        purpose: visitPurpose || undefined,
        consent_status: consentStatus,
        temperature: temp ? parseFloat(temp) : undefined,
        pulse_rate: pulse ? parseInt(pulse, 10) : undefined,
        respiratory_rate: respRate ? parseInt(respRate, 10) : undefined,
        systolic_bp: sysBp ? parseInt(sysBp, 10) : undefined,
        diastolic_bp: diaBp ? parseInt(diaBp, 10) : undefined,
        oxygen_saturation: spo2 ? parseFloat(spo2) : undefined,
        height_cm: heightCm ? parseFloat(heightCm) : undefined,
        weight_kg: weightKg ? parseFloat(weightKg) : undefined,
        vitals_notes: vitalsNotes || undefined,
        complaints_list: validComplaints.length > 0 ? validComplaints : undefined,
      });

      const visitDisplay = res.visit.patient_visit_seq != null
        ? `Visit No. ${String(res.visit.patient_visit_seq).padStart(2, '0')}`
        : `Visit No. ${res.visit.visit_number}`;
      setVisitSuccessMsg(
        `${visitDisplay} created successfully. Routed to ${selectedDoc?.full_name || 'selected doctor'}'s queue.`
      );
      loadQueue();
      setTimeout(() => {
        setIsNewVisitOpen(false);
        setVisitSuccessMsg(null);
      }, 1800);
    } catch (err: any) {
      setVisitError(err.message || 'Failed to create visit intake');
    } finally {
      setIsSubmittingVisit(false);
    }
  };

  const selectedDoctorObj = doctors.find((d) => d.id === selectedDoctorId);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal">Patient Intake &amp; Queue Routing</h1>
          <p className="text-xs text-charcoal-muted">
            Search existing records, register new patients, and route encounters to doctor queues.
          </p>
        </div>
        <button
          onClick={() => {
            setRegName('');
            setRegPhone('');
            setRegDob('');
            setDuplicateWarning(null);
            setIsRegisterOpen(true);
          }}
          className="btn-primary flex items-center space-x-1.5"
        >
          <UserPlus className="w-4 h-4" />
          <span>Register New Patient</span>
        </button>
      </div>

      {/* Patient Search Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-xs space-y-4">
        <form onSubmit={handleSearch} className="flex items-center space-x-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Patient Name, Mobile Number, Patient ID (P-00001), or OPD Case ID..."
              className="input-base pl-9 text-sm"
            />
          </div>
          <button type="submit" disabled={isSearching} className="btn-primary">
            {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Search Records'}
          </button>
        </form>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <div className="bg-surface-base px-3 py-2 text-xs font-semibold text-charcoal border-b border-gray-200 flex justify-between">
              <span>Matching Patients ({searchResults.length})</span>
              <span className="text-charcoal-muted text-[11px]">Returning patients: Create NEW visit</span>
            </div>
            <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {searchResults.map((pat) => (
                <div
                  key={pat.id}
                  className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-charcoal">{pat.full_name}</span>
                      <span className="text-xs font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                        {pat.patient_code}
                      </span>
                      {pat.sex && <span className="text-xs text-charcoal-muted">• {pat.sex}</span>}
                      {pat.date_of_birth && (
                        <span className="text-xs text-charcoal-muted">• DOB: {pat.date_of_birth}</span>
                      )}
                    </div>
                    <div className="text-xs text-charcoal-muted flex items-center space-x-3">
                      {pat.phone && (
                        <span className="flex items-center">
                          <Phone className="w-3 h-3 mr-1 text-gray-400" />
                          {pat.phone}
                        </span>
                      )}
                      {pat.opd_case_id && <span>OPD: {pat.opd_case_id}</span>}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPatientForHistory(pat)}
                      className="btn-secondary text-xs py-1.5 px-2.5 flex items-center space-x-1"
                    >
                      <History className="w-3.5 h-3.5 text-brand-primary" />
                      <span>View History</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openNewVisitModal(pat)}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1 shadow-sm"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>Create New Visit</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Today's Intake Queue Snapshot */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-brand-primary" />
            <h2 className="text-sm font-bold text-charcoal">Today's Active Intake Queue</h2>
            <span className="text-xs bg-brand-tint text-brand-primary font-bold px-2 py-0.5 rounded-full">
              {intakeQueue.length} Active
            </span>
          </div>
          <button
            onClick={loadQueue}
            className="btn-secondary text-xs py-1 px-2.5 flex items-center space-x-1"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingQueue ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {intakeQueue.length === 0 ? (
          <div className="p-8 text-center text-charcoal-muted text-xs">
            No patients currently waiting in the intake queue. Use search or registration above to create encounters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-base text-charcoal-muted border-b border-gray-200">
                  <th className="py-2.5 px-3 font-semibold">Visit No.</th>
                  <th className="py-2.5 px-3 font-semibold">Patient Name</th>
                  <th className="py-2.5 px-3 font-semibold">Code / Mobile</th>
                  <th className="py-2.5 px-3 font-semibold">Purpose</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Waiting Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {intakeQueue.map((item) => (
                  <tr key={item.queue_id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-brand-primary">
                      {item.visit_number.startsWith('V-') ? item.visit_number : `Visit No. ${item.visit_number}`}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-charcoal">
                      {item.patient_name}
                    </td>
                    <td className="py-2.5 px-3 text-charcoal-muted">
                      {item.patient_code} {item.patient_phone && `• ${item.patient_phone}`}
                    </td>
                    <td className="py-2.5 px-3 text-charcoal-medium">
                      {item.purpose || 'General Consultation'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          item.status === 'IN_CONSULTATION'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : item.status === 'CALLED'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-charcoal-muted">
                      {item.waiting_duration_mins} mins
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Register New Patient */}
      <Modal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        title="Register New Patient"
        subtitle="Capture demographic information and perform real-time duplicate check"
      >
        <form onSubmit={handleRegisterPatient} className="space-y-4">
          {regError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{regError}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                onBlur={handleCheckDuplicates}
                placeholder="e.g. Anand Deshmukh"
                className="input-base"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                Phone Number {isCheckingDups && <span className="text-brand-primary text-[10px] font-normal">(Checking duplicates...)</span>}
              </label>
              <input
                type="tel"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                onBlur={handleCheckDuplicates}
                placeholder="10-digit mobile number"
                className="input-base"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">Gender</label>
              <select
                value={regSex}
                onChange={(e) => setRegSex(e.target.value)}
                className="input-base"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">Date of Birth</label>
              <input
                type="date"
                value={regDob}
                onChange={(e) => setRegDob(e.target.value)}
                className="input-base"
              />
            </div>
            {/* OPD number is auto-generated server-side per visit — no manual entry needed */}
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">Address</label>
            <input
              type="text"
              value={regAddress}
              onChange={(e) => setRegAddress(e.target.value)}
              placeholder="City, District, State"
              className="input-base"
            />
          </div>

          {/* Duplicate Detection Alert */}
          {duplicateWarning && duplicateWarning.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-md text-xs space-y-2">
              <div className="flex items-center text-amber-900 font-bold">
                <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-600" />
                Existing Patient(s) Found with Similar Details
              </div>
              <p className="text-amber-800 text-[11px]">
                Do not create duplicate records for returning patients. You can select an existing patient below to create a new visit directly.
              </p>
              <div className="space-y-1.5">
                {duplicateWarning.map((d) => (
                  <div
                    key={d.id}
                    className="p-2 bg-white rounded border border-amber-200 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-charcoal">{d.full_name}</span>
                      <span className="text-charcoal-muted ml-2 font-mono">({d.patient_code})</span>
                      <div className="text-[11px] text-gray-500">{d.phone || 'No phone'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegisterOpen(false);
                        openNewVisitModal(d);
                      }}
                      className="btn-primary text-xs py-1 px-2.5 flex items-center space-x-1"
                    >
                      <span>Reuse Patient</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsRegisterOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              Save &amp; Open Visit Intake
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: New Visit Intake */}
      <Modal
        isOpen={isNewVisitOpen}
        onClose={() => setIsNewVisitOpen(false)}
        title="Create New Visit &amp; Queue Routing"
        subtitle={
          selectedPatient
            ? `Patient: ${selectedPatient.full_name} • Patient Code: ${selectedPatient.patient_code}`
            : undefined
        }
      >
        {visitSuccessMsg ? (
          <div className="p-6 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <h3 className="text-sm font-bold text-emerald-900">{visitSuccessMsg}</h3>
          </div>
        ) : (
          <form onSubmit={handleCreateVisit} className="space-y-4">
            {visitError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{visitError}</span>
              </div>
            )}
            {/* Routing / Doctor Selection */}
            <div className="p-3 bg-brand-tint/30 border border-brand-sage/30 rounded-md space-y-2">
              <label className="block text-xs font-bold text-brand-primary">
                Assign Doctor for Consultation *
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                required
                className="input-base font-medium"
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name} ({d.username})
                  </option>
                ))}
              </select>
              {selectedDoctorObj && (
                <div className="text-[11px] text-brand-primary font-medium">
                  → Visit will be added to <strong>{selectedDoctorObj.full_name}</strong>'s queue.
                </div>
              )}
            </div>

            {/* Visit Details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">
                  Purpose / Chief Reason
                </label>
                <input
                  type="text"
                  value={visitPurpose}
                  onChange={(e) => setVisitPurpose(e.target.value)}
                  placeholder="e.g. Cough, Joint pain, Follow-up"
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1">
                  Consent Status
                </label>
                <select
                  value={consentStatus}
                  onChange={(e) => setConsentStatus(e.target.value)}
                  className="input-base"
                >
                  <option value="GIVEN">Given (Informed Clinical Consent)</option>
                  <option value="PENDING">Pending</option>
                  <option value="DECLINED">Declined</option>
                </select>
              </div>
            </div>

            {/* Structured Chief Complaints with Durations */}
            <div className="space-y-2 bg-gray-50/70 p-3 rounded-md border border-gray-200">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-charcoal">
                  Chief Complaints &amp; Durations (Pradhana Vedana)
                </label>
                <button
                  type="button"
                  onClick={handleAddIntakeComplaint}
                  className="text-xs text-brand-primary font-bold hover:underline"
                >
                  + Add Complaint Row
                </button>
              </div>

              <div className="space-y-2">
                {intakeComplaints.map((item, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono text-gray-500 w-5">#{idx + 1}</span>
                    <input
                      type="text"
                      value={item.complaint_text}
                      onChange={(e) => handleIntakeComplaintChange(idx, 'complaint_text', e.target.value)}
                      placeholder="e.g. Shoola in Janu Sandhi, Kasa, Amlodgara"
                      className="input-base text-xs flex-1"
                    />
                    <input
                      type="number"
                      min="1"
                      value={item.duration_value}
                      onChange={(e) => handleIntakeComplaintChange(idx, 'duration_value', e.target.value)}
                      placeholder="Dur"
                      className="input-base text-xs w-16 text-center font-mono"
                    />
                    <select
                      value={item.duration_unit}
                      onChange={(e) => handleIntakeComplaintChange(idx, 'duration_unit', e.target.value)}
                      className="input-base text-xs w-24"
                    >
                      <option value="Hours">Hours</option>
                      <option value="Days">Days</option>
                      <option value="Weeks">Weeks</option>
                      <option value="Months">Months</option>
                      <option value="Years">Years</option>
                    </select>
                    {intakeComplaints.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveIntakeComplaint(idx)}
                        className="text-gray-400 hover:text-red-600 p-1"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Vitals Capture */}
            <div>
              <div className="text-xs font-bold text-charcoal mb-2 border-b border-gray-100 pb-1">
                Basic Clinical Vitals
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] text-charcoal-muted mb-0.5">Temp (°F)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={temp}
                    onChange={(e) => setTemp(e.target.value)}
                    className="input-base text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-charcoal-muted mb-0.5">Pulse (bpm)</label>
                  <input
                    type="number"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    className="input-base text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-charcoal-muted mb-0.5">BP (Sys/Dia)</label>
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      placeholder="120"
                      value={sysBp}
                      onChange={(e) => setSysBp(e.target.value)}
                      className="input-base text-xs w-1/2"
                    />
                    <span>/</span>
                    <input
                      type="number"
                      placeholder="80"
                      value={diaBp}
                      onChange={(e) => setDiaBp(e.target.value)}
                      className="input-base text-xs w-1/2"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-charcoal-muted mb-0.5">SpO2 (%)</label>
                  <input
                    type="number"
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                    className="input-base text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-2">
                <div>
                  <label className="block text-[11px] text-charcoal-muted mb-0.5">Height (cm)</label>
                  <input
                    type="number"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    className="input-base text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-charcoal-muted mb-0.5">Weight (kg)</label>
                  <input
                    type="number"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    className="input-base text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-charcoal-muted mb-0.5">Resp Rate</label>
                  <input
                    type="number"
                    value={respRate}
                    onChange={(e) => setRespRate(e.target.value)}
                    className="input-base text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsNewVisitOpen(false)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingVisit}
                className="btn-primary text-xs"
              >
                {isSubmittingVisit ? 'Routing Visit...' : 'Confirm & Add to Doctor Queue'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Patient Longitudinal History Modal */}
      {selectedPatientForHistory && (
        <Modal
          isOpen={!!selectedPatientForHistory}
          onClose={() => setSelectedPatientForHistory(null)}
          title={`Longitudinal Medical Record — ${selectedPatientForHistory.full_name}`}
          subtitle={`Patient Code: ${selectedPatientForHistory.patient_code} • Central SIXSENSE Database Record`}
          maxWidth="max-w-5xl"
        >
          <PatientHistoryView
            patientId={selectedPatientForHistory.id}
            patientName={selectedPatientForHistory.full_name}
            patientUhid={selectedPatientForHistory.patient_code}
            onCreateNewVisit={(pat) => {
              setSelectedPatientForHistory(null);
              openNewVisitModal(pat);
            }}
            onClose={() => setSelectedPatientForHistory(null)}
          />
        </Modal>
      )}
    </div>
  );
};
