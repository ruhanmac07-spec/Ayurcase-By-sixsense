-- =========================================================
-- AYURCASE Migration 0005 — OPD Number & Visit Sequence Reform
-- Adds per-visit OPD number and per-patient visit sequence counter.
-- The internal visit UUID (id) is NOT changed.
-- =========================================================

PRAGMA foreign_keys = ON;

-- 1. Add opd_number: human-readable per-visit OPD identifier.
--    Format: PATIENT_CODE/DD/MM/YYYY (e.g. 00001/17/09/2026)
--    Generated server-side at visit creation. Never entered by user.
ALTER TABLE visits ADD COLUMN opd_number TEXT;

-- 2. Add patient_visit_seq: per-patient chronological visit counter.
--    1 = first visit, 2 = second visit, etc.
--    Displayed as zero-padded string: 01, 02, 03...
ALTER TABLE visits ADD COLUMN patient_visit_seq INTEGER;

-- 3. Indexes for OPD lookup and patient history ordering
CREATE INDEX IF NOT EXISTS idx_visits_workspace_opd
    ON visits(workspace_id, opd_number);

CREATE INDEX IF NOT EXISTS idx_visits_patient_seq
    ON visits(patient_id, patient_visit_seq);

-- 4. Back-fill patient_visit_seq for all existing visits
--    Assign sequence numbers ordered by (visit_date ASC, created_at ASC) per patient.
--    This uses a window function available in SQLite >= 3.25.
UPDATE visits
SET patient_visit_seq = (
    SELECT COUNT(*)
    FROM visits v2
    WHERE v2.patient_id = visits.patient_id
      AND (
            v2.visit_date < visits.visit_date
            OR (v2.visit_date = visits.visit_date AND v2.created_at <= visits.created_at)
          )
)
WHERE patient_visit_seq IS NULL;

-- 5. Back-fill opd_number for existing visits using patient_code and visit_date.
--    Format: PATIENT_CODE/DD/MM/YYYY
--    SQLite strftime parses the ISO date portion safely.
UPDATE visits
SET opd_number = (
    SELECT
        p.patient_code || '/' ||
        strftime('%d', visits.visit_date) || '/' ||
        strftime('%m', visits.visit_date) || '/' ||
        strftime('%Y', visits.visit_date)
    FROM patients p
    WHERE p.id = visits.patient_id
)
WHERE opd_number IS NULL;
