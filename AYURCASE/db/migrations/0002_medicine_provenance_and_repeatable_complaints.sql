-- =========================================================
-- AYURCASE Phase 2 — Migration 0002
-- Medicine Provenance, Clinical References & Repeatable Chief Complaints
-- =========================================================

PRAGMA foreign_keys = ON;

-- 1. Extend medicines master table with clinical provenance and multilingual fields
-- (Columns may already exist or be added safely)
-- In SQLite, columns are added via ALTER TABLE in migration runner.

-- 2. Create clinical_references table
-- Stores source-specific clinical usage, dosages, anupana, duration contexts,
-- and evidence provenance (CCRAS, NAMC, BAMS) linked to a single medicine master record.
CREATE TABLE IF NOT EXISTS clinical_references (
    id TEXT PRIMARY KEY,
    medicine_id TEXT NOT NULL,
    diagnosis_id TEXT,
    chief_complaint TEXT,
    duration_context TEXT,
    roga_name TEXT,
    namc_code TEXT,
    formulation_form TEXT,
    dose TEXT,
    frequency TEXT,
    anupana TEXT,
    source TEXT NOT NULL,
    source_reference TEXT,
    source_page TEXT,
    validation_status TEXT NOT NULL DEFAULT 'REFERENCE'
        CHECK (validation_status IN ('REFERENCE', 'DOCTOR REVIEW', 'PHYSICIAN / SPECIALIST REVIEW', 'VALIDATED', 'REQUIRES REVIEW', 'RETIRED')),
    dataset_version TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    conflict_note TEXT,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (diagnosis_id) REFERENCES diagnosis_catalog(id)
        ON UPDATE CASCADE ON DELETE SET NULL
);

-- 3. Create visit_complaints table
-- Stores repeatable, individual chief complaints, each with its own independent duration value and unit.
CREATE TABLE IF NOT EXISTS visit_complaints (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL,
    complaint_text TEXT NOT NULL,
    duration_value INTEGER,
    duration_unit TEXT
        CHECK (duration_unit IS NULL OR duration_unit IN ('Hours', 'Days', 'Weeks', 'Months', 'Years')),
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- 4. Safe Data Migration:
-- Populate visit_complaints from existing legacy complaints_history rows without destroying historical data.
INSERT INTO visit_complaints (id, visit_id, complaint_text, duration_value, duration_unit, sort_order)
SELECT 
    'vcmp_' || substr(ch.id, 5) || '_' || abs(random() % 10000),
    ch.visit_id,
    trim(ch.chief_complaint),
    NULL,
    NULL,
    0
FROM complaints_history ch
WHERE ch.chief_complaint IS NOT NULL 
  AND length(trim(ch.chief_complaint)) > 0
  AND NOT EXISTS (
      SELECT 1 FROM visit_complaints vc WHERE vc.visit_id = ch.visit_id
  );

-- 5. Indexes for high-performance medicine search and clinical references lookup
CREATE INDEX IF NOT EXISTS idx_medicines_name_lower
    ON medicines(name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_medicines_code
    ON medicines(code);

CREATE INDEX IF NOT EXISTS idx_clinical_ref_medicine
    ON clinical_references(medicine_id);

CREATE INDEX IF NOT EXISTS idx_clinical_ref_namc
    ON clinical_references(namc_code);

CREATE INDEX IF NOT EXISTS idx_clinical_ref_status
    ON clinical_references(validation_status);

CREATE INDEX IF NOT EXISTS idx_visit_complaints_visit_order
    ON visit_complaints(visit_id, sort_order);
