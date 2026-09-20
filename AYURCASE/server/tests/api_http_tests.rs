use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::Value;
use sixsense_server::{
    api::create_router,
    models::{patient::CreatePatientRequest, visit::CreateVisitIntakeRequest},
    repositories::{init_pool, run_migrations, seed_initial_data_if_empty},
    services::{PatientService, VisitService},
};
use tempfile::tempdir;
use tower::ServiceExt;

#[tokio::test]
async fn test_api_health_endpoint() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_api.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    let app = create_router(pool);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "OK");
    assert_eq!(json["service"], "SIXSENSE Server");
    assert_eq!(json["database"], "CONNECTED");
}

#[tokio::test]
async fn test_api_login_and_protected_route() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_api_auth.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    let app = create_router(pool.clone());

    // 1. Unauthenticated request to /api/v1/auth/session must return 401
    let unauth_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/session")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauth_res.status(), StatusCode::UNAUTHORIZED);

    // 2. Login as admin
    let login_payload = serde_json::json!({
        "username": "admin",
        "password": "password123"
    });

    let login_res = app
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

    assert_eq!(login_res.status(), StatusCode::OK);
    let body = login_res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().unwrap();
    assert!(!token.is_empty());

    // 3. Authenticated request using Bearer token
    let session_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/session")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(session_res.status(), StatusCode::OK);
    let body = session_res.into_body().collect().await.unwrap().to_bytes();
    let session_json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(session_json["username"], "admin");
    assert_eq!(session_json["role"], "AUTHORITY");
}

#[tokio::test]
async fn test_api_doctor_queue_and_rule_evaluation() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_api_queue.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    let app = create_router(pool.clone());

    // Login as dr_sharma
    let login_payload = serde_json::json!({
        "username": "dr_sharma",
        "password": "password123"
    });

    let login_res = app
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

    let body = login_res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().unwrap();

    // Query doctor queue
    let queue_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/queue/my-queue")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(queue_res.status(), StatusCode::OK);

    // Query validated assistance for Kasa
    let rule_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/diagnosis/rules/diag_kasa_01")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(rule_res.status(), StatusCode::OK);
    let rule_body = rule_res.into_body().collect().await.unwrap().to_bytes();
    let rule_json: Value = serde_json::from_slice(&rule_body).unwrap();
    assert_eq!(rule_json["has_validated_rule"], true);
    assert_eq!(rule_json["rule_code"], "RULE-KASA-V1");
    assert_eq!(rule_json["version"], 1);

    // Query assistance for Pratisyaya (no validated rule)
    let no_rule_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/diagnosis/rules/diag_pratisyaya_01")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(no_rule_res.status(), StatusCode::OK);
    let no_rule_body = no_rule_res.into_body().collect().await.unwrap().to_bytes();
    let no_rule_json: Value = serde_json::from_slice(&no_rule_body).unwrap();
    assert_eq!(no_rule_json["has_validated_rule"], false);
    assert_eq!(
        no_rule_json["message"],
        "No validated recommendation available for this diagnosis."
    );
}

