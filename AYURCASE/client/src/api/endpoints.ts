import { apiFetch } from './client';
import * as T from './types';

// 1. Health
export const getHealth = () => apiFetch<{ status: string; service: string; version: string; database: string }>('/health');

// 2. Auth
export const login = (data: { username: string; password: string }) =>
  apiFetch<T.LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const logout = () =>
  apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' });

export const getCurrentSession = () =>
  apiFetch<T.UserSessionProfile>('/auth/session');

export const changePassword = (data: { old_password: string; new_password: string }) =>
  apiFetch<{ success: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// 3. Workspaces
export const listWorkspaces = () => apiFetch<T.Workspace[]>('/workspaces');
export const createWorkspace = (data: { code: string; name: string; description?: string }) =>
  apiFetch<T.Workspace>('/workspaces', { method: 'POST', body: JSON.stringify(data) });
export const updateWorkspace = (id: string, data: { name?: string; description?: string }) =>
  apiFetch<T.Workspace>(`/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deactivateWorkspace = (id: string) =>
  apiFetch<{ success: boolean }>(`/workspaces/${id}/deactivate`, { method: 'POST' });
export const restoreWorkspace = (id: string) =>
  apiFetch<{ success: boolean }>(`/workspaces/${id}/restore`, { method: 'POST' });

// 4. Users
export const listUsers = (workspaceId?: string) =>
  apiFetch<T.UserSummary[]>(`/users${workspaceId ? `?workspace_id=${workspaceId}` : ''}`);
export const createUser = (data: T.CreateUserRequest) =>
  apiFetch<T.CreateUserResponse>('/users', { method: 'POST', body: JSON.stringify(data) });
export const updateUser = (id: string, data: any) =>
  apiFetch<T.UserSummary>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deactivateUser = (id: string) =>
  apiFetch<{ success: boolean }>(`/users/${id}/deactivate`, { method: 'POST' });
export const resetUserPassword = (id: string, new_password: string) =>
  apiFetch<T.ResetPasswordResponse>(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ new_password }),
  });

// 5. Patients
export const searchPatients = (q: string, workspaceId?: string) =>
  apiFetch<T.Patient[]>(`/patients/search?q=${encodeURIComponent(q)}${workspaceId ? `&workspace_id=${workspaceId}` : ''}`);
export const checkDuplicatePatients = (data: { phone?: string; full_name: string; workspace_id?: string }) =>
  apiFetch<T.DuplicateCheckResult>('/patients/check-duplicates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const createPatient = (data: any) =>
  apiFetch<T.Patient>('/patients', { method: 'POST', body: JSON.stringify(data) });
export const getPatient = (id: string) => apiFetch<T.Patient>(`/patients/${id}`);
export const updatePatient = (id: string, data: any) =>
  apiFetch<T.Patient>(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const getPatientHistory = (id: string) =>
  apiFetch<any[]>(`/patients/${id}/history`);

// 6. Visits
export const createVisitIntake = (data: any) =>
  apiFetch<T.VisitDetailResponse>('/visits', { method: 'POST', body: JSON.stringify(data) });
export const getVisit = (id: string) =>
  apiFetch<T.VisitDetailResponse>(`/visits/${id}`);

// 7. Queue
export const getMyQueue = () => apiFetch<T.DoctorQueueItem[]>('/queue/my-queue');
export const getIntakeSnapshot = () => apiFetch<T.DoctorQueueItem[]>('/queue/intake-snapshot');
export const callPatient = (queueId: string) =>
  apiFetch<{ success: boolean }>(`/queue/${queueId}/call`, { method: 'POST' });
export const startConsultation = (visitId: string) =>
  apiFetch<{ success: boolean }>(`/queue/${visitId}/start`, { method: 'POST' });
export const transferPatient = (visitId: string, target_doctor_id: string, reason?: string) =>
  apiFetch<{ success: boolean }>(`/queue/${visitId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ target_doctor_id, reason }),
  });

// 8. Consultation
export const getConsultationWorkspace = (visitId: string) =>
  apiFetch<{
    visit_detail: T.VisitDetailResponse;
    diagnoses: T.VisitDiagnosisDetail[];
    prescription: T.PrescriptionDetail | null;
  }>(`/consultations/${visitId}`);

export const saveClinicalNotes = (visitId: string, data: any) =>
  apiFetch<{ success: boolean }>(`/consultations/${visitId}/notes`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const attachDiagnosis = (visitId: string, diagnosis_id: string, diagnosis_text?: string) =>
  apiFetch<T.VisitDiagnosisDetail>(`/consultations/${visitId}/diagnosis`, {
    method: 'POST',
    body: JSON.stringify({ diagnosis_id, diagnosis_text }),
  });

export const removeDiagnosis = (visitId: string, diagnosis_id: string) =>
  apiFetch<{ success: boolean }>(`/consultations/${visitId}/diagnosis/${diagnosis_id}`, {
    method: 'DELETE',
  });

// 9. Diagnosis & Rule Master Data
export const listDiagnosisCatalog = () => apiFetch<T.DiagnosisCatalog[]>('/diagnosis/catalog');
export const searchDiagnosisCatalog = (q?: string, limit?: number) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (limit) params.set('limit', limit.toString());
  const qs = params.toString();
  return apiFetch<T.DiagnosisCatalog[]>(`/diagnosis/catalog/search${qs ? `?${qs}` : ''}`);
};
export const createDiagnosisCatalog = (data: { code: string; name: string; description?: string }) =>
  apiFetch<T.DiagnosisCatalog>('/diagnosis/catalog', { method: 'POST', body: JSON.stringify(data) });

