-- =========================================================
-- AYURCASE Migration 0006 — Patient-Scoped Visit Number Uniqueness
-- Replaces (workspace_id, visit_number) with (patient_id, visit_number)
-- so every patient can have Visit 01, 02, etc. without database collision.
-- =========================================================

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS visits_migrated (
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
    opd_number TEXT,
    patient_visit_seq INTEGER,
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

INSERT OR IGNORE INTO visits_migrated (
    id, workspace_id, patient_id, doctor_id, visit_number, visit_date, purpose, status,
    created_by, updated_by, created_at, updated_at, finalized_at, opd_number, patient_visit_seq
)
SELECT
    id, workspace_id, patient_id, doctor_id, visit_number, visit_date, purpose, status,
    created_by, updated_by, created_at, updated_at, finalized_at, opd_number, patient_visit_seq
FROM visits;

DROP TABLE visits;
ALTER TABLE visits_migrated RENAME TO visits;

CREATE INDEX IF NOT EXISTS idx_visits_patient_date ON visits(patient_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_visits_workspace_doctor_date ON visits(workspace_id, doctor_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_visits_workspace_status ON visits(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_visits_workspace_opd ON visits(workspace_id, opd_number);
CREATE INDEX IF NOT EXISTS idx_visits_patient_seq ON visits(patient_id, patient_visit_seq);

PRAGMA foreign_keys = ON;
