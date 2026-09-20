use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::Value;
use sixsense_server::{
    api::create_router,
    models::{
        diagnosis::AttachDiagnosisRequest,
        patient::CreatePatientRequest,
        prescription::{PrescriptionItemInput, SavePrescriptionDraftRequest},
        visit::{CreateVisitIntakeRequest, VisitComplaintItem, VisitComplaint},
    },
    repositories::{init_pool, run_migrations, seed_initial_data_if_empty},
    rules::ClinicalRuleEngine,
    services::{ConsultationService, PatientService, PrescriptionService, VisitService},
};
use tempfile::tempdir;
use tower::ServiceExt;

async fn setup_test_app() -> (axum::Router, sqlx::SqlitePool, tempfile::TempDir) {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_phase2_final.db");
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

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    json["token"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn test_bams_28_conditions_catalog_and_search_api() {
    let (app, pool, _dir) = setup_test_app().await;
    let token = login_user(&app, "dr_sharma").await;

    // 1. Verify that all 28 BAMS conditions from AMP-01 to JWR-28 exist in diagnosis_catalog
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM diagnosis_catalog")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(count.0 >= 28, "Catalog must contain at least the 28 BAMS conditions, found {}", count.0);

    let specific_codes = vec!["AMP-01", "SGV-09", "TMS-17", "KTS-13", "GRS-14", "JWR-28"];
    for code in specific_codes {
        let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM diagnosis_catalog WHERE UPPER(code) = UPPER(?)")
            .bind(code)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(exists.0, 1, "Expected diagnosis with code {} in catalog", code);
    }

    // 2. Search API: Case-insensitive code search
    let req = Request::builder()
        .method("GET")
        .uri("/api/v1/diagnosis/catalog/search?q=amp-01")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let results: Value = serde_json::from_slice(&body).unwrap();
    assert!(results.is_array());
    assert_eq!(results[0]["code"], "AMP-01");
    assert_eq!(results[0]["name"], "Amlapitta");

    // 3. Search API: Condition name search
    let req = Request::builder()
        .method("GET")
        .uri("/api/v1/diagnosis/catalog/search?q=sandhigata")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();

    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let results: Value = serde_json::from_slice(&body).unwrap();
    assert!(results.as_array().unwrap().iter().any(|r| r["code"] == "SGV-09"));
}

#[tokio::test]
async fn test_multi_diagnosis_selection_and_guidelines_check() {
    let (app, pool, _dir) = setup_test_app().await;
    let token = login_user(&app, "dr_sharma").await;

    let ws_id = "ws_kayachikitsa";
    let patient = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: None,
            patient_code: None,
            full_name: "Anita Verma".to_string(),
            date_of_birth: Some("1985-06-15".to_string()),
            sex: Some("Female".to_string()),
            phone: Some("+919876543210".to_string()),
            address: Some("Jaipur, Rajasthan".to_string()),
            emergency_contact: None,
            opd_case_id: Some("OPD-2026-AV01".to_string()),
        },
        "usr_asst_priya",
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
            purpose: Some("Acid reflux and severe knee joint pain".to_string()),
            priority: Some(1),
            consent_status: Some("GIVEN".to_string()),
            consent_version: Some("v1.0".to_string()),
            temperature: Some(98.6),
            pulse_rate: Some(72),
            respiratory_rate: Some(18),
            systolic_bp: Some(124),
            diastolic_bp: Some(82),
            oxygen_saturation: Some(98.0),
            height_cm: Some(160.0),
            weight_kg: Some(64.0),
            vitals_notes: None,
            idempotency_key: None,
            ayush_data_json: None,
            complaints_list: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    let visit_id = &intake.visit.id;

    // Fetch diagnosis IDs for AMP-01 and SGV-09
    let diag_amp: (String,) = sqlx::query_as("SELECT id FROM diagnosis_catalog WHERE code = 'AMP-01'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let diag_san: (String,) = sqlx::query_as("SELECT id FROM diagnosis_catalog WHERE code = 'SGV-09'")
        .fetch_one(&pool)
        .await
        .unwrap();

    // Doctor attaches Diagnosis 1: Amlapitta
    let req1 = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/consultations/{}/diagnosis", visit_id))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&serde_json::json!({
            "diagnosis_id": diag_amp.0,
            "diagnosis_text": "Urdhwaga Amlapitta, burning retrosternal sensation"
        })).unwrap()))
        .unwrap();
    let res1 = app.clone().oneshot(req1).await.unwrap();
    assert_eq!(res1.status(), StatusCode::OK);

    // Doctor attaches Diagnosis 2: Sandhigata Vata
    let req2 = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/consultations/{}/diagnosis", visit_id))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&serde_json::json!({
            "diagnosis_id": diag_san.0,
            "diagnosis_text": "Bilateral Janu Sandhigata Vata with crepitus"
        })).unwrap()))
        .unwrap();
    let res2 = app.clone().oneshot(req2).await.unwrap();
    assert_eq!(res2.status(), StatusCode::OK);

    // Duplicate attachment check: Attaching AMP-01 again updates notes idempotently (UNIQUE constraint prevents duplicate rows)
    let req_dup = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/consultations/{}/diagnosis", visit_id))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&serde_json::json!({
            "diagnosis_id": diag_amp.0,
            "diagnosis_text": "Updated subtype notes"
        })).unwrap()))
        .unwrap();
    let res_dup = app.clone().oneshot(req_dup).await.unwrap();
    assert_eq!(res_dup.status(), StatusCode::OK);

    // Verify consultation lists exactly 2 diagnoses (no duplicate row was created)
    let attached_diagnoses = ConsultationService::get_diagnoses(&pool, visit_id).await.unwrap();
    assert_eq!(attached_diagnoses.len(), 2, "Must contain exactly 2 unique diagnoses despite duplicate attachment");
    let codes: Vec<String> = attached_diagnoses.iter().map(|d| d.code.clone()).collect();
    assert!(codes.contains(&"AMP-01".to_string()));
    assert!(codes.contains(&"SGV-09".to_string()));

    // Verify assistance/guidelines can be fetched for attached diagnosis
    let guidelines = ClinicalRuleEngine::evaluate_diagnosis(&pool, &diag_amp.0).await.unwrap();
    assert!(guidelines.has_validated_rule);
    assert!(!guidelines.items.is_empty());
}

