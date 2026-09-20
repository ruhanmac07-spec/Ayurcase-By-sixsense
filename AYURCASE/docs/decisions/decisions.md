# AYURCASE Phase 2 — Architectural & Design Decisions Register (Phase 0)

This document records the architectural and design decisions for AYURCASE Phase 2 (SIXSENSE Server + Windows AYURCASE Client over LAN), as mandated by the Phase 2 LAN PRD, Application Architecture, Database Design, Technical Stack Recommendation, and Client UI/UX Design Specification.

---

## 1. Product Identity & System Boundary
- **Decision ADR-001: Naming & Scope**
  - **Context**: Ensure consistent naming and prevent confusion between client product and server engine.
  - **Decision**:
    - **AYURCASE**: The user-facing clinical desktop application (target: Windows client installed natively).
    - **SIXSENSE Server**: The authoritative, centralized backend service (target: macOS / Mac M5).
    - **SIXSENSE**: The technology/infrastructure brand, not the clinical product.
  - **Status**: Confirmed.

- **Decision ADR-002: Trust Boundary & Zero Direct Database Access**
  - **Context**: Multiple LAN clients access patient and clinical data.
  - **Decision**: SIXSENSE Server is the sole authority for database access, authentication, authorization, business rules, document generation, and backups. AYURCASE clients communicate exclusively via versioned HTTPS JSON API (`/api/v1`). Clients **never** access SQLite directly, receive connection strings, or execute arbitrary queries.
  - **Status**: Confirmed.

- **Decision ADR-003: Core Local Network Operation (Zero Internet Dependency)**
  - **Context**: Clinics may operate with intermittent or no WAN connectivity.
  - **Decision**: The entire system operates over local Wi-Fi or Ethernet LAN. No cloud backend, internet DNS, or external API is required for core clinical intake, consultation, prescription, or document printing.
  - **Status**: Confirmed.

---

## 2. Clinical Safety & Autonomous AI Prohibition
- **Decision ADR-004: Manual Doctor-Controlled Diagnosis**
  - **Context**: Role of software in clinical diagnostic decision-making.
  - **Decision**: Diagnosis is strictly manual and doctor-selected. The system **shall not** autonomously infer, diagnose, or override doctor input.
  - **Status**: Confirmed.

- **Decision ADR-005: Deterministic Validated Assistance vs. LLM**
  - **Context**: Assisting physicians with Ayurvedic prescribing.
  - **Decision**:
    - If a validated, approved clinical rule exists for the selected diagnosis in the database, the server returns deterministic suggestions annotated with rule code and version provenance.
    - If no validated rule exists, the system returns a calm, explicit neutral message: *"No validated recommendation available for this diagnosis."*
    - **No LLM, neural network, or internet-based AI service** shall be invoked in the clinical rule path.
  - **Status**: Confirmed.

- **Decision ADR-006: Preservation of Unvalidated AYUSH Fields & Domain Datasets**
  - **Context**: The source documents explicitly state that exact AYUSH examination fields (Prakriti, Vikriti, Nadi, Agni, etc.) and complete disease/medicine catalogues remain pending qualified clinical domain validation.
  - **Decision**: The schema uses a flexible, version-controlled JSON container (`data_json` with `json_valid(data_json)` check + `schema_version`) for AYUSH case-taking. The team will NOT invent speculative clinical schemas or unvalidated medical taxonomy. Synthetic/demo master data used in tests will be clearly labeled as synthetic.
  - **Status**: Confirmed.

- **Decision ADR-007: Clinical Save Precedes Document Generation**
  - **Context**: Case sheet PDF generation and printing.
  - **Decision**: The clinical record (consultation, diagnoses, prescription) must be successfully persisted in the database *before* PDF generation is initiated. If PDF rendering or printing fails, the clinical record remains intact, and the user is provided with an explicit retry option.
  - **Status**: Confirmed.

---

## 3. Security, Authentication & Multi-Tenancy (Workspaces)
- **Decision ADR-008: Password Hashing & Server Sessions**
  - **Context**: Securing user accounts on a local multi-user network.
  - **Decision**: Passwords are hashed exclusively server-side using Argon2id (`argon2` crate). Sessions use cryptographically secure 256-bit random tokens (`OsRng`), stored as SHA-256 hashes in the `sessions` table. Passwords are never logged or stored in plaintext.
  - **Status**: Confirmed.

- **Decision ADR-009: Server-Side RBAC & Workspace Scoping**
  - **Context**: Prevent unauthorized data access across departments or roles.
  - **Decision**: Roles are `AUTHORITY`, `DOCTOR`, and `ASSISTANT`. Every API request checks session validity, user active status, role permission, and workspace membership. Client-side UI role visibility is treated as UX only, never as security.
  - **Status**: Confirmed.

- **Decision ADR-010: Workspace Soft-Deletion**
  - **Context**: Retaining medical and operational history when departments close.
  - **Decision**: Workspaces are never physically deleted (`DELETE FROM workspaces`); instead, they transition to `DEACTIVATED` with `deactivated_at` recorded, preserving foreign key integrity (`RESTRICT`).
  - **Status**: Confirmed.

---

## 4. Operational & Failure Resilience
- **Decision ADR-011: Server Discovery & Addressing**
  - **Context**: How AYURCASE clients find the SIXSENSE Server on the LAN.
  - **Decision**: The initial controlled Phase 2 deployment uses a configured server address (e.g. `https://192.168.1.50:8443`) stored in client settings with an integrated "Test Connection" diagnostic tool. Automatic mDNS / Bonjour discovery is left for future enhancement.
  - **Status**: Confirmed.

- **Decision ADR-012: Network Outage & Reconnect Behavior**
  - **Context**: Wi-Fi drops or server restarts while users are working.
  - **Decision**: The client displays a persistent, non-blocking amber reconnecting banner. In-flight forms (intake, consultation notes) are preserved in client-side memory/session storage to prevent data loss. Operations requiring the server are disabled with clear messaging. When the server becomes reachable, the client automatically re-validates the session.
  - **Status**: Confirmed.

- **Decision ADR-013: Safe Retries & Idempotency**
  - **Context**: Network drop after submission might cause duplicate patients or visits.
  - **Decision**: Visit creation and patient intake endpoints accept an optional `Idempotency-Key` or enforce database uniqueness (`workspace_id + patient_code`, `workspace_id + visit_number`) so duplicate submissions are cleanly prevented and safe to retry.
  - **Status**: Confirmed.

- **Decision ADR-014: Backup Integrity & Verification**
  - **Context**: Centralized database durability.
  - **Decision**: Backups utilize the SQLite Online Backup API (`VACUUM INTO` or atomic file copy under read lock) to guarantee consistency without server shutdown. Each backup calculates a SHA-256 checksum, recorded in `backup_records`, and provides an Authority verification command. Google Drive is optional and not a runtime dependency.
  - **Status**: Confirmed.

---

## 5. UI/UX Design Direction
- **Decision ADR-015: Clinical Desktop Aesthetics**
  - **Context**: Brand identity and information density.
  - **Decision**: Professional, calm clinical workstation aesthetic:
    - Primary CTA / Active Nav: Deep botanical green (`#1b4332`, `#2d6a4f`)
    - Subtle Accents / Badges: Muted sage / leaf green (`#52b788`, `#74c69d`)
    - Background Canvas: Warm off-white / light neutral (`#f8f9fa`)
    - Text: Deep charcoal (`#111827`, `#1f2937`)
    - Strictly prohibited: Neon green, glowing borders, cyberpunk themes, glassmorphism-heavy layouts, gaming interfaces, and AI gimmicks.
  - **Status**: Confirmed.
