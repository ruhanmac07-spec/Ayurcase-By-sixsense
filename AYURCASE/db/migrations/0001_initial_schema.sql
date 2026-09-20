-- =========================================================
-- AYURCASE Phase 2 — SQLite Database Schema v1.0
-- Central DB lives only on SIXSENSE Server.
-- Exact AYUSH fields / clinical rules remain domain-validation TBD.
-- =========================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','DEACTIVATED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL
        CHECK (role IN ('AUTHORITY','DOCTOR','ASSISTANT')),
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','DEACTIVATED')),
    must_change_password INTEGER NOT NULL DEFAULT 0
        CHECK (must_change_password IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT,
    deactivated_at TEXT,
    phone TEXT,
    qualification TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT,
    revoked_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    patient_code TEXT NOT NULL,
    opd_case_id TEXT,
    full_name TEXT NOT NULL,
    date_of_birth TEXT,
    sex TEXT,
    phone TEXT,
    address TEXT,
    emergency_contact TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','ARCHIVED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (workspace_id, patient_code)
);

CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    doctor_id TEXT NOT NULL,
    visit_number TEXT NOT NULL,
    visit_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    purpose TEXT,
    status TEXT NOT NULL DEFAULT 'REGISTERED'
        CHECK (status IN (
            'REGISTERED','QUEUED','IN_CONSULTATION',
            'WAITING_FINALIZATION','FINALIZED','CANCELLED'
        )),
    created_by TEXT NOT NULL,
    updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalized_at TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (doctor_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (patient_id, visit_number)
);

