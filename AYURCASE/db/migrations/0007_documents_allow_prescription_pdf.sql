-- Migration 0007: Update documents table CHECK constraint to include 'PRESCRIPTION_PDF'
PRAGMA foreign_keys = OFF;

CREATE TABLE documents_new (
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

INSERT INTO documents_new (id, visit_id, document_type, file_path, file_hash, generated_by, generated_at)
SELECT id, visit_id, document_type, file_path, file_hash, generated_by, generated_at
FROM documents;

DROP TABLE documents;

ALTER TABLE documents_new RENAME TO documents;

CREATE INDEX IF NOT EXISTS idx_documents_visit
    ON documents(visit_id);

PRAGMA foreign_keys = ON;
