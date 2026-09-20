export type UserRole = 'AUTHORITY' | 'DOCTOR' | 'ASSISTANT';

export interface UserSessionProfile {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  workspace_id?: string;
  workspace_name?: string;
  workspace_code?: string;
  qualification?: string;
}

/** Returned by POST /auth/login */
export interface LoginResponse {
  token: string;
  user: UserSessionProfile;
  /** True only for an Authority account that must change its default password before proceeding. */
  must_change_password: boolean;
}

/** Used when creating Doctor/Assistant accounts. Username is auto-generated server-side. */
export interface CreateUserRequest {
  workspace_id?: string;
  full_name: string;
  role: string;
  /** Phone number — becomes the initial login password for Doctor/Assistant. */
  phone?: string;
  /** Professional qualification (e.g. BAMS, MD Ayurveda) */
  qualification?: string;
}

/**
 * Returned once at the moment of user creation.
 * generated_password is the one-time plaintext credential — show and discard.
 */
export interface CreateUserResponse {
  user: UserSummary;
  generated_username: string;
  generated_password: string;
}

/**
 * Returned once at the moment of password reset.
 * generated_password is the one-time plaintext — show and discard.
 */
export interface ResetPasswordResponse {
  generated_password: string;
}

export interface Workspace {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'DEACTIVATED';
  created_at: string;
  updated_at: string;
  deactivated_at?: string;
}

export interface UserSummary {
  id: string;
  workspace_id?: string;
  workspace_name?: string;
  username: string;
  full_name: string;
  role: UserRole;
  status: 'ACTIVE' | 'DEACTIVATED';
  last_login_at?: string;
  qualification?: string;
}

export interface Patient {
  id: string;
  workspace_id: string;
  patient_code: string;
  opd_case_id?: string;
  full_name: string;
  date_of_birth?: string;
  sex?: string;
  phone?: string;
  address?: string;
  emergency_contact?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
}

export interface DuplicateCheckResult {
  has_potential_duplicates: boolean;
  duplicates: Patient[];
}

export interface Consent {
  id: string;
  visit_id: string;
  consent_status: 'GIVEN' | 'DECLINED' | 'PENDING';
  consent_text_version?: string;
  captured_by: string;
  captured_at: string;
}

export interface Vitals {
  id: string;
  visit_id: string;
  temperature?: number;
  pulse_rate?: number;
  respiratory_rate?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  oxygen_saturation?: number;
  height_cm?: number;
  weight_kg?: number;
  notes?: string;
  recorded_by: string;
  recorded_at: string;
}

export interface ComplaintsHistory {
  id: string;
  visit_id: string;
  chief_complaint?: string;
  history_text?: string;
  past_history?: string;
  family_history?: string;
  personal_history?: string;
  recorded_by: string;
  recorded_at: string;
  updated_at: string;
}

export interface AyushCaseTaking {
  id: string;
  visit_id: string;
  data_json: string;
  schema_version?: string;
  recorded_by: string;
  recorded_at: string;
  updated_at: string;
}

export interface Visit {
  id: string;
  workspace_id: string;
  patient_id: string;
  doctor_id: string;
  visit_number: string;
  visit_date: string;
  purpose?: string;
  status: 'REGISTERED' | 'QUEUED' | 'IN_CONSULTATION' | 'WAITING_FINALIZATION' | 'FINALIZED' | 'CANCELLED';
  created_by: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  finalized_at?: string;
  /** Human-readable per-visit OPD identifier: PATIENT_CODE/DD/MM/YYYY */
  opd_number?: string;
  /** Per-patient chronological visit counter (1-based integer) */
  patient_visit_seq?: number;
}

export interface QueueEntry {
  id: string;
  visit_id: string;
  workspace_id: string;
  doctor_id: string;
  status: 'WAITING' | 'CALLED' | 'IN_CONSULTATION' | 'COMPLETED' | 'CANCELLED' | 'TRANSFERRED';
  priority: number;
  queued_at: string;
  called_at?: string;
  completed_at?: string;
  transferred_at?: string;
  created_by: string;
}

export interface DoctorQueueItem {
  queue_id: string;
  visit_id: string;
  visit_number: string;
  patient_id: string;
  patient_name: string;
  patient_code: string;
  patient_phone?: string;
  patient_sex?: string;
  patient_dob?: string;
  purpose?: string;
  status: string;
  priority: number;
  queued_at: string;
  waiting_duration_mins: number;
}

export interface VisitComplaint {
  id?: string;
  visit_id?: string;
  complaint_text: string;
  duration_value?: number | null;
  duration_unit?: string | null;
  notes?: string | null;
  sort_order?: number;
  created_at?: string;
}

export interface VisitDetailResponse {
  visit: Visit;
  patient_name: string;
  patient_code: string;
  doctor_name: string;
  consent?: Consent;
  vitals?: Vitals;
  complaints?: ComplaintsHistory;
  complaints_list?: VisitComplaint[];
  ayush_case?: AyushCaseTaking;
  queue_entry?: QueueEntry;
}

export interface DiagnosisCatalog {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
}

export interface VisitDiagnosisDetail {
  id: string;
  diagnosis_id: string;
  code: string;
  name: string;
  diagnosis_text?: string;
  selected_at: string;
}

