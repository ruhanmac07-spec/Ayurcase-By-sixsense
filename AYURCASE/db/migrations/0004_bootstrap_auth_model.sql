-- =========================================================
-- AYURCASE Migration 0004: Auth Production Model
-- Adds phone column to users table for tracking registered
-- phone number used as initial password source.
-- Safe idempotent ALTER TABLE — no data is destroyed.
-- =========================================================

ALTER TABLE users ADD COLUMN phone TEXT;
