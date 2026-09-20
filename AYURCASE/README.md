# AYURCASE Phase 2 — Production LAN Clinical Workstation & SIXSENSE Server

AYURCASE Phase 2 is an air-gapped, privacy-first Ayurvedic clinical documentation and workstation system. It operates exclusively over a secure clinic Local Area Network (LAN) with **zero internet**, **zero cloud**, and **zero external LLM dependencies**.

---

## Architectural Invariants & Guarantees

1. **Strict Server Authority**: Central SQLite database owned exclusively by the macOS SIXSENSE Server. Windows desktop clients never touch the database directly; all operations flow through the authenticated, versioned `/api/v1` LAN REST API.
2. **Server-Enforced RBAC & Workspace Isolation**: Client UI restrictions are purely ergonomic. The server cryptographically validates identity, user status, role permissions, and workspace scoping on every single request.
3. **Manual Physician-Controlled Diagnosis**: No autonomous AI diagnoses. Diagnoses are manual, conscious decisions recorded by the physician.
4. **Deterministic Clinical Rule Engine**: Zero black-box LLMs. Clinical assistance recommendations are evaluated deterministically against approved classical AYUSH monographs (CCRAS, Ayurvedic Pharmacopoeia of India). If no rule is codified, the system issues a calm, non-blocking fallback message: *"No validated recommendation available for this diagnosis."*
5. **Save-First Document Invariant**: Encounters and prescriptions are locked and persisted transactionally in the database *before* case sheet generation. If PDF rendering or printing fails, clinical state remains safely recorded.
6. **Verifiable Online Backups**: SQLite `VACUUM INTO` snapshots with calculated SHA-256 checksums provide non-blocking backup execution during active clinic hours.

---

## Monorepo Layout

```
AYURCASE/
├── server/                          # SIXSENSE Server (Rust / Axum / SQLite / SQLx)
│   ├── Cargo.toml                   # Server dependencies
│   ├── src/
│   │   ├── api/                     # Versioned /api/v1 routes & handlers
│   │   ├── auth/                    # Argon2id password hashing & OsRng session tokens
│   │   ├── authorization/           # Server-side RBAC & workspace isolation
│   │   ├── repositories/            # SQLite connection pool & migrations
│   │   ├── rules/                   # Deterministic clinical rule evaluator
│   │   ├── audit/                   # Structured tamper-evident audit logger
│   │   ├── backup/                  # Atomic VACUUM INTO & SHA-256 verification
│   │   ├── documents/               # Clinical case sheet document generator
│   │   └── services/                # Core business services
│   └── tests/                       # Automated integration & API test suites
│
├── client/                          # AYURCASE Desktop Client (Tauri 2 + React + TypeScript)
│   ├── src-tauri/                   # Rust desktop wrapper, windowing & system tray
│   ├── src/
│   │   ├── api/                     # LAN client with automatic token injection
│   │   ├── components/              # Calm clinical design system components
│   │   ├── features/
│   │   │   ├── auth/                # Login & LAN IP configuration dialog
│   │   │   ├── assistant/           # Intake, search, deduplication & vitals triage
│   │   │   ├── doctor/              # Queue, consultation workspace & prescription builder
│   │   │   ├── authority/           # Dashboard, workspaces, staff & backup manager
│   │   │   └── history/             # Longitudinal medical record timeline
│   │   ├── state/                   # AuthContext & NetworkContext (10s heartbeat)
│   │   └── __tests__/               # Vitest component & API test suites
│   └── package.json                 # Frontend dependencies
│
├── db/migrations/                   # Versioned SQL migrations (20 tables, 17 indexes)
│   └── 0001_initial_schema.sql
├── deploy/                          # macOS deployment scripts & launchd daemon
│   └── mac/
│       ├── com.sixsense.server.plist
│       ├── install-service.sh
│       └── start-server.sh
└── docs/                            # Architectural documentation & runbooks
    ├── decisions/                   # Architectural Decision Records (ADR-001 - ADR-015)
    ├── lan-deployment-guide.md      # LAN topology & multi-client setup
    └── backup-recovery-runbook.md   # Disaster recovery & SHA-256 verification
```

---

## Default Seed Credentials (Synthetic Demo Data)

| Role | Username | Password | Assigned Workspace | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **System Authority** | `admin` | `password123` | *Global* | Full System, Workspaces, Backups, Audit |
| **Doctor** | `dr_sharma` | `password123` | `KAYA` (Kayachikitsa) | Clinical Encounters, Queue, Prescriptions |
| **Assistant / Staff** | `asst_priya` | `password123` | `KAYA` (Kayachikitsa) | Intake, Registration, Queue Routing |

*All passwords are encrypted with Argon2id.*

---

## Quick Start (Local Development & Testing)

### Prerequisites
- **Rust toolchain** (1.80+ / cargo)
- **Node.js** (v20+ / npm)

### 1. Start SIXSENSE Central Server
```bash
cd AYURCASE/server
cargo run
```
The server binds to `0.0.0.0:8443`, automatically applies all database migrations, seeds standard classical diagnoses (`AYU_AMAVATA`, `AYU_SANDHIVATA`, etc.), standard medicines, and validated rules.

Verify server health:
```bash
curl http://localhost:8443/api/v1/health
```

### 2. Start AYURCASE Client
In a separate terminal:
```bash
cd AYURCASE/client
npm run dev
```
Open `http://localhost:1420` in your browser, or run `npm run tauri dev` to launch the native desktop window.

---

## Automated Test Results

### Server Test Suite (`cargo test`)
10 tests covering database migration, seeding, authentication, RBAC workspace scoping, clinical workflow, deterministic rules, and backup verification:
```
test test_api_health_endpoint ... ok
test test_api_login_and_protected_route ... ok
test test_api_doctor_queue_and_rule_evaluation ... ok
test test_deterministic_clinical_rule_engine ... ok
test test_database_initialization_and_seeding ... ok
test test_end_to_end_clinical_workflow ... ok
test test_backup_execution_and_integrity_verification ... ok
test test_rbac_and_workspace_scoping ... ok
test test_deactivated_user_cannot_access ... ok
test test_authentication_and_session_validation ... ok

test result: ok. 10 passed; 0 failed
```

### Client Test Suite (`npm test`)
8 tests covering LAN configuration, token management, component rendering, and rule provenance invariants:
```
✓ src/__tests__/rules_provenance.test.ts (2 tests)
✓ src/__tests__/client_api.test.ts (4 tests)
✓ src/__tests__/auth_components.test.tsx (2 tests)

Test Files  3 passed (3)
Tests       8 passed (8)
```