export interface Medicine {
  id: string;
  code: string;
  name: string;
  name_hi?: string | null;
  english_name?: string | null;
  sanskrit_name?: string | null;
  form?: string | null;
  strength?: string | null;
  source?: string | null;
  source_reference?: string | null;
  validation_status?: string | null;
  notes?: string | null;
  description?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at?: string;
  updated_at?: string;
}

export interface ClinicalReference {
  id: string;
  medicine_id: string;
  diagnosis_id?: string | null;
  chief_complaint?: string | null;
  duration_context?: string | null;
  roga_name?: string | null;
  namc_code?: string | null;
  formulation_form?: string | null;
  dose?: string | null;
  frequency?: string | null;
  anupana?: string | null;
  source: string;
  source_reference?: string | null;
  source_page?: string | null;
  validation_status: string;
  dataset_version: string;
  imported_at: string;
  conflict_note?: string | null;
}

export interface MedicineSearchResult {
  id: string;
  code: string;
  name: string;
  name_hi?: string | null;
  english_name?: string | null;
  sanskrit_name?: string | null;
  form?: string | null;
  strength?: string | null;
  status: string;
  references: ClinicalReference[];
}

export interface CsvValidationIssue {
  row_index: number;
  field?: string | null;
  message: string;
}

export interface CsvPreviewResponse {
  csv_type: 'MEDICINE_MASTER' | 'CLINICAL_REFERENCE' | string;
  rows_detected: number;
  new_medicines: number;
  existing_medicines: number;
  duplicate_rows: number;
  conflicts: number;
  warnings: CsvValidationIssue[];
  errors: CsvValidationIssue[];
  can_commit: boolean;
  preview_rows: Record<string, any>[];
}

export interface CsvCommitRequest {
  csv_type?: string;
  csv_content: string;
  filename?: string;
  dataset_name?: string;
  dataset_version?: string;
}

export interface CsvCommitResponse {
  success: boolean;
  processed: number;
  inserted_medicines: number;
  updated_medicines: number;
  inserted_references: number;
  skipped: number;
  warnings_count: number;
  errors_count: number;
  audit_event_id: string;
  message: string;
}

export interface RuleItemSuggestion {
  medicine_id: string;
  medicine_name: string;
  form?: string;
  strength?: string;
  dosage_text?: string;
  frequency_text?: string;
  duration_text?: string;
  instructions_text?: string;
}

export interface ValidatedAssistanceResult {
  has_validated_rule: boolean;
  diagnosis_id: string;
  diagnosis_name: string;
  rule_id?: string;
  rule_code?: string;
  version?: number;
  anupana?: string;
  pathya?: string;
  apathya?: string;
  items: RuleItemSuggestion[];
  message?: string;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  medicine_id?: string;
  medicine_name_snapshot: string;
  dosage_text?: string;
  frequency_text?: string;
  duration_text?: string;
  anupana_text?: string;
  pathya_text?: string;
  apathya_text?: string;
  source_type: 'RULE_SUGGESTION' | 'DOCTOR_ADDED';
  rule_id?: string;
  rule_version?: number;
  created_at: string;
}

export interface Prescription {
  id: string;
  visit_id: string;
  status: 'DRAFT' | 'FINALIZED' | 'CANCELLED';
  source_rule_id?: string;
  source_rule_version?: number;
  created_by: string;
  finalized_by?: string;
  created_at: string;
  updated_at: string;
  finalized_at?: string;
}

export interface PrescriptionDetail {
  prescription: Prescription;
  items: PrescriptionItem[];
}

export interface Document {
  id: string;
  visit_id: string;
  document_type: string;
  file_path: string;
  file_hash?: string;
  generated_by: string;
  generated_at: string;
}

export interface AuditLogEntry {
  id: string;
  workspace_id?: string;
  workspace_name?: string;
  user_id?: string;
  username?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  details_json: string;
  created_at: string;
}

export interface BackupRecord {
  id: string;
  target_path: string;
  started_at: string;
  completed_at?: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'VERIFICATION_FAILED';
  checksum?: string;
  size_bytes?: number;
  verified_at?: string;
  error_message?: string;
}

export interface VerifyBackupResult {
  id: string;
  status: string;
  verified_at: string;
  calculated_checksum: string;
  stored_checksum: string;
  is_valid: boolean;
}

export interface HistoricalMedicineItem {
  medicine_name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  source_type: string;
  rule_code?: string;
}

export interface HistoricalCase {
  visit_id: string;
  visit_number: string;
  visit_date: string;
  patient_code: string;
  chief_complaint: string;
  diagnoses: string[];
  medicines: HistoricalMedicineItem[];
  source_rule_code?: string;
  source_rule_version?: number;
  disclaimer: string;
}

export interface ComplaintCluster {
  complaint: string;
  count: number;
}

export interface MedicineFrequency {
  medicine_name: string;
  count: number;
}

export interface DiagnosisMedicinePattern {
  diagnosis_name: string;
  top_medicines: MedicineFrequency[];
}

export interface CoPrescriptionPair {
  medicine_a: string;
  medicine_b: string;
  count: number;
}

export interface ObservationalAnalytics {
  complaint_clusters: ComplaintCluster[];
  diagnosis_patterns: DiagnosisMedicinePattern[];
  common_co_prescriptions: CoPrescriptionPair[];
  total_analyzed_visits: number;
  disclaimer: string;
}