export const listMedicines = () => apiFetch<T.Medicine[]>('/diagnosis/medicines');
export const createMedicine = (data: any) =>
  apiFetch<T.Medicine>('/diagnosis/medicines', { method: 'POST', body: JSON.stringify(data) });
export const updateMedicine = (id: string, data: Partial<T.Medicine>) =>
  apiFetch<T.Medicine>(`/diagnosis/medicines/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const searchMedicines = (query?: string, limit?: number) => {
  const q = new URLSearchParams();
  if (query) q.set('q', query);
  if (limit) q.set('limit', limit.toString());
  const qs = q.toString();
  return apiFetch<T.MedicineSearchResult[]>(`/diagnosis/medicines/search${qs ? `?${qs}` : ''}`);
};

export const downloadMedicineCsvTemplate = (templateType: string) =>
  import('./client').then((m) => m.fetchCsvTemplate(templateType));

export const previewMedicineCsv = (csvContent: string, csvType?: string) =>
  apiFetch<T.CsvPreviewResponse>('/diagnosis/medicines/import/preview', {
    method: 'POST',
    body: JSON.stringify({ csv_content: csvContent, csv_type: csvType }),
  });

export const commitMedicineCsv = (data: T.CsvCommitRequest) =>
  apiFetch<T.CsvCommitResponse>('/diagnosis/medicines/import/commit', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getMedicineReferences = (medicineId: string) =>
  apiFetch<T.ClinicalReference[]>(`/diagnosis/medicines/${medicineId}/references`);

export const getValidatedAssistance = (diagnosisId: string) =>
  apiFetch<T.ValidatedAssistanceResult>(`/diagnosis/rules/${diagnosisId}`);

export const createClinicalRule = (data: any) =>
  apiFetch<{ success: boolean; rule_id: string }>('/diagnosis/rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// 10. Prescriptions
export const getPrescription = (visitId: string) =>
  apiFetch<T.PrescriptionDetail | null>(`/prescriptions/${visitId}`);

export const savePrescriptionDraft = (visitId: string, data: any) =>
  apiFetch<T.PrescriptionDetail>(`/prescriptions/${visitId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const finalizePrescription = (visitId: string) =>
  apiFetch<T.PrescriptionDetail>(`/prescriptions/${visitId}/finalize`, {
    method: 'POST',
  });

// 11. Documents
export const generateCaseSheet = (visitId: string) =>
  apiFetch<T.Document>(`/documents/generate-case-sheet/${visitId}`, {
    method: 'POST',
  });

export const generatePrescription = (visitId: string) =>
  apiFetch<T.Document>(`/documents/generate-prescription/${visitId}`, {
    method: 'POST',
  });

export const getDocumentHtml = (documentId: string) =>
  import('./client').then((m) => m.fetchDocumentHtml(documentId));

export const getDocumentPdfBlobUrl = (documentId: string) =>
  import('./client').then((m) => m.fetchDocumentPdfBlobUrl(documentId));

export const getDocumentHtmlBlobUrl = (documentId: string) =>
  import('./client').then((m) => m.fetchDocumentHtmlBlobUrl(documentId));

// 12. Intelligence & Observational Analytics (Strictly Read-Only)
export const searchSimilarCases = (params: {
  workspace_id?: string;
  query?: string;
  exclude_visit_id?: string;
  limit?: number;
}) => {
  const q = new URLSearchParams();
  if (params.workspace_id) q.set('workspace_id', params.workspace_id);
  if (params.query) q.set('query', params.query);
  if (params.exclude_visit_id) q.set('exclude_visit_id', params.exclude_visit_id);
  if (params.limit) q.set('limit', params.limit.toString());
  const qs = q.toString();
  return apiFetch<T.HistoricalCase[]>(`/intelligence/similar-cases${qs ? `?${qs}` : ''}`);
};

export const getPatternAnalytics = (workspaceId?: string) =>
  apiFetch<T.ObservationalAnalytics>(
    `/intelligence/pattern-analytics${workspaceId ? `?workspace_id=${workspaceId}` : ''}`
  );

// 13. Audit
export const listAuditLogs = (workspaceId?: string) =>
  apiFetch<T.AuditLogEntry[]>(`/audit/logs${workspaceId ? `?workspace_id=${workspaceId}` : ''}`);

// 14. Backups
export const listBackups = () => apiFetch<T.BackupRecord[]>('/backups');
export const triggerBackup = () =>
  apiFetch<T.BackupRecord>('/backups/run', { method: 'POST' });
export const verifyBackup = (id: string) =>
  apiFetch<T.VerifyBackupResult>(`/backups/${id}/verify`, { method: 'POST' });
export const getBackupExportData = () =>
  apiFetch<any>('/backups/export-data');