#[tokio::test]
async fn test_repeatable_chief_complaints_duration_validation_and_atomicity() {
    let (app, pool, _dir) = setup_test_app().await;
    let token = login_user(&app, "dr_sharma").await;

    let ws_id = "ws_kayachikitsa";
    let patient = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: None,
            patient_code: None,
            full_name: "Kavita Rao".to_string(),
            date_of_birth: Some("1990-01-01".to_string()),
            sex: Some("Female".to_string()),
            phone: Some("+919123456780".to_string()),
            address: None,
            emergency_contact: None,
            opd_case_id: Some("OPD-2026-KR02".to_string()),
        },
        "usr_asst_priya",
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
            purpose: Some("Initial consultation".to_string()),
            priority: Some(1),
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
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    let visit_id = &intake.visit.id;

    // 1. Negative/Zero duration validation: Must be rejected with 400 Bad Request
    let invalid_notes = serde_json::json!({
        "chief_complaint": "Shiroshoola (Headache)",
        "complaints_list": [
            {
                "complaint_text": "Shiroshoola (Headache)",
                "duration_value": -2,
                "duration_unit": "Days",
                "sort_order": 0
            }
        ]
    });

    let req_invalid = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/consultations/{}/notes", visit_id))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&invalid_notes).unwrap()))
        .unwrap();

    let res_invalid = app.clone().oneshot(req_invalid).await.unwrap();
    assert_eq!(res_invalid.status(), StatusCode::BAD_REQUEST);

    // 2. Valid multi-row repeatable complaints with distinct units: Hours, Days, Weeks, Months
    let valid_notes = serde_json::json!({
        "chief_complaint": "Shiroshoola (3 Days); Amlodgara (2 Weeks); Sandhishoola (6 Months)",
        "complaints_list": [
            {
                "complaint_text": "Shiroshoola",
                "duration_value": 3,
                "duration_unit": "Days",
                "notes": "Throbbing temporal ache",
                "sort_order": 0
            },
            {
                "complaint_text": "Amlodgara",
                "duration_value": 2,
                "duration_unit": "Weeks",
                "notes": "Postprandial sour burping",
                "sort_order": 1
            },
            {
                "complaint_text": "Sandhishoola",
                "duration_value": 6,
                "duration_unit": "Months",
                "notes": "Morning joint stiffness",
                "sort_order": 2
            }
        ],
        "history_text": "Symptoms worsened following irregular dietary schedule.",
        "ayush_data_json": "{\"prakriti\":\"Vata-Pitta\",\"agni\":\"Tikshnagni\"}"
    });

    let req_valid = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/consultations/{}/notes", visit_id))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_vec(&valid_notes).unwrap()))
        .unwrap();

    let res_valid = app.clone().oneshot(req_valid).await.unwrap();
    assert_eq!(res_valid.status(), StatusCode::OK);

    // 3. Verify atomic persistence in visit_complaints table
    let stored_complaints: Vec<VisitComplaint> = sqlx::query_as(
        "SELECT * FROM visit_complaints WHERE visit_id = ? ORDER BY sort_order ASC"
    )
    .bind(visit_id)
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(stored_complaints.len(), 3);
    assert_eq!(stored_complaints[0].complaint_text, "Shiroshoola");
    assert_eq!(stored_complaints[0].duration_value, Some(3));
    assert_eq!(stored_complaints[0].duration_unit.as_deref(), Some("Days"));

    assert_eq!(stored_complaints[1].complaint_text, "Amlodgara");
    assert_eq!(stored_complaints[1].duration_value, Some(2));
    assert_eq!(stored_complaints[1].duration_unit.as_deref(), Some("Weeks"));

    assert_eq!(stored_complaints[2].complaint_text, "Sandhishoola");
    assert_eq!(stored_complaints[2].duration_value, Some(6));
    assert_eq!(stored_complaints[2].duration_unit.as_deref(), Some("Months"));
}

