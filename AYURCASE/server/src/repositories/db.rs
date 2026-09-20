use crate::auth::hash_password;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::time::Duration;
use tracing::info;

pub type DbPool = Pool<Sqlite>;

pub async fn init_pool(database_url: &str) -> Result<DbPool, sqlx::Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .after_connect(|conn, _| {
            Box::pin(async move {
                sqlx::query("PRAGMA foreign_keys = ON;")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA journal_mode = WAL;")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA busy_timeout = 5000;")
                    .execute(&mut *conn)
                    .await?;
                Ok(())
            })
        })
        .connect(database_url)
        .await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &DbPool) -> Result<(), sqlx::Error> {
    let migration_1_sql = include_str!("../../../db/migrations/0001_initial_schema.sql");
    sqlx::raw_sql(migration_1_sql).execute(pool).await?;

    // Safe column additions for existing medicines schema
    let _ = sqlx::query("ALTER TABLE medicines ADD COLUMN name_hi TEXT;").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE medicines ADD COLUMN english_name TEXT;").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE medicines ADD COLUMN sanskrit_name TEXT;").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE medicines ADD COLUMN source TEXT;").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE medicines ADD COLUMN source_reference TEXT;").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE medicines ADD COLUMN validation_status TEXT DEFAULT 'ACTIVE';").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE medicines ADD COLUMN notes TEXT;").execute(pool).await;

    let migration_2_sql = include_str!("../../../db/migrations/0002_medicine_provenance_and_repeatable_complaints.sql");
    sqlx::raw_sql(migration_2_sql).execute(pool).await?;

    let migration_3_sql = include_str!("../../../db/migrations/0003_populate_bams_ccras_diagnosis_catalog.sql");
    sqlx::raw_sql(migration_3_sql).execute(pool).await?;

    // Migration 0004: Add phone column (idempotent — ignored if already exists)
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN phone TEXT;").execute(pool).await;

    // Migration 0004b: Add qualification column (idempotent — ignored if already exists)
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN qualification TEXT;").execute(pool).await;

    // Migration 0005: OPD Number & Visit Sequence Reform (idempotent column additions)
    let _ = sqlx::query("ALTER TABLE visits ADD COLUMN opd_number TEXT;").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE visits ADD COLUMN patient_visit_seq INTEGER;").execute(pool).await;
    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_visits_workspace_opd ON visits(workspace_id, opd_number);").execute(pool).await;
    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_visits_patient_seq ON visits(patient_id, patient_visit_seq);").execute(pool).await;

    // Back-fill patient_visit_seq for any existing visits
    let _ = sqlx::query(
        "UPDATE visits
         SET patient_visit_seq = (
             SELECT COUNT(*)
             FROM visits v2
             WHERE v2.patient_id = visits.patient_id
               AND (
                     v2.visit_date < visits.visit_date
                     OR (v2.visit_date = visits.visit_date AND v2.created_at <= visits.created_at)
                   )
         )
         WHERE patient_visit_seq IS NULL;"
    ).execute(pool).await;

    // Back-fill opd_number for any existing visits
    let _ = sqlx::query(
        "UPDATE visits
         SET opd_number = (
             SELECT
                 p.patient_code || '/' ||
                 strftime('%d', visits.visit_date) || '/' ||
                 strftime('%m', visits.visit_date) || '/' ||
                 strftime('%Y', visits.visit_date)
             FROM patients p
             WHERE p.id = visits.patient_id
         )
         WHERE opd_number IS NULL;"
    ).execute(pool).await;

    // Migration 0006: Reform visit uniqueness to patient_id + visit_number
    let check_constraint: Option<(String,)> = sqlx::query_as(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='visits' AND sql LIKE '%UNIQUE (workspace_id, visit_number)%'"
    )
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    if check_constraint.is_some() {
        let migration_6_sql = include_str!("../../../db/migrations/0006_visits_unique_patient_seq.sql");
        sqlx::raw_sql(migration_6_sql).execute(pool).await?;
        info!("Applied migration 0006: converted visits constraint to UNIQUE (patient_id, visit_number)");
    }

    // Migration 0007: Reform documents table CHECK constraint to allow 'PRESCRIPTION_PDF'
    let check_doc_constraint: Option<(String,)> = sqlx::query_as(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='documents' AND sql NOT LIKE '%PRESCRIPTION_PDF%'"
    )
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    if check_doc_constraint.is_some() {
        let migration_7_sql = include_str!("../../../db/migrations/0007_documents_allow_prescription_pdf.sql");
        sqlx::raw_sql(migration_7_sql).execute(pool).await?;
        info!("Applied migration 0007: updated documents table CHECK constraint to allow PRESCRIPTION_PDF");
    }

    info!("Database migrations 0001–0007 executed successfully.");
    Ok(())
}

