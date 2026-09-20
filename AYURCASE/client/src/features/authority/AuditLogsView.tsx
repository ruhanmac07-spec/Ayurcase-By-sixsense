import React, { useState, useEffect } from 'react';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import {
  Search,
  Filter,
  RefreshCw,
  Eye,
  Clock,
  User,
} from 'lucide-react';
import { Modal } from '../../components/Modal';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<T.AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<T.AuditLogEntry | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listAuditLogs();
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const actionTypes = Array.from(new Set(logs.map((l) => l.action)));

  const filteredLogs = logs.filter((log) => {
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    const matchesSearch =
      searchQuery === '' ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.entity_type && log.entity_type.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.username && log.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.user_id && log.user_id.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesAction && matchesSearch;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal">System Audit Trail &amp; Compliance Logs</h1>
          <p className="text-xs text-charcoal-muted">
            Immutable log of clinical actions, authentication events, patient record access, and administrative changes.
          </p>
        </div>
        <button
          onClick={loadLogs}
          className="btn-secondary text-xs flex items-center space-x-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-charcoal-muted absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by action, entity, user ID, or username..."
            className="input pl-9 text-xs"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="w-3.5 h-3.5 text-charcoal-muted" />
          <span className="text-xs text-charcoal-muted">Filter Action:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="input text-xs py-1.5"
          >
            <option value="ALL">All Actions ({logs.length})</option>
            {actionTypes.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="text-center py-12 text-xs text-charcoal-muted">Loading audit records...</div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">{error}</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas-subtle border-b border-gray-200 text-charcoal-muted font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Entity Type / ID</th>
                <th className="py-2.5 px-4">Actor User</th>
                <th className="py-2.5 px-4">Workspace</th>
                <th className="py-2.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-canvas-subtle transition-colors">
                  <td className="py-2.5 px-4 text-charcoal-muted whitespace-nowrap text-[11px]">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-charcoal-muted" />
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                  </td>

                  <td className="py-2.5 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                        log.action.includes('LOGIN')
                          ? 'bg-blue-100 text-blue-800'
                          : log.action.includes('FINALIZE') || log.action.includes('BACKUP')
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.action.includes('DEACTIVATE') || log.action.includes('FAIL')
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-charcoal'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>

                  <td className="py-2.5 px-4">
                    <span className="font-semibold text-charcoal">{log.entity_type || 'SYSTEM'}</span>
                    {log.entity_id && (
                      <span className="text-[10px] text-charcoal-muted font-mono block truncate max-w-xs">
                        {log.entity_id}
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-4 text-charcoal font-mono text-[11px]">
                    <div className="flex items-center space-x-1">
                      <User className="w-3.5 h-3.5 text-charcoal-muted" />
                      <span>{log.username || log.user_id || 'SYSTEM / ANONYMOUS'}</span>
                    </div>
                  </td>

                  <td className="py-2.5 px-4 text-charcoal-muted text-[11px]">
                    <div>{log.workspace_name || log.workspace_id || 'Global'}</div>
                  </td>

                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="btn-secondary text-[11px] py-1 px-2 flex items-center space-x-1 ml-auto"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect</span>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-charcoal-muted">
                    No matching audit records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Detail Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Audit Event Details"
        subtitle={`Event ID: ${selectedLog?.id}`}
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-canvas-subtle p-3 rounded-lg border border-gray-200">
              <div>
                <span className="text-charcoal-muted block text-[10px]">Action</span>
                <span className="font-mono font-bold text-brand-primary">{selectedLog.action}</span>
              </div>
              <div>
                <span className="text-charcoal-muted block text-[10px]">Timestamp</span>
                <span>{new Date(selectedLog.created_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-charcoal-muted block text-[10px]">Entity Type</span>
                <span className="font-semibold">{selectedLog.entity_type || 'SYSTEM'}</span>
              </div>
              <div>
                <span className="text-charcoal-muted block text-[10px]">Entity ID</span>
                <span className="font-mono">{selectedLog.entity_id || '—'}</span>
              </div>
              <div>
                <span className="text-charcoal-muted block text-[10px]">Actor User</span>
                <span className="font-mono">{selectedLog.username || selectedLog.user_id || 'SYSTEM'}</span>
              </div>
              <div>
                <span className="text-charcoal-muted block text-[10px]">Workspace</span>
                <span>{selectedLog.workspace_name || selectedLog.workspace_id || 'Global'}</span>
              </div>
            </div>

            {selectedLog.details_json && (
              <div>
                <h4 className="font-semibold text-charcoal mb-1 text-[11px]">Audit Details Payload</h4>
                <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg text-[10px] font-mono overflow-auto max-h-56">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedLog.details_json), null, 2);
                    } catch (_) {
                      return selectedLog.details_json;
                    }
                  })()}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedLog(null)} className="btn-secondary">
                Close Inspector
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