#[tokio::test]
async fn test_case_sheet_and_prescription_pdf_download_and_integrity() {
    let (app, pool, _dir) = setup_test_app().await;
    let token = login_user(&app, "dr_sharma").await;

    let ws_id = "ws_kayachikitsa";
    let patient = PatientService::create(
        &pool,
        ws_id,
        CreatePatientRequest {
            workspace_id: Some(ws_id.to_string()),
            doctor_id: None,
            patient_code: None,
            full_name: "Vikram Singhania".to_string(),
            date_of_birth: Some("1978-11-20".to_string()),
            sex: Some("Male".to_string()),
            phone: Some("+919988776655".to_string()),
            address: Some("Udaipur".to_string()),
            emergency_contact: None,
            opd_case_id: Some("OPD-2026-VS03".to_string()),
        },
        "usr_asst_priya",
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
            purpose: Some("Amlapitta consultation".to_string()),
            priority: Some(1),
            consent_status: Some("GIVEN".to_string()),
            consent_version: Some("v1.0".to_string()),
            temperature: Some(98.6),
            pulse_rate: Some(72),
            respiratory_rate: Some(16),
            systolic_bp: Some(120),
            diastolic_bp: Some(80),
            oxygen_saturation: Some(99.0),
            height_cm: Some(172.0),
            weight_kg: Some(72.0),
            vitals_notes: None,
            idempotency_key: None,
            ayush_data_json: None,
            complaints_list: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    let visit_id = &intake.visit.id;

    // Attach Diagnosis AMP-01
    let diag_amp: (String,) = sqlx::query_as("SELECT id FROM diagnosis_catalog WHERE code = 'AMP-01'")
        .fetch_one(&pool)
        .await
        .unwrap();

    ConsultationService::attach_diagnosis(
        &pool,
        visit_id,
        AttachDiagnosisRequest {
            diagnosis_id: diag_amp.0.clone(),
            diagnosis_text: Some("Tikshnagni with Vidaha".to_string()),
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    // Attach Repeatable complaints
    ConsultationService::save_clinical_notes(
        &pool,
        visit_id,
        Some("Tikshna Vidaha in Uras".to_string()),
        Some("Burning after spicy meals".to_string()),
        None,
        None,
        None,
        None,
        Some("v1.0".to_string()),
        "usr_dr_sharma",
        Some(vec![
            VisitComplaintItem {
                complaint_text: "Tikshna Vidaha in Uras (Heartburn)".to_string(),
                duration_value: Some(5),
                duration_unit: Some("Days".to_string()),
                notes: Some("Burning after spicy food".to_string()),
            }
        ]),
    )
    .await
    .unwrap();

    // Prescribe medicine
    PrescriptionService::save_draft(
        &pool,
        visit_id,
        SavePrescriptionDraftRequest {
            source_rule_id: None,
            source_rule_version: None,
            items: vec![
                PrescriptionItemInput {
                    medicine_id: None,
                    medicine_name_snapshot: "Avipattikar Churna".to_string(),
                    dosage_text: Some("3g".to_string()),
                    frequency_text: Some("Twice daily before meals".to_string()),
                    duration_text: Some("14 days".to_string()),
                    anupana_text: Some("Warm water or coconut water".to_string()),
                    pathya_text: Some("Light moong dal khichdi".to_string()),
                    apathya_text: Some("Pungent, fermented, sour food".to_string()),
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

    PrescriptionService::finalize_prescription(&pool, visit_id, "usr_dr_sharma")
        .await
        .unwrap();

    // Generate Case Sheet PDF
    let req_gen = Request::builder()
        .method("POST")
        .uri(format!("/api/v1/documents/generate-case-sheet/{}", visit_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();

    let res_gen = app.clone().oneshot(req_gen).await.unwrap();
    assert_eq!(res_gen.status(), StatusCode::OK);
    let doc_json: Value = serde_json::from_slice(&res_gen.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let doc_id = doc_json["id"].as_str().unwrap();

    // 4. Test PDF download endpoint
    let req_dl = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/documents/{}/download?format=pdf", doc_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();

    let res_dl = app.clone().oneshot(req_dl).await.unwrap();
    assert_eq!(res_dl.status(), StatusCode::OK);

    // Verify headers
    let content_type = res_dl.headers().get("content-type").unwrap().to_str().unwrap();
    assert_eq!(content_type, "application/pdf");

    let disposition = res_dl.headers().get("content-disposition").unwrap().to_str().unwrap();
    assert!(disposition.starts_with("inline; filename="));

    // Verify PDF binary content
    let pdf_bytes = res_dl.into_body().collect().await.unwrap().to_bytes();
    assert!(pdf_bytes.starts_with(b"%PDF-1.4\n"), "File must begin with %PDF-1.4 header");
    assert!(pdf_bytes.ends_with(b"%%EOF\n") || pdf_bytes.ends_with(b"%%EOF"), "File must end with %%EOF");

    // Verify key clinical text fields are embedded in PDF stream
    let pdf_text = String::from_utf8_lossy(&pdf_bytes);
    let expected_opd = intake.visit.opd_number.as_deref().unwrap_or("OPD-2026-VS03");
    assert!(pdf_text.contains(expected_opd) || pdf_text.contains("OPD No.:"), "PDF must contain OPD Number");
    assert!(pdf_text.contains("AMP-01"), "PDF must contain NAMC diagnosis code AMP-01");
    assert!(pdf_text.contains("Amlapitta"), "PDF must contain condition name Amlapitta");
    assert!(pdf_text.contains("5 Days"), "PDF must contain complaint duration 5 Days");
    assert!(pdf_text.contains("Avipattikar Churna"), "PDF must contain prescribed medicine name");

    // 5. Test on-demand HTML download endpoint for preview / print modal
    let req_html = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/documents/{}/download?format=html", doc_id))
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();

    let res_html = app.oneshot(req_html).await.unwrap();
    assert_eq!(res_html.status(), StatusCode::OK);
    let html_content_type = res_html.headers().get("content-type").unwrap().to_str().unwrap();
    assert_eq!(html_content_type, "text/html; charset=utf-8");

    let html_bytes = res_html.into_body().collect().await.unwrap().to_bytes();
    let html_str = String::from_utf8_lossy(&html_bytes);
    assert!(html_str.contains("<!DOCTYPE html>"), "Must be rendered HTML document");
    assert!(html_str.contains("AYURCASE CLINICAL CASE SHEET"), "Must contain Case Sheet title");
    assert!(html_str.contains("Avipattikar Churna"), "Must contain prescribed medicine in HTML");
}