/// Ensures the bootstrap Authority account is correctly configured on every server startup.
/// 
/// Rules:
/// - If NO AUTHORITY user exists → create `admin` with password `"0000"` and `must_change_password = 1`.
/// - If an AUTHORITY user exists with the old dev password `"password123"` → migrate it to `"0000"`
///   and set `must_change_password = 1` so the admin is forced to change on next login.
/// - If the AUTHORITY user has already changed their password → no-op.
pub async fn ensure_bootstrap_admin(pool: &DbPool) -> Result<(), Box<dyn std::error::Error>> {
    use crate::auth::{hash_password, verify_password};

    let authority: Option<(String, String, i64)> = sqlx::query_as(
        "SELECT id, password_hash, must_change_password FROM users WHERE role = 'AUTHORITY' LIMIT 1"
    )
    .fetch_optional(pool)
    .await?;

    match authority {
        None => {
            // Fresh database — create bootstrap admin with default password 0000
            let hash = hash_password("0000")?;
            sqlx::query(
                "INSERT INTO users (id, workspace_id, username, full_name, role, password_hash, status, must_change_password)
                 VALUES ('usr_admin', NULL, 'admin', 'System Administrator', 'AUTHORITY', ?, 'ACTIVE', 1)"
            )
            .bind(&hash)
            .execute(pool)
            .await?;
            info!("Bootstrap: created Authority account 'admin' with default password. Must change on first login.");
        }
        Some((id, existing_hash, must_change)) => {
            // Check if the admin is still using the old dev password
            let still_dev = verify_password("password123", &existing_hash).unwrap_or(false);
            if still_dev {
                let new_hash = hash_password("0000")?;
                sqlx::query(
                    "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?"
                )
                .bind(&new_hash)
                .bind(&id)
                .execute(pool)
                .await?;
                info!("Bootstrap: migrated Authority account from dev password to '0000'. Must change on next login.");
            } else if must_change == 0 {
                // Already set a real password — nothing to do
                info!("Bootstrap: Authority account already configured.");
            } else {
                info!("Bootstrap: Authority account pending first-login password change.");
            }
        }
    }

    Ok(())
}

