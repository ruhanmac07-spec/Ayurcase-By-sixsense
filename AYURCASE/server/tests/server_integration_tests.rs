use sixsense_server::{
    backup::BackupService,
    documents::DocumentService,
    models::{
        diagnosis::AttachDiagnosisRequest,
        patient::CreatePatientRequest,
        prescription::{PrescriptionItemInput, SavePrescriptionDraftRequest},
        session::LoginRequest,
        user::CreateUserRequest,
        visit::CreateVisitIntakeRequest,
        workspace::CreateWorkspaceRequest,
    },
    repositories::{init_pool, run_migrations, seed_initial_data_if_empty},
    rules::ClinicalRuleEngine,
    services::{
        AuthService, ConsultationService, IntelligenceService, PatientService,
        PatientStorageService, PrescriptionService, QueueService, UserService, VisitService,
        WorkspaceService,
    },
};
use tempfile::tempdir;

async fn setup_test_db(dir: &tempfile::TempDir, name: &str) -> sqlx::SqlitePool {
    let db_path = dir.path().join(format!("{}.db", name));
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());
    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();
    pool
}

#[tokio::test]
async fn test_database_initialization_and_seeding() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_ayurcase.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    // Verify seeded users exist
    let users = UserService::list(&pool, None).await.unwrap();
    assert!(users.len() >= 5);
    assert!(users.iter().any(|u| u.username == "admin" && u.role == "AUTHORITY"));
    assert!(users.iter().any(|u| u.username == "dr_sharma" && u.role == "DOCTOR"));
    assert!(users.iter().any(|u| u.username == "asst_priya" && u.role == "ASSISTANT"));
    assert!(users.iter().any(|u| u.username == "dr_varu" && u.role == "DOCTOR"));
    assert!(users.iter().any(|u| u.username == "asst_kavita" && u.role == "ASSISTANT"));

    // Verify seeded workspaces exist
    let workspaces = WorkspaceService::list(&pool).await.unwrap();
    assert!(workspaces.len() >= 2);
    assert!(workspaces.iter().any(|w| w.code == "KAYA"));
    assert!(workspaces.iter().any(|w| w.code == "PANCHA"));
}

#[tokio::test]
async fn test_authentication_and_session_validation() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_auth.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    // 1. Successful login
    let login_res = AuthService::login(
        &pool,
        LoginRequest {
            username: "dr_sharma".to_string(),
            password: "password123".to_string(),
        },
        8,
    )
    .await
    .unwrap();

    assert_eq!(login_res.user.role, "DOCTOR");
    assert!(!login_res.token.is_empty());

    // 2. Validate active session
    let auth_user = AuthService::validate_session(&pool, &login_res.token)
        .await
        .unwrap();
    assert_eq!(auth_user.username, "dr_sharma");
    assert_eq!(auth_user.role, "DOCTOR");

    // 3. Failed login: wrong password
    let failed = AuthService::login(
        &pool,
        LoginRequest {
            username: "dr_sharma".to_string(),
            password: "wrong_password".to_string(),
        },
        8,
    )
    .await;
    assert!(failed.is_err());

    // 4. Logout invalidates session
    AuthService::logout(&pool, &login_res.token).await.unwrap();
    let after_logout = AuthService::validate_session(&pool, &login_res.token).await;
    assert!(after_logout.is_err());
}

#[tokio::test]
async fn test_deactivated_user_cannot_access() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_deact.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    // Login as assistant
    let login = AuthService::login(
        &pool,
        LoginRequest {
            username: "asst_priya".to_string(),
            password: "password123".to_string(),
        },
        8,
    )
    .await
    .unwrap();

    // Admin deactivates assistant
    UserService::deactivate(&pool, &login.user.id, "usr_admin").await.unwrap();

    // Token must immediately be rejected
    let validate_res = AuthService::validate_session(&pool, &login.token).await;
    assert!(validate_res.is_err());

    // Subsequent login attempt must be rejected
    let login_again = AuthService::login(
        &pool,
        LoginRequest {
            username: "asst_priya".to_string(),
            password: "password123".to_string(),
        },
        8,
    )
    .await;
    assert!(login_again.is_err());
}

#[tokio::test]
async fn test_rbac_and_workspace_scoping() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_rbac.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    let doc_session = AuthService::login(
        &pool,
        LoginRequest {
            username: "dr_sharma".to_string(),
            password: "password123".to_string(),
        },
        8,
    )
    .await
    .unwrap();

    let doc_user = AuthService::validate_session(&pool, &doc_session.token).await.unwrap();

    // Doctor cannot perform AUTHORITY actions
    assert!(doc_user.require_role(&["AUTHORITY"]).is_err());
    assert!(doc_user.require_role(&["DOCTOR"]).is_ok());

    // Cross-workspace check: doctor belongs to "ws_kayachikitsa"
    assert!(doc_user.require_workspace("ws_kayachikitsa").is_ok());
    assert!(doc_user.require_workspace("ws_panchakarma").is_err());

    // Panchakarma doctor belongs to "ws_panchakarma"
    let varu_session = AuthService::login(
        &pool,
        LoginRequest {
            username: "dr_varu".to_string(),
            password: "password123".to_string(),
        },
        8,
    )
    .await
    .unwrap();
    let varu_user = AuthService::validate_session(&pool, &varu_session.token).await.unwrap();
    assert!(varu_user.require_workspace("ws_panchakarma").is_ok());
    assert!(varu_user.require_workspace("ws_kayachikitsa").is_err());
}

#[tokio::test]
async fn test_deterministic_clinical_rule_engine() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_rules.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    // 1. Evaluate diagnosis WITH validated rule (diag_kasa_01)
    let kasa_result = ClinicalRuleEngine::evaluate_diagnosis(&pool, "diag_kasa_01")
        .await
        .unwrap();

    assert!(kasa_result.has_validated_rule);
    assert_eq!(kasa_result.rule_code.as_deref(), Some("RULE-KASA-V1"));
    assert_eq!(kasa_result.version, Some(1));
    assert_eq!(kasa_result.items.len(), 2);
    assert_eq!(kasa_result.items[0].medicine_name, "Sitopaladi Churna");
    assert_eq!(kasa_result.items[1].medicine_name, "Vasavaleha");
    assert!(kasa_result.message.is_none());

    // 2. Evaluate diagnosis WITHOUT validated rule (diag_pratisyaya_01)
    let prati_result = ClinicalRuleEngine::evaluate_diagnosis(&pool, "diag_pratisyaya_01")
        .await
        .unwrap();

    assert!(!prati_result.has_validated_rule);
    assert!(prati_result.items.is_empty());
    assert_eq!(
        prati_result.message.as_deref(),
        Some("No validated recommendation available for this diagnosis.")
    );
}