#[tokio::test]
async fn test_api_cross_workspace_and_doctor_isolation() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_api_isolation.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    let app = create_router(pool.clone());

    // 1. Login Dr. Sharma (Kayachikitsa, ws_kayachikitsa)
    let sharma_login = serde_json::json!({
        "username": "dr_sharma",
        "password": "password123"
    });
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&sharma_login).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let sharma_token = serde_json::from_slice::<Value>(&body).unwrap()["token"]
        .as_str()
        .unwrap()
        .to_string();

    // 2. Login Dr. Varu (Panchakarma, ws_panchakarma)
    let varu_login = serde_json::json!({
        "username": "dr_varu",
        "password": "password123"
    });
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&varu_login).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let varu_token = serde_json::from_slice::<Value>(&body).unwrap()["token"]
        .as_str()
        .unwrap()
        .to_string();

    // 3. Create a patient and visit assigned to Dr. Sharma in ws_kayachikitsa
    let patient = PatientService::create(
        &pool,
        "ws_kayachikitsa",
        CreatePatientRequest {
            workspace_id: Some("ws_kayachikitsa".to_string()),
            doctor_id: None,
            patient_code: None,
            opd_case_id: Some("OPD-ISO-01".to_string()),
            full_name: "Anita Deshmukh".to_string(),
            date_of_birth: Some("1995-03-22".to_string()),
            sex: Some("Female".to_string()),
            phone: Some("9876123450".to_string()),
            address: Some("Mumbai, Maharashtra".to_string()),
            emergency_contact: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    let intake = VisitService::create_intake(
        &pool,
        "ws_kayachikitsa",
        CreateVisitIntakeRequest {
            workspace_id: Some("ws_kayachikitsa".to_string()),
            patient_id: patient.id.clone(),
            doctor_id: "usr_dr_sharma".to_string(),
            purpose: Some("Chronic dry cough".to_string()),
            priority: Some(1),
            consent_status: Some("GIVEN".to_string()),
            consent_version: Some("v1.0".to_string()),
            temperature: Some(98.4),
            pulse_rate: Some(72),
            respiratory_rate: Some(16),
            systolic_bp: Some(118),
            diastolic_bp: Some(78),
            oxygen_saturation: Some(99.0),
            height_cm: Some(162.0),
            weight_kg: Some(58.0),
            vitals_notes: None,
            idempotency_key: Some("idem_iso_01".to_string()),
            ayush_data_json: None,
            complaints_list: None,
        },
        "usr_asst_priya",
    )
    .await
    .unwrap();

    let visit_id = intake.visit.id;

    // 4. Dr. Varu (Panchakarma) attempts cross-workspace mutation on Dr. Sharma's visit notes -> 403 Forbidden
    let cross_notes_payload = serde_json::json!({
        "chief_complaints": "Malicious cross-workspace edit",
        "examination_notes": "Attempted breach",
        "ayurvedic_assessment": null,
        "prognosis": null
    });
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/v1/consultations/{}/notes", visit_id))
                .header("Authorization", format!("Bearer {}", varu_token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&cross_notes_payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    // 5. Dr. Varu attempts cross-workspace prescription drafting -> 403 Forbidden
    let cross_rx_payload = serde_json::json!({
        "items": [],
        "dietary_advice": "Unauthorized diet",
        "lifestyle_advice": null,
        "precautions": null,
        "follow_up_days": null
    });
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/v1/prescriptions/{}", visit_id))
                .header("Authorization", format!("Bearer {}", varu_token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&cross_rx_payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    // 6. Dr. Varu attempts cross-workspace prescription reading -> 403 Forbidden
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/v1/prescriptions/{}", visit_id))
                .header("Authorization", format!("Bearer {}", varu_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    // 7. Dr. Sharma (authorized doctor) saves clinical notes -> 200 OK
    let sharma_notes_payload = serde_json::json!({
        "chief_complaints": "Dry cough for 3 days",
        "examination_notes": "Vata-Kapha lakshana noted",
        "ayurvedic_assessment": "Kaphaja Kasa",
        "prognosis": "Sadhya"
    });
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/v1/consultations/{}/notes", visit_id))
                .header("Authorization", format!("Bearer {}", sharma_token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&sharma_notes_payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_api_authority_backup_export_data() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_api_export.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    let app = create_router(pool.clone());

    // 1. Login as Dr. Sharma (DOCTOR role)
    let doc_login_payload = serde_json::json!({
        "username": "dr_sharma",
        "password": "password123"
    });
    let doc_login_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&doc_login_payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    let body = doc_login_res.into_body().collect().await.unwrap().to_bytes();
    let doc_json: Value = serde_json::from_slice(&body).unwrap();
    let doc_token = doc_json["token"].as_str().unwrap();

    // DOCTOR role attempting /backups/export-data must be rejected with 403 Forbidden
    let forbidden_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/backups/export-data")
                .header("Authorization", format!("Bearer {}", doc_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(forbidden_res.status(), StatusCode::FORBIDDEN);

    // 2. Login as Authority (AUTHORITY role)
    let auth_login_payload = serde_json::json!({
        "username": "authority",
        "password": "password123"
    });
    let auth_login_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_vec(&auth_login_payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    let body = auth_login_res.into_body().collect().await.unwrap().to_bytes();
    let auth_json: Value = serde_json::from_slice(&body).unwrap();
    let auth_token = auth_json["token"].as_str().unwrap();

    // AUTHORITY role requesting /backups/export-data must succeed with 200 OK
    let export_res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/backups/export-data")
                .header("Authorization", format!("Bearer {}", auth_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(export_res.status(), StatusCode::OK);

    let export_body = export_res.into_body().collect().await.unwrap().to_bytes();
    let export_json: Value = serde_json::from_slice(&export_body).unwrap();

    assert_eq!(export_json["metadata"]["system_name"], "AYURCASE Clinical Healthcare System");
    assert!(export_json["workspaces"].is_array());
    assert!(export_json["users"].is_array());
    assert!(export_json["patients"].is_array());
    assert!(export_json["visits"].is_array());
    assert!(export_json["vitals"].is_array());
    assert!(export_json["complaints"].is_array());
    assert!(export_json["diagnoses"].is_array());
    assert!(export_json["prescriptions"].is_array());
    assert!(export_json["prescription_items"].is_array());
    assert!(export_json["medicines"].is_array());
    assert!(export_json["clinical_rules"].is_array());
    assert!(export_json["audit_logs"].is_array());

    // Verify password hash is NEVER exported
    for user in export_json["users"].as_array().unwrap() {
        assert!(user.get("password_hash").is_none());
    }
}


