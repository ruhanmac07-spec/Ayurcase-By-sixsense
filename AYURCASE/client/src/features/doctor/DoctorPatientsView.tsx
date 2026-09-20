import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../state/AuthContext';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import { Search, History, CalendarPlus } from 'lucide-react';
import { PatientHistoryView } from '../history/PatientHistoryView';
import { Modal } from '../../components/Modal';
import { ErrorBoundary } from '../../components/ErrorBoundary';

interface DoctorPatientsViewProps {
  onStartConsultationForVisit?: (visitId: string) => void;
  onNewVisitForPatient?: (patient: T.Patient) => void;
}

export const DoctorPatientsView: React.FC<DoctorPatientsViewProps> = ({
  onStartConsultationForVisit: _onStartConsultationForVisit,
  onNewVisitForPatient,
}) => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<T.Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<T.Patient | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleSearch = async (q: string) => {
    setLoading(true);
    try {
      const results = await api.searchPatients(q, user?.workspace_id);
      setPatients(results);
      setSelectedIndex(results.length > 0 ? 0 : -1);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleSearch('');
    // Auto-focus search input on view mount
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Keyboard Navigation: Up/Down arrow keys to traverse patients, Enter to open history
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (patients.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < patients.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : patients.length - 1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < patients.length) {
      // If user isn't in an active input or presses Enter to select
      if (document.activeElement?.tagName !== 'INPUT' || e.ctrlKey) {
        e.preventDefault();
        setSelectedPatientForHistory(patients[selectedIndex]);
      }
    }
  };

  return (
    <ErrorBoundary fallbackTitle="Patient Directory Recovery">
      <div
        className="p-6 space-y-6 max-w-7xl mx-auto focus:outline-none"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-charcoal">Patient Clinical Directory</h1>
            <p className="text-xs text-charcoal-muted">
              Search active patient registry, review longitudinal medical histories, prior prescriptions, and archived case sheets.
            </p>
          </div>
          <div className="text-xs text-charcoal-muted font-medium bg-surface-base px-2.5 py-1 rounded border border-gray-200">
            Keyboard: <span className="font-mono text-brand-primary font-bold">↑ / ↓</span> select • <span className="font-mono text-brand-primary font-bold">Enter</span> view record
          </div>
        </div>

        {/* Search bar */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-charcoal-muted absolute left-3 top-2.5" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              handleSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && patients.length > 0) {
                e.preventDefault();
                setSelectedIndex(0);
              } else if (e.key === 'Enter' && patients.length > 0 && selectedIndex >= 0) {
                e.preventDefault();
                setSelectedPatientForHistory(patients[selectedIndex]);
              }
            }}
            placeholder="Search by OPD number, name, phone, or reference..."
            className="input-base pl-9 text-xs"
          />
        </div>

        {/* Patients Table */}
        {loading ? (
          <div className="text-center py-12 text-xs text-charcoal-muted bg-white rounded-lg border border-gray-200">
            Searching patient registry...
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas-subtle border-b border-gray-200 text-charcoal-muted font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Patient Code</th>
                  <th className="py-2.5 px-4">Full Patient Name</th>
                  <th className="py-2.5 px-4">Sex / Age</th>
                  <th className="py-2.5 px-4">Contact Phone</th>
                  <th className="py-2.5 px-4">OPD Ref</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {patients.map((p, idx) => {
                  const isHighlighted = idx === selectedIndex;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedIndex(idx)}
                      onDoubleClick={() => setSelectedPatientForHistory(p)}
                      className={`transition-colors cursor-pointer ${
                        isHighlighted
                          ? 'bg-brand-tint/40 ring-1 ring-inset ring-brand-primary'
                          : 'hover:bg-canvas-subtle'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-brand-primary text-xs">
                        {p.patient_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-charcoal">{p.full_name}</div>
                        {p.address && (
                          <div className="text-[10px] text-charcoal-muted truncate max-w-xs">
                            {p.address}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-charcoal">
                        {p.sex || '—'} •{' '}
                        {p.date_of_birth
                          ? `${new Date().getFullYear() - new Date(p.date_of_birth).getFullYear()}y`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-charcoal font-mono">{p.phone || '—'}</td>
                      <td className="py-3 px-4 text-charcoal-muted font-mono text-[11px]">
                        {p.opd_case_id || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {user?.role === 'ASSISTANT' && onNewVisitForPatient && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onNewVisitForPatient(p);
                              }}
                              className="btn-primary text-[11px] py-1 px-2.5 flex items-center space-x-1"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              <span>New Visit</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPatientForHistory(p);
                            }}
                            className="btn-secondary text-[11px] py-1 px-2.5 flex items-center space-x-1"
                          >
                            <History className="w-3.5 h-3.5 text-brand-primary" />
                            <span>View History</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {patients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-charcoal-muted">
                      No patients found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* History Modal */}
        {selectedPatientForHistory && (
          <Modal
            isOpen={!!selectedPatientForHistory}
            onClose={() => {
              setSelectedPatientForHistory(null);
              // Restore focus to search input
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
            title={`Longitudinal Medical Record — ${selectedPatientForHistory.full_name}`}
            subtitle={`Patient Code: ${selectedPatientForHistory.patient_code} • Central SIXSENSE Database Record`}
            maxWidth="max-w-5xl"
          >
            <PatientHistoryView
              patientId={selectedPatientForHistory.id}
              patientName={selectedPatientForHistory.full_name}
              patientUhid={selectedPatientForHistory.patient_code}
              onCreateNewVisit={
                user?.role === 'ASSISTANT' && onNewVisitForPatient
                  ? (pat) => {
                      setSelectedPatientForHistory(null);
                      onNewVisitForPatient(pat);
                    }
                  : undefined
              }
              onClose={() => {
                setSelectedPatientForHistory(null);
                setTimeout(() => searchInputRef.current?.focus(), 100);
              }}
            />
          </Modal>
        )}
      </div>
    </ErrorBoundary>
  );
};
