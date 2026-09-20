use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::Value;
use sixsense_server::{
    api::create_router,
    documents::DocumentService,
    models::{
        medicine::CsvCommitRequest,
        patient::CreatePatientRequest,
        visit::{CreateVisitIntakeRequest, VisitComplaintItem},
    },
    repositories::{init_pool, run_migrations, seed_initial_data_if_empty},
    services::{PatientService, VisitService},
};
use tempfile::tempdir;
use tower::ServiceExt;

async fn setup_test_app() -> (axum::Router, sqlx::SqlitePool, tempfile::TempDir) {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_med_complaints.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    let app = create_router(pool.clone());
    (app, pool, dir)
}

async fn login_user(app: &axum::Router, username: &str) -> String {
    let login_payload = serde_json::json!({
        "username": username,
        "password": "password123"
    });

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&login_payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    json["token"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn test_medicine_search_and_references_bams_and_ccras() {
    let (app, _pool, _dir) = setup_test_app().await;
    let doc_token = login_user(&app, "dr_sharma").await;

    // 1. Search for Ashwagandha
    let search_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/diagnosis/medicines/search?q=ashwagandha")
                .header("Authorization", format!("Bearer {}", doc_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(search_res.status(), StatusCode::OK);
    let body = search_res.into_body().collect().await.unwrap().to_bytes();
    let results: Vec<Value> = serde_json::from_slice(&body).unwrap();
    assert!(!results.is_empty(), "Should find Ashwagandha in seeded dataset");

    let first = &results[0];
    let med_id = first["id"].as_str().unwrap();
    let refs_in_search = first["references"].as_array().unwrap();
    assert!(!refs_in_search.is_empty(), "Medicine search result must include attached references");

    // 2. Fetch clinical references for this medicine via dedicated endpoint
    let ref_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/diagnosis/medicines/{}/references", med_id))
                .header("Authorization", format!("Bearer {}", doc_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(ref_res.status(), StatusCode::OK);
    let body = ref_res.into_body().collect().await.unwrap().to_bytes();
    let refs: Vec<Value> = serde_json::from_slice(&body).unwrap();
    assert!(!refs.is_empty(), "Should have at least one clinical reference");

    for r in &refs {
        assert_eq!(r["medicine_id"], med_id);
        assert!(!r["source"].as_str().unwrap().is_empty());
        assert!(!r["validation_status"].as_str().unwrap().is_empty());
    }

    // 3. Search for CCRAS research formulation (e.g. AYUSH-64)
    let search_ccras = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/diagnosis/medicines/search?q=AYUSH-64")
                .header("Authorization", format!("Bearer {}", doc_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(search_ccras.status(), StatusCode::OK);
    let body = search_ccras.into_body().collect().await.unwrap().to_bytes();
    let ccras_results: Vec<Value> = serde_json::from_slice(&body).unwrap();
    assert!(!ccras_results.is_empty(), "Should find AYUSH-64 in seeded CCRAS dataset");
}

#[tokio::test]
async fn test_medicine_csv_template_generation() {
    let (app, _pool, _dir) = setup_test_app().await;
    let auth_token = login_user(&app, "admin").await;

    // 1. Medicine Master template
    let master_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/diagnosis/medicines/template?type=medicine_master")
                .header("Authorization", format!("Bearer {}", auth_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(master_res.status(), StatusCode::OK);
    let body = master_res.into_body().collect().await.unwrap().to_bytes();
    let csv_str = String::from_utf8(body.to_vec()).unwrap();
    assert!(csv_str.contains("Medicine Name"));
    assert!(csv_str.contains("Formulation / Form"));
    assert!(csv_str.contains("English Name"));
    assert!(csv_str.contains("Hindi Name"));
    assert!(csv_str.contains("Validation Status"));

    // 2. Clinical Reference template
    let ref_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/diagnosis/medicines/template?type=clinical_reference")
                .header("Authorization", format!("Bearer {}", auth_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(ref_res.status(), StatusCode::OK);
    let body = ref_res.into_body().collect().await.unwrap().to_bytes();
    let csv_str = String::from_utf8(body.to_vec()).unwrap();
    assert!(csv_str.contains("Chief Complaint"));
    assert!(csv_str.contains("Duration"));
    assert!(csv_str.contains("Roga Name"));
    assert!(csv_str.contains("Medicine Name"));
    assert!(csv_str.contains("Anupana"));
    assert!(csv_str.contains("Validation Status"));
}

#[tokio::test]
async fn test_medicine_csv_preview_and_conflict_detection() {
    let (app, _pool, _dir) = setup_test_app().await;
    let auth_token = login_user(&app, "admin").await;

    // 1. Medicine Master Preview: 1 existing duplicate, 1 new, 1 repeated in CSV, 1 invalid row
    let med_csv = "Medicine Name,Formulation / Form,Strength,English Name,Hindi Name,Classical / Sanskrit Name,Source,Source Reference,Validation Status,Notes\n\
Sitopaladi Churna,Churna,3g,Sitopaladi Churna,सितोपलादि चूर्ण,Sitopaladi Curna,BAMS Classical,NAMC Standard,VALIDATED,Existing in DB\n\
New Test Churna,Churna,3g,New Test Churna,नया टेस्ट चूर्ण,Navina Curna,BAMS Classical,NAMC Standard,VALIDATED,New formulation\n\
New Test Churna,Churna,3g,New Test Churna,नया टेस्ट चूर्ण,Navina Curna,BAMS Classical,NAMC Standard,VALIDATED,Duplicate in CSV\n\
,Vati,500mg,Missing Name,लापता,Lāpatā,BAMS Classical,NAMC Standard,VALIDATED,Invalid row";

    let preview_payload = serde_json::json!({
        "csv_type": "medicine_master",
        "csv_content": med_csv
    });

    let prev_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/diagnosis/medicines/import/preview")
                .header("Authorization", format!("Bearer {}", auth_token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&preview_payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(prev_res.status(), StatusCode::OK);
    let body = prev_res.into_body().collect().await.unwrap().to_bytes();
    let prev_json: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(prev_json["rows_detected"].as_i64().unwrap(), 4);
    assert_eq!(prev_json["duplicate_rows"].as_i64().unwrap(), 1, "Duplicate row in CSV batch");
    assert_eq!(prev_json["existing_medicines"].as_i64().unwrap(), 1, "Sitopaladi Churna is existing in DB");
    assert_eq!(prev_json["new_medicines"].as_i64().unwrap(), 1, "New Test Churna is new");
    assert_eq!(prev_json["errors"].as_array().unwrap().len(), 1, "Row with empty medicine name is an error");

    // 2. Clinical Reference Preview: Conflicting reference flagged as conflict
    let ref_csv = "Chief Complaint,Duration,Roga Name,NAMC Code,Medicine Name,Formulation / Form,Dose,Frequency / Timing,Anupana,Duration / Context,Source,Validation Status\n\
Dry paroxysmal cough,3 Days,Vataja Kasa (Dry Cough),VKS-15,Sitopaladi Churna,Churna,15g,twice daily,Water,Acute,CCRAS Reference,VALIDATED";

    let ref_preview_payload = serde_json::json!({
        "csv_type": "clinical_reference",
        "csv_content": ref_csv
    });

    let ref_prev_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/diagnosis/medicines/import/preview")
                .header("Authorization", format!("Bearer {}", auth_token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&ref_preview_payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(ref_prev_res.status(), StatusCode::OK);
    let body = ref_prev_res.into_body().collect().await.unwrap().to_bytes();
    let ref_json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(ref_json["conflicts"].as_i64().unwrap(), 1, "Different dose must trigger conflict");
}

#[tokio::test]
async fn test_medicine_csv_commit_transactional_and_audit() {
    let (app, pool, _dir) = setup_test_app().await;
    let auth_token = login_user(&app, "admin").await;

    // Commit 1 new medicine master record via CSV content
    let med_csv = "Medicine Name,Formulation / Form,Strength,English Name,Hindi Name,Classical / Sanskrit Name,Source,Source Reference,Validation Status,Notes\n\
Commit Verification Rasayana,Avaleha,500mg,Commit Verification Rasayana,कमिट सत्यापन रसायन,Kamit Satyapana Rasayana,BAMS Classical,Classical text,VALIDATED,Transactional verification record";

    let commit_req = CsvCommitRequest {
        csv_type: Some("medicine_master".to_string()),
        csv_content: med_csv.to_string(),
        filename: Some("commit_test.csv".to_string()),
        dataset_name: Some("Test Ingestion".to_string()),
        dataset_version: Some("1.0".to_string()),
    };

    let commit_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/diagnosis/medicines/import/commit")
                .header("Authorization", format!("Bearer {}", auth_token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&commit_req).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(commit_res.status(), StatusCode::OK);
    let body = commit_res.into_body().collect().await.unwrap().to_bytes();
    let res_json: Value = serde_json::from_slice(&body).unwrap();
    assert!(res_json["success"].as_bool().unwrap());
    assert_eq!(res_json["inserted_medicines"].as_i64().unwrap(), 1);

    // Verify record exists in DB
    let med_row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM medicines WHERE name = 'Commit Verification Rasayana'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(med_row.0, 1);

    // Verify audit log has MEDICINE_DATA_IMPORTED
    let audit_row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM audit_logs WHERE action = 'MEDICINE_DATA_IMPORTED' AND details_json LIKE '%commit_test.csv%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_row.0, 1, "Audit event MEDICINE_DATA_IMPORTED must be written");
}

#[tokio::test]
async fn test_medicine_import_rbac_enforcement() {
    let (app, _pool, _dir) = setup_test_app().await;

    let auth_token = login_user(&app, "admin").await;
    let doc_token = login_user(&app, "dr_sharma").await;
    let asst_token = login_user(&app, "asst_priya").await;

    let payload = CsvCommitRequest {
        csv_type: Some("medicine_master".to_string()),
        csv_content: "Medicine Name,Formulation / Form,Strength,English Name,Hindi Name,Classical / Sanskrit Name,Source,Source Reference,Validation Status,Notes\nRBAC Test Herb,Churna,3g,RBAC Test Herb,आरबीएसी टेस्ट,Rbac Test,BAMS Classical,Reference,VALIDATED,RBAC verification".to_string(),
        filename: Some("rbac_test.csv".to_string()),
        dataset_name: None,
        dataset_version: None,
    };

    // 1. Unauthenticated -> 401
    let unauth_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/diagnosis/medicines/import/commit")
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauth_res.status(), StatusCode::UNAUTHORIZED);

    // 2. Doctor -> 403 Forbidden
    let doc_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/diagnosis/medicines/import/commit")
                .header("Authorization", format!("Bearer {}", doc_token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(doc_res.status(), StatusCode::FORBIDDEN);

    // 3. Assistant -> 403 Forbidden
    let asst_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/diagnosis/medicines/import/commit")
                .header("Authorization", format!("Bearer {}", asst_token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(asst_res.status(), StatusCode::FORBIDDEN);

    // 4. Authority -> 200 OK
    let auth_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/diagnosis/medicines/import/commit")
                .header("Authorization", format!("Bearer {}", auth_token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(auth_res.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_repeatable_chief_complaints_end_to_end() {
    let (app, pool, dir) = setup_test_app().await;
    let doc_token = login_user(&app, "dr_sharma").await;

    // 1. Create Patient and Intake Visit under Kayachikitsa department
    let ws_id = "ws_kayachikitsa";
    let patient = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: None,
            patient_code: None,
            opd_case_id: Some("OPD-2026-001".to_string()),
            full_name: "Rajesh Verma".to_string(),
            date_of_birth: Some("1978-01-01".to_string()),
            sex: Some("Male".to_string()),
            phone: Some("9876543210".to_string()),
            address: Some("Haridwar, UK".to_string()),
            emergency_contact: None,
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    let intake = VisitService::create_intake(
        &pool,
        ws_id,
        CreateVisitIntakeRequest {
            workspace_id: Some(ws_id.to_string()),
            patient_id: patient.id.clone(),
            doctor_id: "usr_dr_sharma".to_string(),
            purpose: Some("Multiple joint and back pains".to_string()),
            priority: Some(0),
            consent_status: Some("GIVEN".to_string()),
            consent_version: Some("1.0".to_string()),
            temperature: Some(98.6),
            pulse_rate: Some(72),
            respiratory_rate: Some(18),
            systolic_bp: Some(120),
            diastolic_bp: Some(80),
            oxygen_saturation: Some(99.0),
            height_cm: Some(172.0),
            weight_kg: Some(68.0),
            vitals_notes: None,
            idempotency_key: None,
            ayush_data_json: None,
            complaints_list: None,
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    let visit_id = intake.visit.id;

    // 2. Doctor saves consultation with 3 repeatable chief complaints with individual duration value & units
    let complaints = vec![
        VisitComplaintItem {
            complaint_text: "Katishoola".to_string(),
            duration_value: Some(3),
            duration_unit: Some("Weeks".to_string()),
            notes: Some("Aggravated in morning".to_string()),
        },
        VisitComplaintItem {
            complaint_text: "Janu Sandhigata Vata".to_string(),
            duration_value: Some(6),
            duration_unit: Some("Months".to_string()),
            notes: Some("Crepitus present".to_string()),
        },
        VisitComplaintItem {
            complaint_text: "Agnimandya".to_string(),
            duration_value: Some(4),
            duration_unit: Some("Days".to_string()),
            notes: Some("Post-prandial heaviness".to_string()),
        },
    ];

    let notes_payload = serde_json::json!({
        "complaints_list": complaints,
        "history_text": "Patient reports persistent lower back pain for 3 weeks.",
        "past_history": "No major past illnesses",
        "family_history": "Non-contributory",
        "personal_history": "Sedentary lifestyle"
    });

    let save_notes_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/v1/consultations/{}/notes", visit_id))
                .header("Authorization", format!("Bearer {}", doc_token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&notes_payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(save_notes_res.status(), StatusCode::OK);

    // 3. Fetch Visit Detail and verify complaints_list and backward-compatible summary
    let detail_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/visits/{}", visit_id))
                .header("Authorization", format!("Bearer {}", doc_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(detail_res.status(), StatusCode::OK);
    let body = detail_res.into_body().collect().await.unwrap().to_bytes();
    let detail_json: Value = serde_json::from_slice(&body).unwrap();

    let list = detail_json["complaints_list"].as_array().unwrap();
    assert_eq!(list.len(), 3, "Must return all 3 individual chief complaints");

    assert_eq!(list[0]["complaint_text"], "Katishoola");
    assert_eq!(list[0]["duration_value"], 3);
    assert_eq!(list[0]["duration_unit"], "Weeks");

    assert_eq!(list[1]["complaint_text"], "Janu Sandhigata Vata");
    assert_eq!(list[1]["duration_value"], 6);
    assert_eq!(list[1]["duration_unit"], "Months");

    assert_eq!(list[2]["complaint_text"], "Agnimandya");
    assert_eq!(list[2]["duration_value"], 4);
    assert_eq!(list[2]["duration_unit"], "Days");

    // Check backward-compatible summary in complaints.chief_complaint
    let summary = detail_json["complaints"]["chief_complaint"].as_str().unwrap();
    assert!(summary.contains("Katishoola"));
    assert!(summary.contains("3 Weeks"));
    assert!(summary.contains("Janu Sandhigata Vata"));
    assert!(summary.contains("6 Months"));
    assert!(summary.contains("Agnimandya"));
    assert!(summary.contains("4 Days"));

    // 4. Fetch Patient History and verify complaints_list is preserved in historical encounters
    let history_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/patients/{}/history", patient.id))
                .header("Authorization", format!("Bearer {}", doc_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(history_res.status(), StatusCode::OK);
    let body = history_res.into_body().collect().await.unwrap().to_bytes();
    let history_visits: Vec<Value> = serde_json::from_slice(&body).unwrap();
    assert!(!history_visits.is_empty());
    let first_hist = &history_visits[0];
    let hist_complaints = first_hist["complaints_list"].as_array().unwrap();
    assert_eq!(hist_complaints.len(), 3);

    // 5. Verify Document Generator generates Case Sheet with all 3 complaints
    let doc = DocumentService::generate_case_sheet(
        &pool,
        dir.path(),
        &visit_id,
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    assert!(std::path::Path::new(&doc.file_path).exists());
    let html_path = std::path::Path::new(&doc.file_path).with_extension("html");
    assert!(!html_path.exists(), "HTML case sheet must NOT be stored on disk alongside PDF");
    let pdf_bytes = std::fs::read(&doc.file_path).unwrap();
    let pdf_str = String::from_utf8_lossy(&pdf_bytes);

    assert!(pdf_str.contains("Katishoola"));
    assert!(pdf_str.contains("3 Weeks"));
    assert!(pdf_str.contains("Janu Sandhigata Vata"));
    assert!(pdf_str.contains("6 Months"));
    assert!(pdf_str.contains("Agnimandya"));
    assert!(pdf_str.contains("4 Days"));
}