#[tokio::test]
async fn test_end_to_end_clinical_workflow() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_e2e.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    let ws_id = "ws_kayachikitsa";

    // 1. Assistant registers patient with duplicate check
    let dup_check = PatientService::check_duplicates(&pool, ws_id, Some("9876543210"), "Rohan Gupta")
        .await
        .unwrap();
    assert!(!dup_check.has_potential_duplicates);

    let patient = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: None,
            patient_code: None,
            opd_case_id: Some("OPD-2026-001".to_string()),
            full_name: "Rohan Gupta".to_string(),
            date_of_birth: Some("1992-05-14".to_string()),
            sex: Some("Male".to_string()),
            phone: Some("9876543210".to_string()),
            address: Some("Pune, Maharashtra".to_string()),
            emergency_contact: Some("9876500000".to_string()),
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    assert_eq!(patient.full_name, "Rohan Gupta");

    // 2. Assistant creates Visit Intake (Consent + Vitals + Route to Dr. Sharma)
    let intake_res = VisitService::create_intake(
        &pool,
        ws_id,
        CreateVisitIntakeRequest {
            workspace_id: Some(ws_id.to_string()),
            patient_id: patient.id.clone(),
            doctor_id: "usr_dr_sharma".to_string(),
            purpose: Some("Persistent dry cough and fatigue".to_string()),
            priority: Some(1),
            consent_status: Some("GIVEN".to_string()),
            consent_version: Some("v1.0-2026".to_string()),
            temperature: Some(98.6),
            pulse_rate: Some(74),
            respiratory_rate: Some(18),
            systolic_bp: Some(120),
            diastolic_bp: Some(80),
            oxygen_saturation: Some(99.0),
            height_cm: Some(175.0),
            weight_kg: Some(70.0),
            vitals_notes: Some("Resting pulse stable".to_string()),
            idempotency_key: Some("idem_key_001".to_string()),
            ayush_data_json: None,
            complaints_list: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    let visit_id = intake_res.visit.id;
    assert_eq!(intake_res.visit.status, "QUEUED");
    assert!(intake_res.vitals.is_some());

    // 3. Returning patient scenario: Existing patient -> NEW Visit
    let visit_2 = VisitService::create_intake(
        &pool,
        ws_id,
        CreateVisitIntakeRequest {
            workspace_id: Some(ws_id.to_string()),
            patient_id: patient.id.clone(), // Same patient identity reused!
            doctor_id: "usr_dr_sharma".to_string(),
            purpose: Some("Follow up".to_string()),
            priority: Some(0),
            consent_status: Some("GIVEN".to_string()),
            consent_version: Some("v1.0-2026".to_string()),
            temperature: Some(98.4),
            pulse_rate: Some(72),
            respiratory_rate: Some(16),
            systolic_bp: Some(118),
            diastolic_bp: Some(78),
            oxygen_saturation: Some(99.0),
            height_cm: Some(175.0),
            weight_kg: Some(70.0),
            vitals_notes: None,
            idempotency_key: None,
            ayush_data_json: None,
            complaints_list: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    assert_ne!(visit_2.visit.id, visit_id);
    assert_eq!(visit_2.visit.patient_id, patient.id);

    // Verify patient history has 2 visits with full structured encounter records
    let history = VisitService::get_patient_history(&pool, &patient.id).await.unwrap();
    assert_eq!(history.len(), 2);
    assert!(history[0].get("visit").is_some(), "Must contain visit object");
    assert!(history[0].get("vitals").is_some(), "Must contain vitals object");
    assert!(history[0].get("complaints").is_some(), "Must contain complaints object");
    assert!(history[0].get("diagnoses").is_some(), "Must contain diagnoses array");
    assert!(history[0].get("prescription").is_some(), "Must contain prescription object");
    assert!(history[0].get("documents").is_some(), "Must contain documents array");
    assert!(history[0].get("id").is_some(), "Must contain backward-compatible flat id");
    assert!(history[0].get("visit_number").is_some(), "Must contain flat visit_number");

    // 4. Doctor My Queue check
    let queue = QueueService::get_doctor_queue(&pool, "usr_dr_sharma", ws_id).await.unwrap();
    assert!(queue.iter().any(|q| q.visit_id == visit_id));

    // 5. Doctor starts consultation
    QueueService::start_consultation(&pool, &visit_id, "usr_dr_sharma").await.unwrap();

    // 6. Doctor records Complaints & AYUSH Case Taking
    ConsultationService::save_clinical_notes(
        &pool,
        &visit_id,
        Some("Dry cough aggravated at night".to_string()),
        Some("History of seasonal allergic bronchitis".to_string()),
        Some("None".to_string()),
        Some("Family history of asthma".to_string()),
        Some("Vegetarian diet, tea twice daily".to_string()),
        Some(r#"{"prakriti_observation":"Vata-Pitta","nadi_pulse":"Manduk/Frog movement"}"#.to_string()),
        Some("v1.0-draft".to_string()),
        "usr_dr_sharma",
        None,
    )
    .await
    .unwrap();

    // 7. Doctor selects Manual Diagnosis (Kasa)
    let diag = ConsultationService::attach_diagnosis(
        &pool,
        &visit_id,
        AttachDiagnosisRequest {
            diagnosis_id: "diag_kasa_01".to_string(),
            diagnosis_text: Some("Vataja Kasa confirmed on auscultation".to_string()),
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    assert_eq!(diag.code, "DIAG-KASA-01");

    // 8. Doctor queries validated assistance
    let assistance = ClinicalRuleEngine::evaluate_diagnosis(&pool, "diag_kasa_01").await.unwrap();
    assert!(assistance.has_validated_rule);

    // 9. Doctor drafts prescription using rule suggestions + adding doctor controlled item
    let mut rx_items = Vec::new();
    for sugg in assistance.items {
        rx_items.push(PrescriptionItemInput {
            medicine_id: Some(sugg.medicine_id),
            medicine_name_snapshot: sugg.medicine_name,
            dosage_text: sugg.dosage_text,
            frequency_text: sugg.frequency_text,
            duration_text: sugg.duration_text,
            anupana_text: assistance.anupana.clone(),
            pathya_text: assistance.pathya.clone(),
            apathya_text: assistance.apathya.clone(),
            source_type: "RULE_SUGGESTION".to_string(),
            rule_id: assistance.rule_id.clone(),
            rule_version: assistance.version,
        });
    }

    // Doctor adds custom item
    rx_items.push(PrescriptionItemInput {
        medicine_id: None,
        medicine_name_snapshot: "Warm Ginger Tea with Turmeric".to_string(),
        dosage_text: Some("1 cup".to_string()),
        frequency_text: Some("Morning and Evening".to_string()),
        duration_text: Some("7 days".to_string()),
        anupana_text: None,
        pathya_text: None,
        apathya_text: None,
        source_type: "DOCTOR_ADDED".to_string(),
        rule_id: None,
        rule_version: None,
    });

    let draft_rx = PrescriptionService::save_draft(
        &pool,
        &visit_id,
        SavePrescriptionDraftRequest {
            source_rule_id: assistance.rule_id,
            source_rule_version: assistance.version,
            items: rx_items,
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    assert_eq!(draft_rx.items.len(), 3);
    assert_eq!(draft_rx.prescription.status, "DRAFT");

    // 10. Doctor finalizes prescription (Locks record!)
    let finalized_rx = PrescriptionService::finalize_prescription(&pool, &visit_id, "usr_dr_sharma")
        .await
        .unwrap();

    assert_eq!(finalized_rx.prescription.status, "FINALIZED");

    // Attempting to edit finalized prescription must fail
    let edit_attempt = PrescriptionService::save_draft(
        &pool,
        &visit_id,
        SavePrescriptionDraftRequest {
            source_rule_id: None,
            source_rule_version: None,
            items: vec![],
        },
        "usr_dr_sharma",
    )
    .await;
    assert!(edit_attempt.is_err());

    // 11. Document Generation (Clinical save precedes PDF)
    let doc_dir = dir.path().join("documents");
    std::fs::create_dir_all(&doc_dir).unwrap();

    let doc = DocumentService::generate_case_sheet(&pool, &doc_dir, &visit_id, "usr_dr_sharma")
        .await
        .unwrap();

    assert_eq!(doc.document_type, "CASE_SHEET_PDF");
    assert!(doc.file_hash.is_some());
    assert!(std::path::Path::new(&doc.file_path).exists());

    // Verify hierarchical storage path
    assert!(doc.file_path.contains("Patient Data"));
    assert!(doc.file_path.contains("Kayachikitsa"));
    assert!(doc.file_path.contains("0001"));
    assert!(doc.file_path.contains("CaseSheet_"));
    assert!(doc.file_path.ends_with(".pdf"));

    // Verify HTML is NOT permanently stored on disk alongside PDF
    let html_path = doc.file_path.replace(".pdf", ".html");
    assert!(!std::path::Path::new(&html_path).exists(), "HTML case sheet must NOT be permanently stored on disk");

    // Verify PDF content contains Patient Code
    let pdf_bytes = std::fs::read(&doc.file_path).unwrap();
    let pdf_str = String::from_utf8_lossy(&pdf_bytes);
    assert!(pdf_str.contains("Patient Code: 0001"));
    assert!(pdf_str.contains("Treating Physician: Dr. Sharma"));
}

#[tokio::test]
async fn test_bilingual_medicines_and_user_status_management() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_bilingual.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    // 1. Verify seeded bilingual medicines
    let meds: Vec<sixsense_server::models::Medicine> = sqlx::query_as(
        "SELECT id, code, name, name_hi, form, strength, description, status, created_at, updated_at
         FROM medicines WHERE code = 'MED-ASHWA-01'"
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(meds.len(), 1);
    assert_eq!(meds[0].name, "Ashwagandha Churna");
    assert_eq!(meds[0].name_hi.as_deref(), Some("अश्वगंधा चूर्ण"));

    // 2. Test user status toggle via UserService::update
    let updated = UserService::update(
        &pool,
        "usr_dr_sharma",
        sixsense_server::models::user::UpdateUserRequest {
            full_name: None,
            workspace_id: None,
            role: None,
            status: Some("DEACTIVATED".to_string()),
            qualification: None,
        },
        "usr_admin",
    )
    .await
    .unwrap();

    assert_eq!(updated.status, "DEACTIVATED");

    // Reactivate user
    let reactivated = UserService::update(
        &pool,
        "usr_dr_sharma",
        sixsense_server::models::user::UpdateUserRequest {
            full_name: None,
            workspace_id: None,
            role: None,
            status: Some("ACTIVE".to_string()),
            qualification: None,
        },
        "usr_admin",
    )
    .await
    .unwrap();

    assert_eq!(reactivated.status, "ACTIVE");
}

#[tokio::test]
async fn test_backup_execution_and_integrity_verification() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_backup.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    let bkp_dir = dir.path().join("backups");
    std::fs::create_dir_all(&bkp_dir).unwrap();

    // 1. Trigger backup
    let bkp_record = BackupService::trigger_backup(&pool, &bkp_dir).await.unwrap();
    assert_eq!(bkp_record.status, "SUCCESS");
    assert!(bkp_record.checksum.is_some());
    assert!(std::path::Path::new(&bkp_record.target_path).exists());

    // 2. Verify backup
    let verify_res = BackupService::verify_backup(&pool, &bkp_record.id).await.unwrap();
    assert!(verify_res.is_valid);
    assert_eq!(verify_res.status, "SUCCESS");
    assert_eq!(verify_res.calculated_checksum, verify_res.stored_checksum);
}

// ============================================================================
// EXPLICIT VERIFICATION TEST SUITE (TEST CASES 1 - 18)
// ============================================================================

fn mock_intake_req(patient_id: String, doctor_id: String) -> CreateVisitIntakeRequest {
    CreateVisitIntakeRequest {
        workspace_id: None,
        patient_id,
        doctor_id,
        purpose: Some("Regular Checkup".to_string()),
        priority: Some(0),
        consent_status: Some("GIVEN".to_string()),
        consent_version: Some("v1.0".to_string()),
        temperature: None,
        pulse_rate: None,
        respiratory_rate: None,
        systolic_bp: None,
        diastolic_bp: None,
        oxygen_saturation: None,
        height_cm: None,
        weight_kg: None,
        vitals_notes: None,
        idempotency_key: None,
        ayush_data_json: None,
        complaints_list: None,
    }
}

#[tokio::test]
async fn test_case_01_patient_code_generation_0001() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc01").await;
    let ws_id = "ws_kayachikitsa";

    let patient = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: Some("OPD-001".to_string()),
            full_name: "Amit Kumar".to_string(),
            date_of_birth: Some("1990-01-01".to_string()),
            sex: Some("Male".to_string()),
            phone: Some("9000000001".to_string()),
            address: Some("Delhi".to_string()),
            emergency_contact: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    assert_eq!(patient.patient_code, "0001");
}

#[tokio::test]
async fn test_case_02_patient_code_sequencing_0002_0003() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc02").await;
    let ws_id = "ws_kayachikitsa";

    let p1 = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: None,
            patient_code: None,
            opd_case_id: None,
            full_name: "Patient One".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000001".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    let p2 = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: None,
            patient_code: None,
            opd_case_id: None,
            full_name: "Patient Two".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000002".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    let p3 = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: None,
            patient_code: None,
            opd_case_id: None,
            full_name: "Patient Three".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000003".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    assert_eq!(p1.patient_code, "0001");
    assert_eq!(p2.patient_code, "0002");
    assert_eq!(p3.patient_code, "0003");
}

#[tokio::test]
async fn test_case_03_patient_code_persistence_across_restart() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("tc03.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());
    let ws_id = "ws_kayachikitsa";

    {
        let pool = init_pool(&db_url).await.unwrap();
        run_migrations(&pool).await.unwrap();
        seed_initial_data_if_empty(&pool).await.unwrap();

        let p1 = PatientService::create(
            &pool,
            ws_id,
            CreatePatientRequest {
                workspace_id: Some(ws_id.to_string()),
                doctor_id: None,
                patient_code: None,
                opd_case_id: None,
                full_name: "Patient One".to_string(),
                date_of_birth: None,
                sex: None,
                phone: Some("9000000001".to_string()),
                address: None,
                emergency_contact: None,
            },
            "usr_asst_priya",
        ).await.unwrap();
        assert_eq!(p1.patient_code, "0001");
        pool.close().await;
    }

    // Reopen database pool (simulating server restart)
    {
        let pool = init_pool(&db_url).await.unwrap();
        let p2 = PatientService::create(
            &pool,
            ws_id,
            CreatePatientRequest {
                workspace_id: Some(ws_id.to_string()),
                doctor_id: None,
                patient_code: None,
                opd_case_id: None,
                full_name: "Patient Two".to_string(),
                date_of_birth: None,
                sex: None,
                phone: Some("9000000002".to_string()),
                address: None,
                emergency_contact: None,
            },
            "usr_asst_priya",
        ).await.unwrap();
        assert_eq!(p2.patient_code, "0002");
    }
}

#[tokio::test]
async fn test_case_04_patient_code_stability_across_visits() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc04").await;
    let ws_id = "ws_kayachikitsa";

    let patient = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Sunita Rao".to_string(),
            date_of_birth: None,
            sex: Some("Female".to_string()),
            phone: Some("9000000010".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    assert_eq!(patient.patient_code, "0001");

    // Visit 1
    let v1 = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(patient.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    // Visit 2
    let v2 = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(patient.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    // Visit 3
    let v3 = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(patient.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    // Visit IDs and numbers must be unique
    assert_ne!(v1.visit.id, v2.visit.id);
    assert_ne!(v2.visit.id, v3.visit.id);
    assert_eq!(v1.visit.visit_number, "01");
    assert_eq!(v2.visit.visit_number, "02");
    assert_eq!(v3.visit.visit_number, "03");

    // But patient_code on all 3 visits must remain identical "0001"
    assert_eq!(v1.patient_code, "0001");
    assert_eq!(v2.patient_code, "0001");
    assert_eq!(v3.patient_code, "0001");
}

#[tokio::test]
async fn test_case_05_existing_database_migration_max_plus_one() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc05").await;
    let ws_id = "ws_kayachikitsa";

    // Seed existing patients with historical non-consecutive codes
    sqlx::query(
        "INSERT INTO patients (id, workspace_id, patient_code, full_name, created_at, updated_at)
         VALUES ('pat_old_1', ?, '0007', 'Old Patient 1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
                ('pat_old_2', ?, '0012', 'Old Patient 2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    )
    .bind(ws_id)
    .bind(ws_id)
    .execute(&pool)
    .await
    .unwrap();

    let new_pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: None,
            patient_code: None,
            opd_case_id: None,
            full_name: "New Migrated Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000099".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    // Must be max(0012) + 1 = 0013
    assert_eq!(new_pat.patient_code, "0013");

    // Existing patient codes must NOT have been changed
    let p1: (String,) = sqlx::query_as("SELECT patient_code FROM patients WHERE id = 'pat_old_1'")
        .fetch_one(&pool).await.unwrap();
    let p2: (String,) = sqlx::query_as("SELECT patient_code FROM patients WHERE id = 'pat_old_2'")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(p1.0, "0007");
    assert_eq!(p2.0, "0012");
}

#[tokio::test]
async fn test_case_06_automatic_folder_creation_on_patient_register() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc06").await;
    let ws_id = "ws_kayachikitsa";

    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Folder Test Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000006".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    let expected_dir = PatientStorageService::get_patient_folder("Kayachikitsa", "Dr. Sharma", &pat.patient_code).unwrap();
    assert!(expected_dir.exists());
    assert!(expected_dir.is_dir());
}

#[tokio::test]
async fn test_case_07_automatic_folder_creation_on_department_create() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc07").await;

    let ws = WorkspaceService::create(
        &pool,
        CreateWorkspaceRequest {
            code: "SHALYA".to_string(),
            name: "Shalya Tantra".to_string(),
            description: Some("Surgery department".to_string()),
        },
        "usr_admin",
    ).await.unwrap();

    let expected_dir = PatientStorageService::get_department_folder(&ws.name).unwrap();
    assert!(expected_dir.exists());
    assert!(expected_dir.is_dir());
    assert!(expected_dir.ends_with("Shalya Tantra"));
}

#[tokio::test]
async fn test_case_08_automatic_folder_creation_on_doctor_create() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc08").await;
    let ws_id = "ws_kayachikitsa";

    let doc = UserService::create(
        &pool,
        CreateUserRequest {
            workspace_id: Some(ws_id.to_string()),
            full_name: "Dr. Patel".to_string(),
            role: "DOCTOR".to_string(),
            phone: Some("9876543210".to_string()),
            qualification: Some("BAMS".to_string()),
        },
        "usr_admin",
    ).await.unwrap();

    let expected_dir = PatientStorageService::get_doctor_folder("Kayachikitsa", &doc.user.full_name).unwrap();
    assert!(expected_dir.exists());
    assert!(expected_dir.is_dir());
    assert!(expected_dir.ends_with("Dr. Patel"));
}

#[tokio::test]
async fn test_doctor_username_generation_and_qualification() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc_doc_user").await;
    let ws_id = "ws_kayachikitsa";

    // 1. Full name "Ayush Mani Sharma", role DOCTOR -> should generate "dr.ayush@ayush.com"
    let doc1 = UserService::create(
        &pool,
        CreateUserRequest {
            workspace_id: Some(ws_id.to_string()),
            full_name: "Ayush Mani Sharma".to_string(),
            role: "DOCTOR".to_string(),
            phone: Some("9876543211".to_string()),
            qualification: Some("BAMS MD (Ayurveda)".to_string()),
        },
        "usr_admin",
    ).await.unwrap();

    assert_eq!(doc1.generated_username, "dr.ayush@ayush.com");
    assert_eq!(doc1.user.qualification.as_deref(), Some("BAMS MD (Ayurveda)"));

    // 2. Full name "Dr. Ayush Sharma", role DOCTOR -> should handle collision and generate "dr.ayush2@ayush.com"
    let doc2 = UserService::create(
        &pool,
        CreateUserRequest {
            workspace_id: Some(ws_id.to_string()),
            full_name: "Dr. Ayush Sharma".to_string(),
            role: "DOCTOR".to_string(),
            phone: Some("9876543212".to_string()),
            qualification: Some("BAMS".to_string()),
        },
        "usr_admin",
    ).await.unwrap();

    assert_eq!(doc2.generated_username, "dr.ayush2@ayush.com");
    assert_eq!(doc2.user.qualification.as_deref(), Some("BAMS"));

    // 3. Assistant "Priya Singh", role ASSISTANT -> should generate "priya@ayush.com" (no dr. prefix)
    let asst = UserService::create(
        &pool,
        CreateUserRequest {
            workspace_id: Some(ws_id.to_string()),
            full_name: "Priya Singh".to_string(),
            role: "ASSISTANT".to_string(),
            phone: Some("9876543213".to_string()),
            qualification: Some("Diploma in Panchakarma".to_string()),
        },
        "usr_admin",
    ).await.unwrap();

    assert_eq!(asst.generated_username, "priya@ayush.com");
    assert_eq!(asst.user.qualification.as_deref(), Some("Diploma in Panchakarma"));

    // 4. Verify list returns qualification
    let all_users = UserService::list(&pool, None).await.unwrap();
    let found_doc1 = all_users.iter().find(|u| u.id == doc1.user.id).unwrap();
    assert_eq!(found_doc1.qualification.as_deref(), Some("BAMS MD (Ayurveda)"));
}

#[tokio::test]
async fn test_case_09_casesheet_generation_location() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc09").await;
    let ws_id = "ws_kayachikitsa";

    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "CaseSheet Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000009".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    let v = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    let dummy_dir = dir.path().join("docs");
    let doc = DocumentService::generate_case_sheet(&pool, &dummy_dir, &v.visit.id, "usr_dr_sharma")
        .await
        .unwrap();

    assert!(doc.file_path.contains("Patient Data"));
    assert!(doc.file_path.contains("Kayachikitsa"));
    assert!(doc.file_path.contains("Dr. Sharma"));
    assert!(doc.file_path.contains(&pat.patient_code));
    assert!(doc.file_path.contains(&format!("CaseSheet_{}", pat.patient_code)));
    assert!(doc.file_path.ends_with(".pdf"));
    assert!(std::path::Path::new(&doc.file_path).exists());
}

#[tokio::test]
async fn test_case_10_prescription_generation_location() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc10").await;
    let ws_id = "ws_kayachikitsa";

    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Rx Loc Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000010".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    let v = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    // Attach diagnosis and draft prescription
    ConsultationService::attach_diagnosis(
        &pool,
        &v.visit.id,
        AttachDiagnosisRequest {
            diagnosis_id: "diag_kasa_01".to_string(),
            diagnosis_text: Some("Kaphaja Kasa".to_string()),
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    PrescriptionService::save_draft(
        &pool,
        &v.visit.id,
        SavePrescriptionDraftRequest {
            source_rule_id: Some("rule_kasa_v1".to_string()),
            source_rule_version: Some(1),
            items: vec![PrescriptionItemInput {
                medicine_id: Some("med_sitopaladi".to_string()),
                medicine_name_snapshot: "Sitopaladi Churna".to_string(),
                dosage_text: Some("3g".to_string()),
                frequency_text: Some("TDS".to_string()),
                duration_text: Some("7 days".to_string()),
                anupana_text: Some("Madhu".to_string()),
                pathya_text: None,
                apathya_text: None,
                source_type: "RULE_SUGGESTION".to_string(),
                rule_id: Some("rule_kasa_v1".to_string()),
                rule_version: Some(1),
            }],
        },
        "usr_dr_sharma",
    ).await.unwrap();
    PrescriptionService::finalize_prescription(&pool, &v.visit.id, "usr_dr_sharma").await.unwrap();

    let dummy_dir = dir.path().join("docs");
    let rx_doc = DocumentService::generate_prescription(&pool, &dummy_dir, &v.visit.id, "usr_dr_sharma")
        .await
        .unwrap();

    assert_eq!(rx_doc.document_type, "PRESCRIPTION_PDF");
    assert!(rx_doc.file_path.contains("Patient Data"));
    assert!(rx_doc.file_path.contains("Kayachikitsa"));
    assert!(rx_doc.file_path.contains("Dr. Sharma"));
    assert!(rx_doc.file_path.contains(&pat.patient_code));
    assert!(rx_doc.file_path.contains(&format!("Prescription_{}", pat.patient_code)));
    assert!(rx_doc.file_path.ends_with(".pdf"));
    assert!(std::path::Path::new(&rx_doc.file_path).exists());
}

#[tokio::test]
async fn test_case_11_returning_patient_folder_reuse() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc11").await;
    let ws_id = "ws_kayachikitsa";

    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Returning Folder Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000011".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    let v1 = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    let v2 = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    let dummy_dir = dir.path().join("docs");
    let doc1 = DocumentService::generate_case_sheet(&pool, &dummy_dir, &v1.visit.id, "usr_dr_sharma").await.unwrap();
    let doc2 = DocumentService::generate_case_sheet(&pool, &dummy_dir, &v2.visit.id, "usr_dr_sharma").await.unwrap();

    let path1 = std::path::Path::new(&doc1.file_path);
    let path2 = std::path::Path::new(&doc2.file_path);

    // Both documents must be in the exact same parent folder
    assert_eq!(path1.parent().unwrap(), path2.parent().unwrap());
    assert!(path1.file_name().unwrap().to_str().unwrap().starts_with("CaseSheet_"));
    assert!(path2.file_name().unwrap().to_str().unwrap().starts_with("CaseSheet_"));
}

#[tokio::test]
async fn test_case_12_idempotent_folder_creation() {
    let _dir = tempdir().unwrap();

    // Calling ensure_patient_folder multiple times succeeds and returns same path
    let p1 = PatientStorageService::ensure_patient_folder("Kayachikitsa", "Dr. Sharma", "0099").unwrap();
    let p2 = PatientStorageService::ensure_patient_folder("Kayachikitsa", "Dr. Sharma", "0099").unwrap();
    let p3 = PatientStorageService::ensure_patient_folder("Kayachikitsa", "Dr. Sharma", "0099").unwrap();
    assert_eq!(p1, p2);
    assert_eq!(p2, p3);
    assert!(p1.exists());
}

#[tokio::test]
async fn test_case_13_database_source_of_truth_missing_file_graceful() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc13").await;
    let ws_id = "ws_kayachikitsa";

    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Source Truth Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000013".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    let v = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    let dummy_dir = dir.path().join("docs");
    let doc = DocumentService::generate_case_sheet(&pool, &dummy_dir, &v.visit.id, "usr_dr_sharma").await.unwrap();

    // Verify file exists on disk and record exists in DB
    assert!(std::path::Path::new(&doc.file_path).exists());
    let db_doc: (String,) = sqlx::query_as("SELECT id FROM documents WHERE id = ?")
        .bind(&doc.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(db_doc.0, doc.id);

    // Delete file from disk
    std::fs::remove_file(&doc.file_path).unwrap();
    assert!(!std::path::Path::new(&doc.file_path).exists());

    // Database record remains completely intact!
    let db_doc_after: (String, String) = sqlx::query_as("SELECT id, file_path FROM documents WHERE id = ?")
        .bind(&doc.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(db_doc_after.0, doc.id);
    assert_eq!(db_doc_after.1, doc.file_path);

    // Clinical visit record remains intact
    let visit_after = VisitService::get_detail(&pool, &v.visit.id).await.unwrap();
    assert_eq!(visit_after.visit.id, v.visit.id);
}

#[tokio::test]
async fn test_case_14_historical_integrity_doctor_rename_or_deactivate() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc14").await;
    let ws_id = "ws_kayachikitsa";

    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Integrity Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000014".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    let v = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    let dummy_dir = dir.path().join("docs");
    let doc = DocumentService::generate_case_sheet(&pool, &dummy_dir, &v.visit.id, "usr_dr_sharma").await.unwrap();
    assert!(std::path::Path::new(&doc.file_path).exists());

    // Deactivate Dr. Sharma
    UserService::deactivate(&pool, "usr_dr_sharma", "usr_admin").await.unwrap();

    // Document on disk still exists and is completely intact
    assert!(std::path::Path::new(&doc.file_path).exists());

    // Database documents record still intact
    let doc_check: (String,) = sqlx::query_as("SELECT id FROM documents WHERE id = ?")
        .bind(&doc.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(doc_check.0, doc.id);
}

#[tokio::test]
async fn test_case_15_cross_workspace_isolation_rbac() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc15").await;

    // Dr. Sharma is in Kayachikitsa ('ws_kayachikitsa')
    // Dr. Varu is in Panchakarma ('ws_panchakarma')
    let sharma_session = AuthService::login(
        &pool,
        LoginRequest {
            username: "dr_sharma".to_string(),
            password: "password123".to_string(),
        },
        8,
    )
    .await
    .unwrap();

    let varu_session = AuthService::login(
        &pool,
        LoginRequest {
            username: "dr_varu".to_string(),
            password: "password123".to_string(),
        },
        8,
    )
    .await
    .unwrap();

    let sharma = AuthService::validate_session(&pool, &sharma_session.token).await.unwrap();
    let varu = AuthService::validate_session(&pool, &varu_session.token).await.unwrap();

    // Dr. Sharma cannot access Panchakarma
    assert!(sharma.require_workspace("ws_panchakarma").is_err());

    // Dr. Varu cannot access Kayachikitsa
    assert!(varu.require_workspace("ws_kayachikitsa").is_err());

    // Dr. Sharma can access Kayachikitsa
    assert!(sharma.require_workspace("ws_kayachikitsa").is_ok());
}

#[tokio::test]
async fn test_case_16_historical_case_retrieval_with_disclaimer() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc16").await;
    let ws_id = "ws_kayachikitsa";

    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Historical Memory Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000016".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    let v = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    ConsultationService::save_clinical_notes(
        &pool,
        &v.visit.id,
        Some("Severe dry cough with vataja pradhana symptoms".to_string()),
        Some("History of cold weather exposure".to_string()),
        None, None, None, None, None,
        "usr_dr_sharma",
        None,
    ).await.unwrap();

    ConsultationService::attach_diagnosis(
        &pool,
        &v.visit.id,
        AttachDiagnosisRequest {
            diagnosis_id: "diag_kasa_01".to_string(),
            diagnosis_text: Some("Kaphaja Kasa".to_string()),
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    PrescriptionService::save_draft(
        &pool,
        &v.visit.id,
        SavePrescriptionDraftRequest {
            source_rule_id: Some("rule_kasa_v1".to_string()),
            source_rule_version: Some(1),
            items: vec![PrescriptionItemInput {
                medicine_id: Some("med_sitopaladi".to_string()),
                medicine_name_snapshot: "Sitopaladi Churna".to_string(),
                dosage_text: Some("3g".to_string()),
                frequency_text: Some("TDS".to_string()),
                duration_text: Some("7 days".to_string()),
                anupana_text: Some("Madhu".to_string()),
                pathya_text: None,
                apathya_text: None,
                source_type: "RULE_SUGGESTION".to_string(),
                rule_id: Some("rule_kasa_v1".to_string()),
                rule_version: Some(1),
            }],
        },
        "usr_dr_sharma",
    ).await.unwrap();
    PrescriptionService::finalize_prescription(&pool, &v.visit.id, "usr_dr_sharma").await.unwrap();

    // Query similar cases by complaint query
    let cases = IntelligenceService::search_similar_cases(&pool, ws_id, "cough", None, 10)
        .await
        .unwrap();

    assert!(!cases.is_empty());
    let c = &cases[0];
    assert_eq!(c.patient_code, pat.patient_code);
    assert!(c.chief_complaint.contains("dry cough"));
    assert!(c.diagnoses.iter().any(|d| d.contains("Kasa")));
    assert!(c.medicines.iter().any(|m| m.medicine_name.contains("Sitopaladi")));
    assert_eq!(c.source_rule_code.as_deref(), Some("RULE-KASA-V1"));
    assert_eq!(c.disclaimer, "Historical Case Reference Only — Requires Independent Clinical Evaluation");
}

#[tokio::test]
async fn test_case_17_learning_safety_guardrail_analytics_never_writes_rules() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc17").await;
    let ws_id = "ws_kayachikitsa";

    let rules_before: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clinical_rules")
        .fetch_one(&pool).await.unwrap();
    let rule_items_before: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clinical_rule_items")
        .fetch_one(&pool).await.unwrap();

    // Call observational analytics and similar case search multiple times
    let _analytics = IntelligenceService::get_pattern_analytics(&pool, ws_id).await.unwrap();
    let _similar = IntelligenceService::search_similar_cases(&pool, ws_id, "cough", None, 10).await.unwrap();

    let rules_after: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clinical_rules")
        .fetch_one(&pool).await.unwrap();
    let rule_items_after: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clinical_rule_items")
        .fetch_one(&pool).await.unwrap();

    // Strict safety guardrail: clinical rules are 100% immutable by intelligence queries
    assert_eq!(rules_before.0, rules_after.0);
    assert_eq!(rule_items_before.0, rule_items_after.0);
}

#[tokio::test]
async fn test_case_18_learning_safety_guardrail_no_autonomous_prescription() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "tc18").await;
    let ws_id = "ws_kayachikitsa";

    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Safety Pat".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9000000018".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    ).await.unwrap();

    let v = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    ).await.unwrap();

    // Run observational analytics
    let analytics = IntelligenceService::get_pattern_analytics(&pool, ws_id).await.unwrap();
    assert!(analytics.disclaimer.contains("Observational Analytics Only"));

    // Check that NO prescription was autonomously created for visit `v`
    let rx_opt = PrescriptionService::get_detail(&pool, &v.visit.id).await.unwrap();
    assert!(rx_opt.is_none());

    // Check that clinical rule evaluation for an unvalidated diagnosis returns has_validated_rule: false
    let unvalidated = ClinicalRuleEngine::evaluate_diagnosis(&pool, "diag_pratisyaya_01").await.unwrap();
    assert!(!unvalidated.has_validated_rule);
    assert!(unvalidated.items.is_empty());
}

