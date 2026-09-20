import React, { useState, useEffect } from 'react';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import {
  Activity,
  Building2,
  HardDrive,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { generateAuthorityExcelBackup } from '../../utils/excelBackup';

interface AuthorityDashboardProps {
  onNavigate: (tab: any) => void;
}

export const AuthorityDashboard: React.FC<AuthorityDashboardProps> = ({ onNavigate }) => {
  const [health, setHealth] = useState<any>(null);
  const [workspaces, setWorkspaces] = useState<T.Workspace[]>([]);
  const [users, setUsers] = useState<T.UserSummary[]>([]);
  const [backups, setBackups] = useState<T.BackupRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<T.AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [h, ws, u, b, a] = await Promise.all([
        api.getHealth(),
        api.listWorkspaces(),
        api.listUsers(),
        api.listBackups(),
        api.listAuditLogs(),
      ]);
      setHealth(h);
      setWorkspaces(ws);
      setUsers(u);
      setBackups(b);
      setAuditLogs(a);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const latestBackup = backups[0];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal">Operational Authority Dashboard</h1>
          <p className="text-xs text-charcoal-muted">
            Infrastructure health, workspace isolation status, staff accounts, and verifiable backups.
          </p>
        </div>
        <button
          onClick={loadData}
          className="btn-secondary text-xs flex items-center space-x-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Server & DB Health */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-charcoal-muted font-medium">
            <span>Server Heartbeat</span>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-bold text-charcoal flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{health?.status || 'Active'}</span>
          </div>
          <div className="text-[11px] text-charcoal-muted">
            Database: <strong className="text-emerald-700">{health?.database || 'CONNECTED'}</strong>
          </div>
        </div>

        {/* Workspaces / Departments */}
        <div
          onClick={() => onNavigate('authority_workspaces')}
          className="bg-white rounded-lg border border-gray-200 p-4 shadow-xs space-y-2 cursor-pointer hover:border-brand-sage transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-charcoal-muted font-medium">
            <span>Active Workspaces</span>
            <Building2 className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="text-2xl font-bold text-charcoal">
            {workspaces.filter((w) => w.status === 'ACTIVE').length}
          </div>
          <div className="text-[11px] text-charcoal-muted">
            {workspaces.length} Total Departments Configured
          </div>
        </div>

        {/* Staff & Doctors */}
        <div
          onClick={() => onNavigate('authority_users')}
          className="bg-white rounded-lg border border-gray-200 p-4 shadow-xs space-y-2 cursor-pointer hover:border-brand-sage transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-charcoal-muted font-medium">
            <span>Active Users</span>
            <Users className="w-4 h-4 text-brand-medium" />
          </div>
          <div className="text-2xl font-bold text-charcoal">
            {users.filter((u) => u.status === 'ACTIVE').length}
          </div>
          <div className="text-[11px] text-charcoal-muted">
            {users.filter((u) => u.role === 'DOCTOR').length} Doctors •{' '}
            {users.filter((u) => u.role === 'ASSISTANT').length} Assistants
          </div>
        </div>

        {/* Backup Status */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-xs space-y-2 hover:border-brand-sage transition-colors flex flex-col justify-between">
          <div
            onClick={() => onNavigate('authority_backups')}
            className="cursor-pointer space-y-2"
          >
            <div className="flex items-center justify-between text-xs text-charcoal-muted font-medium">
              <span>Latest Backup</span>
              <HardDrive className="w-4 h-4 text-brand-primary" />
            </div>
            <div className="text-sm font-bold text-charcoal flex items-center space-x-1.5">
              {latestBackup?.status === 'SUCCESS' ? (
                <span className="text-emerald-700 flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
                  Verified Intact
                </span>
              ) : (
                <span className="text-amber-700 flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-1 text-amber-600" />
                  {latestBackup?.status || 'No Backups'}
                </span>
              )}
            </div>
            <div className="text-[11px] text-charcoal-muted">
              {latestBackup ? `SHA-256: ${latestBackup.completed_at?.split('T')[0]}` : 'Never executed'}
            </div>
          </div>
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              setExportingExcel(true);
              try {
                const exportData = await api.getBackupExportData();
                generateAuthorityExcelBackup(exportData);
              } catch (err: any) {
                alert(`Excel Export Failed: ${err.message}`);
              } finally {
                setExportingExcel(false);
              }
            }}
            disabled={exportingExcel}
            className="mt-2 w-full py-1 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[11px] font-semibold flex items-center justify-center space-x-1 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>{exportingExcel ? 'Generating...' : 'Export Excel (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* Recent Security & Clinical Audit Events */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-brand-primary" />
            <h2 className="text-sm font-bold text-charcoal">System Audit Stream</h2>
          </div>
          <button
            onClick={() => onNavigate('authority_audit')}
            className="text-xs font-semibold text-brand-primary hover:underline"
          >
            View Full Audit Log →
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {auditLogs.slice(0, 6).map((log) => (
            <div key={log.id} className="p-3 text-xs flex items-center justify-between hover:bg-gray-50">
              <div className="flex items-center space-x-3">
                <span className="font-mono font-bold text-brand-medium text-[11px] bg-brand-tint/40 px-1.5 py-0.5 rounded">
                  {log.action}
                </span>
                <span className="text-charcoal font-medium">
                  {log.username ? `User: ${log.username}` : 'System Agent'}
                </span>
                {log.entity_type && (
                  <span className="text-charcoal-muted">
                    • {log.entity_type} {log.entity_id && `(${log.entity_id})`}
                  </span>
                )}
              </div>
              <div className="text-charcoal-muted text-[11px] font-mono">
                {log.created_at.replace('T', ' ').substring(0, 19)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
