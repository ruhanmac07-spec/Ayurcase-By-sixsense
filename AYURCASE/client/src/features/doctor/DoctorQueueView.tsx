import React, { useState, useEffect } from 'react';
import { useAuth } from '../../state/AuthContext';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import { Modal } from '../../components/Modal';
import {
  Clock,
  Play,
  PhoneCall,
  ArrowRightLeft,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

interface DoctorQueueViewProps {
  onStartConsultation: (visitId: string) => void;
}

export const DoctorQueueView: React.FC<DoctorQueueViewProps> = ({
  onStartConsultation,
}) => {
  const { user } = useAuth();
  const [queue, setQueue] = useState<T.DoctorQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Transfer Modal State
  const [transferVisitId, setTransferVisitId] = useState<string | null>(null);
  const [targetDoctorId, setTargetDoctorId] = useState<string>('');
  const [transferReason, setTransferReason] = useState<string>('');
  const [doctorsList, setDoctorsList] = useState<T.UserSummary[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const data = await api.getMyQueue();
      setQueue(data);
    } catch (_) {
    } finally {
      setIsLoading(false);
    }
  };

  const loadDoctors = async () => {
    try {
      const users = await api.listUsers(user?.workspace_id);
      const otherDocs = users.filter(
        (u) => u.role === 'DOCTOR' && u.status === 'ACTIVE' && u.id !== user?.id
      );
      setDoctorsList(otherDocs);
      if (otherDocs.length > 0) {
        setTargetDoctorId(otherDocs[0].id);
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadQueue();
    loadDoctors();

    // Polling interval
    const timer = setInterval(() => {
      loadQueue();
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const handleCall = async (queueId: string) => {
    setActionError(null);
    try {
      await api.callPatient(queueId);
      loadQueue();
    } catch (err: any) {
      setActionError(err.message || 'Failed to call patient');
    }
  };

  const handleStart = async (visitId: string) => {
    setActionError(null);
    try {
      await api.startConsultation(visitId);
      onStartConsultation(visitId);
    } catch (err: any) {
      setActionError(err.message || 'Failed to start consultation');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferVisitId || !targetDoctorId) return;

    setIsTransferring(true);
    setActionError(null);
    try {
      await api.transferPatient(transferVisitId, targetDoctorId, transferReason);
      setTransferVisitId(null);
      setTransferReason('');
      loadQueue();
    } catch (err: any) {
      setActionError(err.message || 'Failed to transfer patient');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-700 hover:text-red-900 font-bold ml-4 text-sm"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center space-x-2">
            <span>My Consultation Queue</span>
            <span className="text-xs bg-brand-tint text-brand-primary font-bold px-2 py-0.5 rounded-full">
              {queue.length} Waiting
            </span>
          </h1>
          <p className="text-xs text-charcoal-muted">
            Assigned patient encounters for Dr. {user?.full_name}.
          </p>
        </div>

        <button
          onClick={loadQueue}
          className="btn-secondary text-xs flex items-center space-x-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        {queue.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Clock className="w-10 h-10 text-gray-300 mx-auto" />
            <div className="text-sm font-semibold text-charcoal">Queue is clear</div>
            <p className="text-xs text-charcoal-muted max-w-sm mx-auto">
              No patients are currently queued for your consultation. When the reception assistant routes a visit, it will appear here in real-time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-base text-charcoal-muted border-b border-gray-200">
                  <th className="py-3 px-4 font-semibold">Visit No.</th>
                  <th className="py-3 px-4 font-semibold">Patient Details</th>
                  <th className="py-3 px-4 font-semibold">Purpose</th>
                  <th className="py-3 px-4 font-semibold">Waiting Duration</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {queue.map((item) => (
                  <tr key={item.queue_id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-brand-primary">
                      {item.visit_number.startsWith('V-') ? item.visit_number : `Visit No. ${item.visit_number}`}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-sm text-charcoal">{item.patient_name}</div>
                      <div className="text-[11px] text-charcoal-muted">
                        <span className="font-mono">{item.patient_code}</span>
                        {item.patient_sex && ` • ${item.patient_sex}`}
                        {item.patient_phone && ` • ${item.patient_phone}`}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-charcoal-medium font-medium">
                      {item.purpose || 'General Consultation'}
                    </td>
                    <td className="py-3 px-4 text-charcoal-muted">
                      <span className="inline-flex items-center font-medium">
                        <Clock className="w-3 h-3 mr-1 text-gray-400" />
                        {item.waiting_duration_mins} mins
                      </span>
                    </td>
                    <td className="py-3 px-4">
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
                    <td className="py-3 px-4 text-right space-x-2">
                      {item.status === 'WAITING' && (
                        <button
                          onClick={() => handleCall(item.queue_id)}
                          className="btn-secondary text-xs py-1 px-2.5 inline-flex items-center space-x-1"
                        >
                          <PhoneCall className="w-3 h-3" />
                          <span>Call Patient</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleStart(item.visit_id)}
                        className="btn-primary text-xs py-1 px-3 inline-flex items-center space-x-1 shadow-sm"
                      >
                        <Play className="w-3 h-3" />
                        <span>Consult</span>
                      </button>

                      <button
                        onClick={() => setTransferVisitId(item.visit_id)}
                        title="Transfer to another doctor"
                        className="p-1 text-gray-400 hover:text-charcoal hover:bg-gray-100 rounded inline-flex items-center"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transfer Patient Modal */}
      <Modal
        isOpen={!!transferVisitId}
        onClose={() => setTransferVisitId(null)}
        title="Transfer Patient Encounter"
        subtitle="Route this visit to another active doctor in your department. Visit ID and clinical history are preserved."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Select Destination Doctor *
            </label>
            {doctorsList.length === 0 ? (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded text-xs text-charcoal-muted">
                No other active doctors found in your department.
              </div>
            ) : (
              <select
                value={targetDoctorId}
                onChange={(e) => setTargetDoctorId(e.target.value)}
                required
                className="input-base"
              >
                {doctorsList.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.full_name} ({doc.username})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Reason for Transfer (Optional)
            </label>
            <input
              type="text"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="e.g. Specialized Panchakarma consult needed"
              className="input-base text-xs"
            />
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setTransferVisitId(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isTransferring || doctorsList.length === 0}
              className="btn-primary text-xs"
            >
              {isTransferring ? 'Transferring...' : 'Confirm Transfer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