pub async fn seed_initial_data_if_empty(pool: &DbPool) -> Result<(), Box<dyn std::error::Error>> {
    // 0. Ensure clinical reference datasets are seeded idempotently
    crate::repositories::seed_dataset::seed_clinical_datasets_if_empty(pool).await?;

    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;

    if user_count.0 > 0 {
        return Ok(());
    }

    info!("Database is empty. Seeding initial authority, workspace, staff, and validated clinical master data...");

    // 1. Initial Workspaces (Departments)
    let ws_id = "ws_kayachikitsa";
    sqlx::query(
        "INSERT INTO workspaces (id, code, name, description, status) 
         VALUES (?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(ws_id)
    .bind("KAYA")
    .bind("Kayachikitsa")
    .bind("General Ayurvedic internal medicine and wellness department")
    .execute(pool)
    .await?;

    let ws_pancha_id = "ws_panchakarma";
    sqlx::query(
        "INSERT INTO workspaces (id, code, name, description, status) 
         VALUES (?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(ws_pancha_id)
    .bind("PANCHA")
    .bind("Panchakarma Therapy Unit")
    .bind("Therapeutic detoxification, snehana, swedana, and shirodhara procedures department")
    .execute(pool)
    .await?;

    // 2. Default Authority user (admin / password123) and authority alias
    let auth_hash = hash_password("password123")?;
    sqlx::query(
        "INSERT INTO users (id, workspace_id, username, full_name, role, password_hash, status, must_change_password)
         VALUES (?, ?, ?, ?, 'AUTHORITY', ?, 'ACTIVE', 0)"
    )
    .bind("usr_admin")
    .bind(None::<String>)
    .bind("admin")
    .bind("System Administrator")
    .bind(&auth_hash)
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO users (id, workspace_id, username, full_name, role, password_hash, status, must_change_password)
         VALUES (?, ?, ?, ?, 'AUTHORITY', ?, 'ACTIVE', 0)"
    )
    .bind("usr_authority")
    .bind(None::<String>)
    .bind("authority")
    .bind("Authority Officer")
    .bind(&auth_hash)
    .execute(pool)
    .await?;

    // 3. Clinical Staff for Kayachikitsa Workspace (dr_sharma, asst_priya)
    let staff_hash = hash_password("password123")?;
    sqlx::query(
        "INSERT INTO users (id, workspace_id, username, full_name, role, password_hash, status, must_change_password, qualification)
         VALUES (?, ?, ?, ?, 'DOCTOR', ?, 'ACTIVE', 0, ?)"
    )
    .bind("usr_dr_sharma")
    .bind(ws_id)
    .bind("dr_sharma")
    .bind("Dr. Sharma")
    .bind(&staff_hash)
    .bind("BAMS, MD (Ayu)")
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO users (id, workspace_id, username, full_name, role, password_hash, status, must_change_password)
         VALUES (?, ?, ?, ?, 'ASSISTANT', ?, 'ACTIVE', 0)"
    )
    .bind("usr_asst_priya")
    .bind(ws_id)
    .bind("asst_priya")
    .bind("Priya Sharma")
    .bind(&staff_hash)
    .execute(pool)
    .await?;

    // 4. Clinical Staff for Panchakarma Workspace (dr_varu, asst_kavita)
    sqlx::query(
        "INSERT INTO users (id, workspace_id, username, full_name, role, password_hash, status, must_change_password, qualification)
         VALUES (?, ?, ?, ?, 'DOCTOR', ?, 'ACTIVE', 0, ?)"
    )
    .bind("usr_dr_varu")
    .bind(ws_pancha_id)
    .bind("dr_varu")
    .bind("Dr. Varu")
    .bind(&staff_hash)
    .bind("BAMS, MD (Pancha)")
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO users (id, workspace_id, username, full_name, role, password_hash, status, must_change_password)
         VALUES (?, ?, ?, ?, 'ASSISTANT', ?, 'ACTIVE', 0)"
    )
    .bind("usr_asst_kavita")
    .bind(ws_pancha_id)
    .bind("asst_kavita")
    .bind("Kavita Verma")
    .bind(&staff_hash)
    .execute(pool)
    .await?;

    // 5. Seed Diagnosis Master Data (Labeled SYNTHETIC / DEMO as mandated)
    let diag_kasa = "diag_kasa_01";
    sqlx::query(
        "INSERT INTO diagnosis_catalog (id, code, name, description, status)
         VALUES (?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(diag_kasa)
    .bind("DIAG-KASA-01")
    .bind("Kasa (Cough / Bronchial Congestion)")
    .bind("[SYNTHETIC/DEMO DATA] Acute and chronic respiratory cough")
    .execute(pool)
    .await?;

    let diag_jvara = "diag_jvara_01";
    sqlx::query(
        "INSERT INTO diagnosis_catalog (id, code, name, description, status)
         VALUES (?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(diag_jvara)
    .bind("DIAG-JVARA-01")
    .bind("Jvara (Fever / Pyrexia)")
    .bind("[SYNTHETIC/DEMO DATA] Febrile condition of Pitta-Kapha origin")
    .execute(pool)
    .await?;

    let diag_pratisyaya = "diag_pratisyaya_01";
    sqlx::query(
        "INSERT INTO diagnosis_catalog (id, code, name, description, status)
         VALUES (?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(diag_pratisyaya)
    .bind("DIAG-PRATISYAYA-01")
    .bind("Pratisyaya (Rhinitis / Sinusitis)")
    .bind("[SYNTHETIC/DEMO DATA] Upper respiratory congestion - NO VALIDATED RULE SEEDED")
    .execute(pool)
    .await?;

    // 6. Seed Medicine Master Data (Bilingual English + Hindi)
    let med_sito = "med_sitopaladi";
    sqlx::query(
        "INSERT INTO medicines (id, code, name, name_hi, form, strength, description, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(med_sito)
    .bind("MED-SITO-01")
    .bind("Sitopaladi Churna")
    .bind("सीतोपलादि चूर्ण")
    .bind("Churna")
    .bind("50g")
    .bind("[SYNTHETIC/DEMO] Classical formulation for respiratory support")
    .execute(pool)
    .await?;

    let med_vasa = "med_vasavaleha";
    sqlx::query(
        "INSERT INTO medicines (id, code, name, name_hi, form, strength, description, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(med_vasa)
    .bind("MED-VASA-01")
    .bind("Vasavaleha")
    .bind("वासावलेह")
    .bind("Avaleha")
    .bind("100g")
    .bind("[SYNTHETIC/DEMO] Bronchodilator herbal paste")
    .execute(pool)
    .await?;

    let med_sudarshan = "med_sudarshan";
    sqlx::query(
        "INSERT INTO medicines (id, code, name, name_hi, form, strength, description, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(med_sudarshan)
    .bind("MED-SUDARSHAN-01")
    .bind("Maha Sudarshan Vati")
    .bind("महासुदर्शन वटी")
    .bind("Vati/Tablet")
    .bind("500mg")
    .bind("[SYNTHETIC/DEMO] Antipyretic herbal tablet formulation")
    .execute(pool)
    .await?;

    let med_ashwa = "med_ashwagandha";
    sqlx::query(
        "INSERT INTO medicines (id, code, name, name_hi, form, strength, description, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(med_ashwa)
    .bind("MED-ASHWA-01")
    .bind("Ashwagandha Churna")
    .bind("अश्वगंधा चूर्ण")
    .bind("Churna")
    .bind("100g")
    .bind("[SYNTHETIC/DEMO] Classical Rasayana formulation for vitality and Vata pacification")
    .execute(pool)
    .await?;

    let med_yoga = "med_yogaraja";
    sqlx::query(
        "INSERT INTO medicines (id, code, name, name_hi, form, strength, description, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(med_yoga)
    .bind("MED-YOGA-01")
    .bind("Yogaraja Guggulu")
    .bind("योगराज गुग्गुलु")
    .bind("Vati/Tablet")
    .bind("500mg")
    .bind("[SYNTHETIC/DEMO] Classical formulation for musculoskeletal comfort and Sandhivata")
    .execute(pool)
    .await?;

    let med_triphala = "med_triphala";
    sqlx::query(
        "INSERT INTO medicines (id, code, name, name_hi, form, strength, description, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')"
    )
    .bind(med_triphala)
    .bind("MED-TRIPH-01")
    .bind("Triphala Churna")
    .bind("त्रिफला चूर्ण")
    .bind("Churna")
    .bind("100g")
    .bind("[SYNTHETIC/DEMO] Classical digestive and systemic detoxifying Rasayana")
    .execute(pool)
    .await?;

    // 7. Seed Validated Clinical Rule for Kasa (Version 1)
    let rule_kasa = "rule_kasa_v1";
    sqlx::query(
        "INSERT INTO clinical_rules (id, diagnosis_id, rule_code, version, criteria_json, anupana, pathya, apathya, status, validated_by)
         VALUES (?, ?, ?, 1, '{}', ?, ?, ?, 'ACTIVE', 'usr_admin')"
    )
    .bind(rule_kasa)
    .bind(diag_kasa)
    .bind("RULE-KASA-V1")
    .bind("Madhu (Honey) or warm water")
    .bind("Warm water, light soup, fresh ginger infusion")
    .bind("Cold water, curd, heavy oily fried food, daytime sleep")
    .execute(pool)
    .await?;

    // Rule items for Kasa rule
    sqlx::query(
        "INSERT INTO clinical_rule_items (id, rule_id, medicine_id, dosage_text, frequency_text, duration_text, instructions_text)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind("item_kasa_1")
    .bind(rule_kasa)
    .bind(med_sito)
    .bind("3 grams")
    .bind("Twice daily")
    .bind("7 days")
    .bind("Mix thoroughly with 1 tsp organic honey after food")
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO clinical_rule_items (id, rule_id, medicine_id, dosage_text, frequency_text, duration_text, instructions_text)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind("item_kasa_2")
    .bind(rule_kasa)
    .bind(med_vasa)
    .bind("5 grams")
    .bind("Twice daily")
    .bind("7 days")
    .bind("Take with warm water before sleep")
    .execute(pool)
    .await?;

    // 8. Seed Validated Clinical Rule for Jvara (Version 1)
    let rule_jvara = "rule_jvara_v1";
    sqlx::query(
        "INSERT INTO clinical_rules (id, diagnosis_id, rule_code, version, criteria_json, anupana, pathya, apathya, status, validated_by)
         VALUES (?, ?, ?, 1, '{}', ?, ?, ?, 'ACTIVE', 'usr_admin')"
    )
    .bind(rule_jvara)
    .bind(diag_jvara)
    .bind("RULE-JVARA-V1")
    .bind("Lukewarm boiled water")
    .bind("Shadang Paniya, boiled moong dal soup, light steamed rice")
    .bind("Heavy solid meals, refrigerated items, physical exertion")
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO clinical_rule_items (id, rule_id, medicine_id, dosage_text, frequency_text, duration_text, instructions_text)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind("item_jvara_1")
    .bind(rule_jvara)
    .bind(med_sudarshan)
    .bind("2 tablets (500mg each)")
    .bind("Thrice daily")
    .bind("5 days")
    .bind("Swallow with lukewarm boiled water after light meal")
    .execute(pool)
    .await?;

    // NOTE: Pratisyaya (DIAG-PRATISYAYA-01) intentionally has NO clinical rule,
    // explicitly providing the test case for "No validated recommendation available for this diagnosis."

    info!("Initial seed data successfully populated.");
    Ok(())
}
