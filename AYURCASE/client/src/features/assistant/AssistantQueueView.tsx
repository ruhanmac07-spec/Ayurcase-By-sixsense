import React, { useState, useEffect } from 'react';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import {
  Clock,
  User,
  RefreshCw,
} from 'lucide-react';

export const AssistantQueueView: React.FC = () => {
  const [queue, setQueue] = useState<T.DoctorQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const data = await api.getIntakeSnapshot();
      setQueue(data);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal">Today&apos;s OPD Intake &amp; Consultation Routing Queue</h1>
          <p className="text-xs text-charcoal-muted">
            Live multi-doctor queue tracking patient waiting times, vital triage status, and consultation progress.
          </p>
        </div>
        <button
          onClick={loadQueue}
          className="btn-secondary text-xs flex items-center space-x-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Queue Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs text-charcoal-muted font-medium">Patients Waiting</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {queue.filter((q) => q.status === 'WAITING' || q.status === 'CALLED').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs text-charcoal-muted font-medium">In Consultation</div>
          <div className="text-2xl font-bold text-brand-primary mt-1">
            {queue.filter((q) => q.status === 'IN_CONSULTATION').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs text-charcoal-muted font-medium">Total Registered Today</div>
          <div className="text-2xl font-bold text-charcoal mt-1">{queue.length}</div>
        </div>
      </div>

      {/* Queue Table */}
      {loading && queue.length === 0 ? (
        <div className="text-center py-12 text-xs text-charcoal-muted">Loading today's OPD queue...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas-subtle border-b border-gray-200 text-charcoal-muted font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Visit No.</th>
                <th className="py-2.5 px-4">Patient Details</th>
                <th className="py-2.5 px-4">Assigned Doctor</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Wait Time</th>
                <th className="py-2.5 px-4 text-right">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {queue.map((item) => (
                <tr key={item.queue_id} className="hover:bg-canvas-subtle transition-colors">
                  <td className="py-3 px-4 font-bold text-brand-primary text-sm font-mono">
                    {item.visit_number.startsWith('V-') ? item.visit_number : `Visit No. ${item.visit_number}`}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-charcoal">{item.patient_name}</div>
                    <div className="text-[10px] font-mono text-charcoal-muted">{item.patient_code}</div>
                  </td>
                  <td className="py-3 px-4 text-charcoal">
                    <div className="flex items-center space-x-1.5 font-medium">
                      <User className="w-3.5 h-3.5 text-charcoal-muted" />
                      <span>Doctor Assigned</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                        item.status === 'WAITING'
                          ? 'bg-amber-100 text-amber-800'
                          : item.status === 'CALLED'
                          ? 'bg-blue-100 text-blue-800 animate-pulse'
                          : item.status === 'IN_CONSULTATION'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-charcoal'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-charcoal-muted text-[11px]">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-charcoal-muted" />
                      <span>{item.waiting_duration_mins} mins</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-charcoal-muted text-[11px]">
                    Level {item.priority}
                  </td>
                </tr>
              ))}
              {queue.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-charcoal-muted">
                    No patients currently waiting in the OPD queue today.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
