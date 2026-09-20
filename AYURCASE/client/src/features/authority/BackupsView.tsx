import React, { useState, useEffect } from 'react';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import {
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Play,
  ShieldCheck,
  Clock,
  Check,
  FileSpreadsheet,
  Download,
} from 'lucide-react';
import { generateAuthorityExcelBackup } from '../../utils/excelBackup';

export const BackupsView: React.FC = () => {
  const [backups, setBackups] = useState<T.BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ id: string; verified: boolean; message: string } | null>(null);
  const [excelSuccessNotice, setExcelSuccessNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBackups = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listBackups();
      setBackups(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load backup records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleExportExcelBackup = async () => {
    setExportingExcel(true);
    setExcelSuccessNotice(null);
    try {
      const exportData = await api.getBackupExportData();
      const filename = generateAuthorityExcelBackup(exportData);
      setExcelSuccessNotice(
        `Successfully generated and downloaded structured Excel backup (${filename}) with ${exportData.metadata?.counts?.patients || 0} patients, ${exportData.metadata?.counts?.visits || 0} visits, and ${exportData.metadata?.counts?.prescriptions || 0} prescriptions.`
      );
    } catch (err: any) {
      alert(`Excel Backup Export Failed: ${err.message}`);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleTriggerBackup = async () => {
    setRunning(true);
    setVerifyResult(null);
    try {
      await api.triggerBackup();
      await loadBackups();
    } catch (err: any) {
      alert(`Backup failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    setVerifyResult(null);
    try {
      const res = await api.verifyBackup(id);
      setVerifyResult({
        id,
        verified: res.is_valid,
        message: res.is_valid
          ? `Integrity Verified: Calculated checksum matches recorded SHA-256.`
          : `Checksum Mismatch: File has been altered or corrupted.`,
      });
      await loadBackups();
    } catch (err: any) {
      setVerifyResult({
        id,
        verified: false,
        message: `Verification Error: ${err.message}`,
      });
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center space-x-2">
            <span>Operational &amp; Clinical Database Backups</span>
          </h1>
          <p className="text-xs text-charcoal-muted">
            Atomic non-blocking SQLite snapshotting with cryptographic SHA-256 integrity, plus structured multi-worksheet Excel (.xlsx) export.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadBackups}
            className="btn-secondary text-xs flex items-center space-x-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExportExcelBackup}
            disabled={exportingExcel}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            {exportingExcel ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Generating Excel (.xlsx)...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Structured Excel Backup</span>
              </>
            )}
          </button>
          <button
            onClick={handleTriggerBackup}
            disabled={running}
            className="btn-primary text-xs flex items-center space-x-1.5"
          >
            {running ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Creating Snapshot...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Create SQLite Snapshot</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Excel Backup Info Card */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-4 text-xs space-y-2">
        <div className="font-semibold text-emerald-950 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span className="text-sm font-bold">Structured Excel Backup Architecture (.xlsx)</span>
          </div>
          <button
            onClick={handleExportExcelBackup}
            disabled={exportingExcel}
            className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200 px-2.5 py-1 rounded border border-emerald-300 flex items-center space-x-1 transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>Download Full Workbook (.xlsx)</span>
          </button>
        </div>
        <p className="text-emerald-900 text-[11px] leading-relaxed">
          The Authority Excel Backup compiles all clinical and operational records into a beautifully structured, multi-worksheet spreadsheet. Every table is formatted with auto-sized columns, headers, and localized dates.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-[11px]">
          <div className="bg-white/80 border border-emerald-200 p-2 rounded">
            <div className="font-bold text-emerald-950">Worksheets 1–3</div>
            <div className="text-emerald-800">System Overview • Patients Registry • Visits Log</div>
          </div>
          <div className="bg-white/80 border border-emerald-200 p-2 rounded">
            <div className="font-bold text-emerald-950">Worksheets 4–6</div>
            <div className="text-emerald-800">Prescriptions &amp; Formulations • Clinical Vitals • Complaints &amp; History</div>
          </div>
          <div className="bg-white/80 border border-emerald-200 p-2 rounded">
            <div className="font-bold text-emerald-950">Worksheets 7–9</div>
            <div className="text-emerald-800">AYUSH Assessments • Diagnoses (Rog Nidan) • Formulary Catalog</div>
          </div>
          <div className="bg-white/80 border border-emerald-200 p-2 rounded">
            <div className="font-bold text-emerald-950">Worksheets 10–13</div>
            <div className="text-emerald-800">Clinical Rules • Workspaces • Staff • Full Audit Trail</div>
          </div>
        </div>
      </div>

      {/* Excel Success Notice */}
      {excelSuccessNotice && (
        <div className="p-3 rounded-lg border text-xs flex items-center space-x-2 bg-emerald-50 border-emerald-300 text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span className="font-medium">{excelSuccessNotice}</span>
        </div>
      )}

      {/* Info Callout */}
      <div className="bg-canvas-subtle border border-gray-200 rounded-lg p-4 text-xs space-y-1">
        <div className="font-semibold text-charcoal flex items-center space-x-1.5">
          <ShieldCheck className="w-4 h-4 text-brand-primary" />
          <span>Atomic SQLite Snapshotting &amp; Cryptographic Verification</span>
        </div>
        <p className="text-charcoal-muted text-[11px]">
          Snapshots are executed on the SIXSENSE Server using online SQLite <code>VACUUM INTO</code> without interrupting concurrent doctor consultations. Each archive generates a SHA-256 checksum immediately upon completion to guarantee bit-for-bit authenticity.
        </p>
      </div>

      {/* Verification Notice */}
      {verifyResult && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
            verifyResult.verified
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {verifyResult.verified ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
          )}
          <span>{verifyResult.message}</span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-xs text-charcoal-muted">Loading backup records...</div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">{error}</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas-subtle border-b border-gray-200 text-charcoal-muted font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Backup Archive Target</th>
                <th className="py-2.5 px-4">Execution Status</th>
                <th className="py-2.5 px-4">Size</th>
                <th className="py-2.5 px-4">SHA-256 Checksum</th>
                <th className="py-2.5 px-4">Started At</th>
                <th className="py-2.5 px-4 text-right">Integrity Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {backups.map((b) => (
                <tr key={b.id} className="hover:bg-canvas-subtle transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-mono font-medium text-charcoal text-xs flex items-center space-x-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-charcoal-muted shrink-0" />
                      <span>{b.target_path.split('/').pop() || b.target_path}</span>
                    </div>
                    <div className="text-[10px] text-charcoal-muted font-mono truncate max-w-xs">
                      {b.target_path}
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    {b.status === 'SUCCESS' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                        <Check className="w-3 h-3 mr-1" />
                        SUCCESS
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {b.status}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-charcoal font-mono">
                    {b.size_bytes ? `${(b.size_bytes / 1024).toFixed(1)} KB` : '—'}
                  </td>

                  <td className="py-3 px-4">
                    {b.checksum ? (
                      <div className="font-mono text-[10px] text-charcoal-muted bg-gray-50 p-1 rounded max-w-xs truncate border border-gray-200">
                        {b.checksum}
                      </div>
                    ) : (
                      <span className="text-charcoal-muted text-[10px]">None</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-charcoal-muted text-[11px]">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-charcoal-muted" />
                      <span>{new Date(b.started_at).toLocaleString()}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={handleExportExcelBackup}
                        disabled={exportingExcel}
                        className="text-[11px] py-1 px-2.5 text-emerald-800 hover:bg-emerald-50 bg-white border border-emerald-300 rounded font-medium flex items-center space-x-1 transition-colors"
                        title="Export structured Excel (.xlsx) workbook"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Excel .xlsx</span>
                      </button>
                      <button
                        onClick={() => handleVerify(b.id)}
                        disabled={verifyingId === b.id || b.status !== 'SUCCESS'}
                        className="btn-secondary text-[11px] py-1 px-2.5 flex items-center space-x-1"
                      >
                        <ShieldCheck className={`w-3.5 h-3.5 ${verifyingId === b.id ? 'animate-spin' : ''}`} />
                        <span>{verifyingId === b.id ? 'Verifying...' : 'Verify Hash'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-charcoal-muted">
                    No database backups have been recorded yet. Click &quot;Create Immediate Backup&quot; to generate one.
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