CREATE TABLE IF NOT EXISTS consents (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL UNIQUE,
    consent_status TEXT NOT NULL
        CHECK (consent_status IN ('GIVEN','DECLINED','PENDING')),
    consent_text_version TEXT,
    captured_by TEXT NOT NULL,
    captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (captured_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS vitals (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL UNIQUE,
    temperature REAL,
    pulse_rate INTEGER,
    respiratory_rate INTEGER,
    systolic_bp INTEGER,
    diastolic_bp INTEGER,
    oxygen_saturation REAL,
    height_cm REAL,
    weight_kg REAL,
    notes TEXT,
    recorded_by TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (recorded_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CHECK (pulse_rate IS NULL OR pulse_rate > 0),
    CHECK (respiratory_rate IS NULL OR respiratory_rate > 0),
    CHECK (height_cm IS NULL OR height_cm > 0),
    CHECK (weight_kg IS NULL OR weight_kg > 0)
);

CREATE TABLE IF NOT EXISTS complaints_history (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL UNIQUE,
    chief_complaint TEXT,
    history_text TEXT,
    past_history TEXT,
    family_history TEXT,
    personal_history TEXT,
    recorded_by TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (recorded_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ayush_case_taking (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL UNIQUE,
    data_json TEXT NOT NULL DEFAULT '{}',
    schema_version TEXT,
    recorded_by TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (recorded_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CHECK (json_valid(data_json))
);

CREATE TABLE IF NOT EXISTS queue_entries (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL UNIQUE,
    workspace_id TEXT NOT NULL,
    doctor_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'WAITING'
        CHECK (status IN (
            'WAITING','CALLED','IN_CONSULTATION',
            'COMPLETED','CANCELLED','TRANSFERRED'
        )),
    priority INTEGER NOT NULL DEFAULT 0,
    queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    called_at TEXT,
    completed_at TEXT,
    transferred_at TEXT,
    created_by TEXT NOT NULL,
    FOREIGN KEY (visit_id) REFERENCES visits(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (doctor_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS diagnosis_catalog (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visit_diagnoses (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL,
    diagnosis_id TEXT NOT NULL,
    diagnosis_text TEXT,
    selected_by TEXT NOT NULL,
    selected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (diagnosis_id) REFERENCES diagnosis_catalog(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (selected_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (visit_id, diagnosis_id)
);

CREATE TABLE IF NOT EXISTS medicines (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    name_hi TEXT,
    form TEXT,
    strength TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clinical_rules (
    id TEXT PRIMARY KEY,
    diagnosis_id TEXT NOT NULL,
    rule_code TEXT NOT NULL UNIQUE,
    version INTEGER NOT NULL,
    criteria_json TEXT NOT NULL DEFAULT '{}',
    anupana TEXT,
    pathya TEXT,
    apathya TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
    validated_by TEXT,
    validated_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (diagnosis_id) REFERENCES diagnosis_catalog(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (validated_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (diagnosis_id, version),
    CHECK (json_valid(criteria_json))
);

CREATE TABLE IF NOT EXISTS clinical_rule_items (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    medicine_id TEXT NOT NULL,
    dosage_text TEXT,
    frequency_text TEXT,
    duration_text TEXT,
    instructions_text TEXT,
    FOREIGN KEY (rule_id) REFERENCES clinical_rules(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (rule_id, medicine_id)
);

CREATE TABLE IF NOT EXISTS prescriptions (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','FINALIZED','CANCELLED')),
    source_rule_id TEXT,
    source_rule_version INTEGER,
    created_by TEXT NOT NULL,
    finalized_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalized_at TEXT,
    FOREIGN KEY (visit_id) REFERENCES visits(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (source_rule_id) REFERENCES clinical_rules(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (finalized_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS prescription_items (
    id TEXT PRIMARY KEY,
    prescription_id TEXT NOT NULL,
    medicine_id TEXT,
    medicine_name_snapshot TEXT NOT NULL,
    dosage_text TEXT,
    frequency_text TEXT,
    duration_text TEXT,
    anupana_text TEXT,
    pathya_text TEXT,
    apathya_text TEXT,
    source_type TEXT NOT NULL
        CHECK (source_type IN ('RULE_SUGGESTION','DOCTOR_ADDED')),
    rule_id TEXT,
    rule_version INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (rule_id) REFERENCES clinical_rules(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL,
    document_type TEXT NOT NULL
        CHECK (document_type IN ('CASE_SHEET_PDF','PRESCRIPTION_PDF','OTHER')),
    file_path TEXT NOT NULL,
    file_hash TEXT,
    generated_by TEXT NOT NULL,
    generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (generated_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    request_id TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CHECK (json_valid(details_json))
);

CREATE TABLE IF NOT EXISTS backup_records (
    id TEXT PRIMARY KEY,
    target_path TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL
        CHECK (status IN ('RUNNING','SUCCESS','FAILED','VERIFICATION_FAILED')),
    checksum TEXT,
    size_bytes INTEGER,
    verified_at TEXT,
    error_message TEXT
);

-- =========================================================
-- Required Indexes
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_users_workspace_role_status
    ON users(workspace_id, role, status);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry
    ON sessions(user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_patients_workspace_name
    ON patients(workspace_id, full_name);

CREATE INDEX IF NOT EXISTS idx_patients_workspace_phone
    ON patients(workspace_id, phone);

CREATE INDEX IF NOT EXISTS idx_patients_workspace_opd
    ON patients(workspace_id, opd_case_id);

CREATE INDEX IF NOT EXISTS idx_visits_patient_date
    ON visits(patient_id, visit_date DESC);

CREATE INDEX IF NOT EXISTS idx_visits_workspace_doctor_date
    ON visits(workspace_id, doctor_id, visit_date DESC);

CREATE INDEX IF NOT EXISTS idx_visits_workspace_status
    ON visits(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_queue_doctor_status_time
    ON queue_entries(workspace_id, doctor_id, status, queued_at);

CREATE INDEX IF NOT EXISTS idx_queue_workspace_status_time
    ON queue_entries(workspace_id, status, queued_at);

CREATE INDEX IF NOT EXISTS idx_visit_diagnoses_visit
    ON visit_diagnoses(visit_id);

CREATE INDEX IF NOT EXISTS idx_visit_diagnoses_diagnosis
    ON visit_diagnoses(diagnosis_id);

CREATE INDEX IF NOT EXISTS idx_rules_diagnosis_status
    ON clinical_rules(diagnosis_id, status, version);

CREATE INDEX IF NOT EXISTS idx_rule_items_rule
    ON clinical_rule_items(rule_id);

CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription
    ON prescription_items(prescription_id);

CREATE INDEX IF NOT EXISTS idx_documents_visit
    ON documents(visit_id);

CREATE INDEX IF NOT EXISTS idx_audit_workspace_time
    ON audit_logs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_user_time
    ON audit_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_entity
    ON audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_backup_created
    ON backup_records(started_at DESC);
