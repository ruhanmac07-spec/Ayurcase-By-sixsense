use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::Value;
use sixsense_server::{
    api::create_router,
    models::{
        patient::CreatePatientRequest,
        prescription::{PrescriptionItemInput, SavePrescriptionDraftRequest},
        visit::{CreateVisitIntakeRequest, VisitComplaintItem},
    },
    repositories::{init_pool, run_migrations, seed_initial_data_if_empty},
    services::{ConsultationService, PatientService, PrescriptionService, VisitService},
};
use tempfile::tempdir;
use tower::ServiceExt;

async fn setup_test_app() -> (axum::Router, sqlx::SqlitePool, tempfile::TempDir) {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_acceptance_doc.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    // Set doctor name to "Ruhan Memon, BAMS MD" as in exact acceptance test
    sqlx::query("UPDATE users SET full_name = 'Ruhan Memon, BAMS MD' WHERE id = 'usr_dr_sharma'")
        .execute(&pool)
        .await
        .unwrap();

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

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    json["token"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn test_exact_acceptance_document_rendering_and_returning_patient() {
    let (app, pool, _dir) = setup_test_app().await;
    let token = login_user(&app, "dr_sharma").await;
    let ws_id = "ws_kayachikitsa";

    // =========================================================================
    // SECTION 17 & 18: TEST WITH A FRESH TEST PATIENT
    // Patient Name: Anshul
    // Patient Code: 0007
    // DOB: 10/12/2003
    // Gender: Male
    // Contact: 1234567890
    // =========================================================================
    let patient = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: None,
            patient_code: Some("0007".to_string()),
            full_name: "Anshul".to_string(),
            date_of_birth: Some("2003-12-10".to_string()), // ISO date stored internally
            sex: Some("Male".to_string()),
            phone: Some("1234567890".to_string()),
            address: Some("Ahmedabad".to_string()),
            emergency_contact: None,
            opd_case_id: None,
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    assert_eq!(patient.patient_code, "0007");

    // Intake Visit 1 with raw ISO timestamp (as observed in problem statement)
    let intake1 = VisitService::create_intake(
        &pool,
        ws_id,
        CreateVisitIntakeRequest {
            workspace_id: Some(ws_id.to_string()),
            patient_id: patient.id.clone(),
            doctor_id: "usr_dr_sharma".to_string(),
            purpose: Some("General Ayurvedic consultation".to_string()),
            priority: Some(1),
            consent_status: Some("GIVEN".to_string()),
            consent_version: Some("v1.0".to_string()),
            temperature: Some(98.4),
            pulse_rate: Some(72),
            respiratory_rate: Some(16),
            systolic_bp: Some(120),
            diastolic_bp: Some(80),
            oxygen_saturation: Some(99.0),
            height_cm: Some(170.0),
            weight_kg: Some(65.0),
            vitals_notes: None,
            idempotency_key: None,
            ayush_data_json: None,
            complaints_list: None,
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    let visit1_id = &intake1.visit.id;

    // Simulate visit_date being the exact ISO timestamp observed in problem: "2026-09-20T05:52:39.404378+00:00"
    sqlx::query(
        "UPDATE visits SET visit_date = '2026-09-20T05:52:39.404378+00:00', opd_number = '0007/20/09/2026', patient_visit_seq = 1 WHERE id = ?"
    )
    .bind(visit1_id)
    .execute(&pool)
    .await
    .unwrap();

    // Attach complaints & clinical notes
    ConsultationService::save_clinical_notes(
        &pool,
        visit1_id,
        Some("Kasa and Shwasa".to_string()),
        Some("Aggravated by cold food".to_string()),
        None,
        None,
        None,
        None,
        Some("v1.0".to_string()),
        "usr_dr_sharma",
        Some(vec![
            VisitComplaintItem {
                complaint_text: "Kasa (Cough)".to_string(),
                duration_value: Some(3),
                duration_unit: Some("Days".to_string()),
                notes: None,
            }
        ]),
    )
    .await
    .unwrap();

    // Attach Prescription draft and finalize
    PrescriptionService::save_draft(
        &pool,
        visit1_id,
        SavePrescriptionDraftRequest {
            source_rule_id: None,
            source_rule_version: None,
            items: vec![
                PrescriptionItemInput {
                    medicine_id: None,
                    medicine_name_snapshot: "Sitopaladi Churna".to_string(),
                    dosage_text: Some("3g".to_string()),
                    frequency_text: Some("Twice daily".to_string()),
                    duration_text: Some("7 days".to_string()),
                    anupana_text: Some("Honey and warm water".to_string()),
                    pathya_text: Some("Warm light food".to_string()),
                    apathya_text: Some("Cold drinks".to_string()),
                    source_type: "DOCTOR_ADDED".to_string(),
                    rule_id: None,
                    rule_version: None,
                }
            ],
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    PrescriptionService::finalize_prescription(&pool, visit1_id, "usr_dr_sharma")
        .await
        .unwrap();

    // =========================================================================
    // GENERATE CASE SHEET & PRESCRIPTION DOCUMENTS
    // =========================================================================
    let req_gen_cs = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/documents/generate-case-sheet/{}", visit1_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_gen_cs = app.clone().oneshot(req_gen_cs).await.unwrap();
    assert_eq!(res_gen_cs.status(), StatusCode::OK);
    let doc_cs_json: Value = serde_json::from_slice(&res_gen_cs.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let cs_doc_id = doc_cs_json["id"].as_str().unwrap();

    let req_gen_rx = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/documents/generate-prescription/{}", visit1_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_gen_rx = app.clone().oneshot(req_gen_rx).await.unwrap();
    assert_eq!(res_gen_rx.status(), StatusCode::OK);
    let doc_rx_json: Value = serde_json::from_slice(&res_gen_rx.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let rx_doc_id = doc_rx_json["id"].as_str().unwrap();

    // =========================================================================
    // VERIFY 1: CASE SHEET HTML (PREVIEW & PRINT TEMPLATE)
    // =========================================================================
    let req_cs_html = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/documents/{}/download?format=html", cs_doc_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_cs_html = app.clone().oneshot(req_cs_html).await.unwrap();
    assert_eq!(res_cs_html.status(), StatusCode::OK);
    let cs_html = String::from_utf8_lossy(&res_cs_html.into_body().collect().await.unwrap().to_bytes()).to_string();
    println!("\n=== CASE SHEET HTML ===\n{}\n=======================\n", cs_html);

    // Check REQUIRED fields in Case Sheet HTML
    assert!(cs_html.contains("0007/20/09/2026"), "Case Sheet HTML must contain OPD No. 0007/20/09/2026");
    assert!(cs_html.contains("0007"), "Case Sheet HTML must contain Patient Code 0007");
    assert!(cs_html.contains("01"), "Case Sheet HTML must contain Visit No. 01");
    assert!(cs_html.contains("20/09/2026"), "Case Sheet HTML must contain Date 20/09/2026");
    assert!(cs_html.contains("Anshul"), "Case Sheet HTML must contain Patient Name Anshul");
    assert!(cs_html.contains("Male"), "Case Sheet HTML must contain Gender Male");
    assert!(cs_html.contains("10/12/2003"), "Case Sheet HTML must contain DOB 10/12/2003");
    assert!(cs_html.contains("1234567890"), "Case Sheet HTML must contain Contact 1234567890");
    assert!(cs_html.contains("Ruhan Memon, BAMS MD"), "Case Sheet HTML must contain Doctor name");

    // Check FORBIDDEN fields in Case Sheet HTML
    assert!(!cs_html.contains("OPD Number: None"), "Must NOT contain 'OPD Number: None'");
    assert!(!cs_html.contains("OPD Case Number: None"), "Must NOT contain 'OPD Case Number: None'");
    assert!(!cs_html.contains("None"), "Must NOT contain 'None'");
    assert!(!cs_html.contains("vis_"), "Must NOT contain internal 'vis_' UUID");
    assert!(!cs_html.contains("2026-09-20T05:52:39"), "Must NOT contain raw timestamp");
    assert!(!cs_html.contains("+00:00"), "Must NOT contain timezone offset");

    // =========================================================================
    // VERIFY 2: CASE SHEET PDF (SAVED / PRINTED BINARY)
    // =========================================================================
    let req_cs_pdf = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/documents/{}/download?format=pdf", cs_doc_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_cs_pdf = app.clone().oneshot(req_cs_pdf).await.unwrap();
    assert_eq!(res_cs_pdf.status(), StatusCode::OK);
    let cs_pdf_bytes = res_cs_pdf.into_body().collect().await.unwrap().to_bytes();
    let cs_pdf_text = String::from_utf8_lossy(&cs_pdf_bytes);

    println!("\n=== CASE SHEET PDF TEXT ===\n{}\n===========================\n", cs_pdf_text);
    assert!(cs_pdf_text.contains("0007/20/09/2026"), "Case Sheet PDF must contain OPD No.");
    assert!(cs_pdf_text.contains("Patient Code: 0007"), "Case Sheet PDF must contain Patient Code: 0007");
    assert!(cs_pdf_text.contains("Visit No.:    01"), "Case Sheet PDF must contain Visit No.: 01");
    assert!(cs_pdf_text.contains("Date: 20/09/2026"), "Case Sheet PDF must contain Date: 20/09/2026");
    assert!(cs_pdf_text.contains("Doctor: Ruhan Memon, BAMS MD"), "Case Sheet PDF must contain Doctor");
    assert!(cs_pdf_text.contains("Patient Name: Anshul"), "Case Sheet PDF must contain Patient Name");
    assert!(cs_pdf_text.contains("Gender:       Male"), "Case Sheet PDF must contain Gender");
    assert!(cs_pdf_text.contains("DOB:          10/12/2003"), "Case Sheet PDF must contain DOB: 10/12/2003");
    assert!(cs_pdf_text.contains("Contact:      1234567890"), "Case Sheet PDF must contain Contact");

    assert!(!cs_pdf_text.contains("None"), "PDF must NOT contain None");
    assert!(!cs_pdf_text.contains("vis_"), "PDF must NOT contain internal vis_ ID");
    assert!(!cs_pdf_text.contains("2026-09-20T05:52:39"), "PDF must NOT contain raw timestamp");
    assert!(!cs_pdf_text.contains("+00:00"), "PDF must NOT contain timezone offset");

    // =========================================================================
    // VERIFY 3: PRESCRIPTION HTML (SEALED CLINICAL PRESCRIPTION PREVIEW)
    // =========================================================================
    let req_rx_html = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/documents/{}/download?format=html", rx_doc_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_rx_html = app.clone().oneshot(req_rx_html).await.unwrap();
    assert_eq!(res_rx_html.status(), StatusCode::OK);
    let rx_html = String::from_utf8_lossy(&res_rx_html.into_body().collect().await.unwrap().to_bytes()).to_string();

    assert!(rx_html.contains("0007/20/09/2026"), "Prescription HTML must contain OPD No. 0007/20/09/2026");
    assert!(rx_html.contains("0007"), "Prescription HTML must contain Patient Code 0007");
    assert!(rx_html.contains("01"), "Prescription HTML must contain Visit No. 01");
    assert!(rx_html.contains("20/09/2026"), "Prescription HTML must contain Date 20/09/2026");
    assert!(rx_html.contains("Anshul"), "Prescription HTML must contain Patient Name Anshul");
    assert!(rx_html.contains("Male"), "Prescription HTML must contain Gender Male");
    assert!(rx_html.contains("10/12/2003"), "Prescription HTML must contain DOB 10/12/2003");
    assert!(rx_html.contains("1234567890"), "Prescription HTML must contain Contact 1234567890");
    assert!(rx_html.contains("Ruhan Memon, BAMS MD"), "Prescription HTML must contain Doctor name");

    assert!(!rx_html.contains("OPD Number: None"), "Must NOT contain 'OPD Number: None'");
    assert!(!rx_html.contains("OPD Case Number: None"), "Must NOT contain 'OPD Case Number: None'");
    assert!(!rx_html.contains("None"), "Must NOT contain 'None'");
    assert!(!rx_html.contains("vis_"), "Must NOT contain internal 'vis_' UUID");
    assert!(!rx_html.contains("2026-09-20T05:52:39"), "Must NOT contain raw timestamp");
    assert!(!rx_html.contains("+00:00"), "Must NOT contain timezone offset");

    // =========================================================================
    // VERIFY 4: PRESCRIPTION PDF
    // =========================================================================
    let req_rx_pdf = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/documents/{}/download?format=pdf", rx_doc_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_rx_pdf = app.clone().oneshot(req_rx_pdf).await.unwrap();
    assert_eq!(res_rx_pdf.status(), StatusCode::OK);
    let rx_pdf_bytes = res_rx_pdf.into_body().collect().await.unwrap().to_bytes();
    let rx_pdf_text = String::from_utf8_lossy(&rx_pdf_bytes);

    assert!(rx_pdf_text.contains("0007/20/09/2026"), "Prescription PDF must contain OPD No.");
    assert!(rx_pdf_text.contains("Patient Code: 0007"), "Prescription PDF must contain Patient Code: 0007");
    assert!(rx_pdf_text.contains("Visit No.:    01"), "Prescription PDF must contain Visit No.: 01");
    assert!(rx_pdf_text.contains("Date: 20/09/2026"), "Prescription PDF must contain Date: 20/09/2026");
    assert!(rx_pdf_text.contains("Doctor: Ruhan Memon, BAMS MD"), "Prescription PDF must contain Doctor");
    assert!(rx_pdf_text.contains("Patient Name: Anshul"), "Prescription PDF must contain Patient Name");

    assert!(!rx_pdf_text.contains("None"), "Prescription PDF must NOT contain None");
    assert!(!rx_pdf_text.contains("vis_"), "Prescription PDF must NOT contain internal vis_ ID");
    assert!(!rx_pdf_text.contains("2026-09-20T05:52:39"), "Prescription PDF must NOT contain raw timestamp");

    // =========================================================================
    // SECTION 19: SECOND TEST — RETURNING PATIENT
    // Same patient (0007), new visit on a different date (e.g. 25/09/2026)
    // Must produce:
    // Same Patient Code: 0007
    // New OPD: 0007/25/09/2026
    // Visit No.: 02
    // =========================================================================
    let intake2 = VisitService::create_intake(
        &pool,
        ws_id,
        CreateVisitIntakeRequest {
            workspace_id: Some(ws_id.to_string()),
            patient_id: patient.id.clone(),
            doctor_id: "usr_dr_sharma".to_string(),
            purpose: Some("Follow-up visit".to_string()),
            priority: Some(1),
            consent_status: Some("GIVEN".to_string()),
            consent_version: Some("v1.0".to_string()),
            temperature: Some(98.2),
            pulse_rate: Some(70),
            respiratory_rate: Some(16),
            systolic_bp: Some(118),
            diastolic_bp: Some(78),
            oxygen_saturation: Some(99.0),
            height_cm: Some(170.0),
            weight_kg: Some(65.0),
            vitals_notes: None,
            idempotency_key: None,
            ayush_data_json: None,
            complaints_list: None,
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    let visit2_id = &intake2.visit.id;

    // Set visit 2 date to 2026-09-25
    sqlx::query(
        "UPDATE visits SET visit_date = '2026-09-25T10:00:00.000000+00:00', opd_number = '0007/25/09/2026', patient_visit_seq = 2 WHERE id = ?"
    )
    .bind(visit2_id)
    .execute(&pool)
    .await
    .unwrap();

    // Save prescription draft for visit 2 then finalize
    PrescriptionService::save_draft(
        &pool,
        visit2_id,
        SavePrescriptionDraftRequest {
            source_rule_id: None,
            source_rule_version: None,
            items: vec![
                PrescriptionItemInput {
                    medicine_id: None,
                    medicine_name_snapshot: "Ashwagandha Churna".to_string(),
                    dosage_text: Some("3g".to_string()),
                    frequency_text: Some("Once daily at bedtime".to_string()),
                    duration_text: Some("14 days".to_string()),
                    anupana_text: Some("Warm milk".to_string()),
                    pathya_text: None,
                    apathya_text: None,
                    source_type: "DOCTOR_ADDED".to_string(),
                    rule_id: None,
                    rule_version: None,
                }
            ],
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    PrescriptionService::finalize_prescription(&pool, visit2_id, "usr_dr_sharma")
        .await
        .unwrap();

    // Generate Case Sheet for visit 2
    let req_gen_cs2 = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/documents/generate-case-sheet/{}", visit2_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_gen_cs2 = app.clone().oneshot(req_gen_cs2).await.unwrap();
    assert_eq!(res_gen_cs2.status(), StatusCode::OK);
    let doc_cs2_json: Value = serde_json::from_slice(&res_gen_cs2.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let cs2_doc_id = doc_cs2_json["id"].as_str().unwrap();

    // Check Case Sheet HTML for visit 2
    let req_cs2_html = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/documents/{}/download?format=html", cs2_doc_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_cs2_html = app.clone().oneshot(req_cs2_html).await.unwrap();
    assert_eq!(res_cs2_html.status(), StatusCode::OK);
    let cs2_html = String::from_utf8_lossy(&res_cs2_html.into_body().collect().await.unwrap().to_bytes()).to_string();

    assert!(cs2_html.contains("0007/25/09/2026"), "Visit 2 Case Sheet HTML must have new OPD No. 0007/25/09/2026");
    assert!(cs2_html.contains("0007"), "Visit 2 Case Sheet HTML must retain Patient Code 0007");
    assert!(cs2_html.contains("02"), "Visit 2 Case Sheet HTML must have Visit No. 02");
    assert!(cs2_html.contains("25/09/2026"), "Visit 2 Case Sheet HTML must have Date 25/09/2026");

    // Check Case Sheet PDF for visit 2
    let req_cs2_pdf = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/documents/{}/download?format=pdf", cs2_doc_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_cs2_pdf = app.clone().oneshot(req_cs2_pdf).await.unwrap();
    assert_eq!(res_cs2_pdf.status(), StatusCode::OK);
    let cs2_pdf_bytes = res_cs2_pdf.into_body().collect().await.unwrap().to_bytes();
    let cs2_pdf_text = String::from_utf8_lossy(&cs2_pdf_bytes);

    assert!(cs2_pdf_text.contains("0007/25/09/2026"), "Visit 2 PDF must contain new OPD No.");
    assert!(cs2_pdf_text.contains("Visit No.:    02"), "Visit 2 PDF must contain Visit No.: 02");
    assert!(cs2_pdf_text.contains("Date: 25/09/2026"), "Visit 2 PDF must contain Date: 25/09/2026");
    assert!(cs2_pdf_text.contains("Patient Code: 0007"), "Visit 2 PDF must retain Patient Code 0007");

    // Re-verify that Visit 1 Case Sheet HTML & PDF remain UNCHANGED with 01 and 20/09/2026
    let req_cs1_recheck = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/documents/{}/download?format=pdf", cs_doc_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_cs1_recheck = app.clone().oneshot(req_cs1_recheck).await.unwrap();
    assert_eq!(res_cs1_recheck.status(), StatusCode::OK);
    let cs1_recheck_bytes = res_cs1_recheck.into_body().collect().await.unwrap().to_bytes();
    let cs1_recheck_text = String::from_utf8_lossy(&cs1_recheck_bytes);

    assert!(cs1_recheck_text.contains("0007/20/09/2026"), "Visit 1 PDF must still contain OPD 0007/20/09/2026");
    assert!(cs1_recheck_text.contains("Visit No.:    01"), "Visit 1 PDF must still contain Visit No.: 01");
    assert!(cs1_recheck_text.contains("Date: 20/09/2026"), "Visit 1 PDF must still contain Date: 20/09/2026");
}