#[tokio::test]
async fn test_audit_deactivated_workspace_blocks_session() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "audit_ws_deactivate").await;

    // 1. Log in as dr_varu (assigned to ws_panchakarma)
    let login_res = AuthService::login(
        &pool,
        LoginRequest {
            username: "dr_varu".to_string(),
            password: "password123".to_string(),
        },
        8,
    )
    .await
    .unwrap();

    // 2. Validate session is initially valid
    let valid_user = AuthService::validate_session(&pool, &login_res.token).await;
    assert!(valid_user.is_ok());

    // 3. Authority deactivates ws_panchakarma
    WorkspaceService::deactivate(&pool, "ws_panchakarma", "usr_admin")
        .await
        .unwrap();

    // 4. Existing session must be immediately rejected
    let session_check = AuthService::validate_session(&pool, &login_res.token).await;
    assert!(session_check.is_err(), "Session must be revoked/rejected when workspace is deactivated");

    // 5. Subsequent login attempts must also be rejected with Forbidden
    let login_attempt = AuthService::login(
        &pool,
        LoginRequest {
            username: "dr_varu".to_string(),
            password: "password123".to_string(),
        },
        8,
    )
    .await;
    assert!(login_attempt.is_err(), "Login must be forbidden when workspace is deactivated");
}

#[tokio::test]
async fn test_audit_finalized_visit_immutability() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "audit_immutability").await;
    let ws_id = "ws_kayachikitsa";

    // 1. Create patient and visit
    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Immutability Test Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9998887771".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    let intake = VisitService::create_intake(
        &pool,
        ws_id,
        mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    )
    .await
    .unwrap();
    let visit_id = intake.visit.id;

    // 2. Save clinical notes and diagnosis
    ConsultationService::save_clinical_notes(
        &pool,
        &visit_id,
        Some("Severe cough and fever".to_string()),
        Some("Onset 3 days ago".to_string()),
        None,
        None,
        None,
        None,
        Some("v1.0".to_string()),
        "usr_dr_sharma",
        None,
    )
    .await
    .unwrap();

    let diag = ConsultationService::attach_diagnosis(
        &pool,
        &visit_id,
        AttachDiagnosisRequest {
            diagnosis_id: "diag_kasa_01".to_string(),
            diagnosis_text: Some("Initial diagnostic impression".to_string()),
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    // 3. Save draft prescription and finalize
    PrescriptionService::save_draft(
        &pool,
        &visit_id,
        SavePrescriptionDraftRequest {
            source_rule_id: None,
            source_rule_version: None,
            items: vec![PrescriptionItemInput {
                medicine_id: Some("med_sitopaladi".to_string()),
                medicine_name_snapshot: "Sitopaladi Churna".to_string(),
                dosage_text: Some("2 tabs".to_string()),
                frequency_text: Some("BD".to_string()),
                duration_text: Some("14 days".to_string()),
                anupana_text: Some("Warm water".to_string()),
                pathya_text: None,
                apathya_text: None,
                source_type: "DOCTOR_ADDED".to_string(),
                rule_id: None,
                rule_version: None,
            }],
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    let finalized_rx = PrescriptionService::finalize_prescription(&pool, &visit_id, "usr_dr_sharma")
        .await
        .unwrap();
    assert_eq!(finalized_rx.prescription.status, "FINALIZED");

    // 4. Verify that clinical notes CANNOT be modified anymore
    let notes_edit = ConsultationService::save_clinical_notes(
        &pool,
        &visit_id,
        Some("Altered complaint".to_string()),
        None,
        None,
        None,
        None,
        None,
        None,
        "usr_dr_sharma",
        None,
    )
    .await;
    assert!(notes_edit.is_err(), "Modifying notes on a finalized encounter must be rejected");

    // 5. Verify that diagnoses CANNOT be attached or removed anymore
    let diag_attach = ConsultationService::attach_diagnosis(
        &pool,
        &visit_id,
        AttachDiagnosisRequest {
            diagnosis_id: "diag_jvara_01".to_string(),
            diagnosis_text: None,
        },
        "usr_dr_sharma",
    )
    .await;
    assert!(diag_attach.is_err(), "Attaching diagnosis to finalized encounter must be rejected");

    let diag_remove = ConsultationService::remove_diagnosis(&pool, &visit_id, &diag.diagnosis_id, "usr_dr_sharma").await;
    assert!(diag_remove.is_err(), "Removing diagnosis from finalized encounter must be rejected");

    // 6. Verify that prescription draft CANNOT be modified anymore
    let rx_edit = PrescriptionService::save_draft(
        &pool,
        &visit_id,
        SavePrescriptionDraftRequest {
            source_rule_id: None,
            source_rule_version: None,
            items: vec![],
        },
        "usr_dr_sharma",
    )
    .await;
    assert!(rx_edit.is_err(), "Editing prescription on finalized encounter must be rejected");

    // 7. Verify that QueueService CANNOT restart consultation on finalized visit
    let start_again = QueueService::start_consultation(&pool, &visit_id, "usr_dr_sharma").await;
    assert!(start_again.is_err(), "Restarting consultation on finalized encounter must be rejected");
}

#[tokio::test]
async fn test_audit_cross_workspace_transfer_sync() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "audit_transfer_sync").await;

    // 1. Create patient and visit in Kayachikitsa for Dr. Sharma
    let pat = PatientService::create(
        &pool,
        "ws_kayachikitsa",
        CreatePatientRequest {
            workspace_id: Some("ws_kayachikitsa".to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Transfer Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9991112223".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    let intake = VisitService::create_intake(
        &pool,
        "ws_kayachikitsa",
        mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()),
        "usr_asst_priya",
    )
    .await
    .unwrap();
    let visit_id = intake.visit.id;

    // Dr. Sharma has the patient in queue
    let queue_sharma = QueueService::get_doctor_queue(&pool, "usr_dr_sharma", "ws_kayachikitsa")
        .await
        .unwrap();
    assert!(queue_sharma.iter().any(|q| q.visit_id == visit_id));

    // Dr. Varu (Panchakarma) initially does not have the patient
    let queue_varu_before = QueueService::get_doctor_queue(&pool, "usr_dr_varu", "ws_panchakarma")
        .await
        .unwrap();
    assert!(!queue_varu_before.iter().any(|q| q.visit_id == visit_id));

    // 2. Transfer patient to Dr. Varu (ws_panchakarma)
    QueueService::transfer_patient(&pool, &visit_id, "usr_dr_varu", "usr_dr_sharma")
        .await
        .unwrap();

    // 3. Verify Dr. Varu now SEES the patient in their Panchakarma queue
    let queue_varu_after = QueueService::get_doctor_queue(&pool, "usr_dr_varu", "ws_panchakarma")
        .await
        .unwrap();
    assert!(queue_varu_after.iter().any(|q| q.visit_id == visit_id), "Patient must appear in target doctor's workspace queue");

    // 4. Verify workspace_id on both visits and queue_entries was synchronized to ws_panchakarma
    let visit_row: (String,) = sqlx::query_as("SELECT workspace_id FROM visits WHERE id = ?")
        .bind(&visit_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(visit_row.0, "ws_panchakarma");

    let queue_row: (String,) = sqlx::query_as("SELECT workspace_id FROM queue_entries WHERE visit_id = ?")
        .bind(&visit_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(queue_row.0, "ws_panchakarma");
}

#[tokio::test]
async fn test_audit_concurrent_visit_intake_numbering() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "audit_intake_numbers").await;
    let ws_id = "ws_kayachikitsa";

    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Seq Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9887766554".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    // Create 3 visits sequentially
    let v1 = VisitService::create_intake(&pool, ws_id, mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()), "usr_asst_priya").await.unwrap();
    let v2 = VisitService::create_intake(&pool, ws_id, mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()), "usr_asst_priya").await.unwrap();
    let v3 = VisitService::create_intake(&pool, ws_id, mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()), "usr_asst_priya").await.unwrap();

    assert_eq!(v1.visit.visit_number, "01");
    assert_eq!(v2.visit.visit_number, "02");
    assert_eq!(v3.visit.visit_number, "03");
}

#[tokio::test]
async fn test_audit_unfinalized_prescription_generation_rejected() {
    let dir = tempdir().unwrap();
    let pool = setup_test_db(&dir, "audit_unfinalized_rx").await;
    let ws_id = "ws_kayachikitsa";

    let pat = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: Some("usr_dr_sharma".to_string()),
            patient_code: None,
            opd_case_id: None,
            full_name: "Draft Rx Patient".to_string(),
            date_of_birth: None,
            sex: None,
            phone: Some("9776655443".to_string()),
            address: None,
            emergency_contact: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    let intake = VisitService::create_intake(&pool, ws_id, mock_intake_req(pat.id.clone(), "usr_dr_sharma".to_string()), "usr_asst_priya").await.unwrap();
    let visit_id = intake.visit.id;

    // Save prescription draft (status = 'DRAFT')
    PrescriptionService::save_draft(
        &pool,
        &visit_id,
        SavePrescriptionDraftRequest {
            source_rule_id: None,
            source_rule_version: None,
            items: vec![PrescriptionItemInput {
                medicine_id: Some("med_sitopaladi".to_string()),
                medicine_name_snapshot: "Sitopaladi Churna".to_string(),
                dosage_text: Some("1 tab".to_string()),
                frequency_text: Some("OD".to_string()),
                duration_text: Some("7 days".to_string()),
                anupana_text: Some("Warm water".to_string()),
                pathya_text: None,
                apathya_text: None,
                source_type: "DOCTOR_ADDED".to_string(),
                rule_id: None,
                rule_version: None,
            }],
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    let docs_dir = dir.path().join("documents");

    // Generating prescription document on a DRAFT must be rejected
    let doc_res = DocumentService::generate_prescription(&pool, &docs_dir, &visit_id, "usr_dr_sharma").await;
    assert!(doc_res.is_err(), "Generating official prescription document on draft must be rejected");

    // Finalize prescription
    PrescriptionService::finalize_prescription(&pool, &visit_id, "usr_dr_sharma").await.unwrap();

    // Generating prescription document on FINALIZED prescription must succeed
    let doc_res_finalized = DocumentService::generate_prescription(&pool, &docs_dir, &visit_id, "usr_dr_sharma").await;
    assert!(doc_res_finalized.is_ok(), "Generating official prescription document on finalized visit must succeed");
}


