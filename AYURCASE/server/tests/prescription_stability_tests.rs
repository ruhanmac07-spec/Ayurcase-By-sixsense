use sixsense_server::{
    models::{
        patient::CreatePatientRequest,
        prescription::{PrescriptionItemInput, SavePrescriptionDraftRequest},
        visit::CreateVisitIntakeRequest,
    },
    repositories::{init_pool, run_migrations, seed_initial_data_if_empty},
    services::{PatientService, PrescriptionService, VisitService},
};
use tempfile::tempdir;

#[tokio::test]
async fn test_prescription_and_visit_stability_complete_acceptance() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test_rx_acceptance.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

    let pool = init_pool(&db_url).await.unwrap();
    run_migrations(&pool).await.unwrap();
    seed_initial_data_if_empty(&pool).await.unwrap();

    // 1. Register Patient 1
    let pat1 = PatientService::create(
        &pool,
        "ws_kayachikitsa",
        CreatePatientRequest {
            workspace_id: Some("ws_kayachikitsa".to_string()),
            doctor_id: None,
            patient_code: None,
            full_name: "Patient One".to_string(),
            date_of_birth: Some("1990-01-01".to_string()),
            sex: Some("Male".to_string()),
            phone: Some("9876543210".to_string()),
            address: None,
            emergency_contact: None,
            opd_case_id: None,
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();
    assert_eq!(pat1.patient_code, "0001");

    // 2. Register Patient 2 in SAME workspace
    let pat2 = PatientService::create(
        &pool,
        "ws_kayachikitsa",
        CreatePatientRequest {
            workspace_id: Some("ws_kayachikitsa".to_string()),
            doctor_id: None,
            patient_code: None,
            full_name: "Patient Two".to_string(),
            date_of_birth: Some("1985-05-15".to_string()),
            sex: Some("Female".to_string()),
            phone: Some("9876543211".to_string()),
            address: None,
            emergency_contact: None,
            opd_case_id: None,
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();
    assert_eq!(pat2.patient_code, "0002");

    // 3. Create Visit 1 for Patient 1
    let intake1_v1 = VisitService::create_intake(
        &pool,
        "ws_kayachikitsa",
        mock_intake_req(pat1.id.clone(), "usr_dr_sharma".to_string()),
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    assert_eq!(intake1_v1.visit.visit_number, "01");
    assert_eq!(intake1_v1.visit.patient_visit_seq, Some(1));
    assert!(intake1_v1.visit.opd_number.as_ref().unwrap().starts_with("0001/"));

    // 4. Create Visit 1 for Patient 2 in SAME workspace (Regression test for multi-patient uniqueness!)
    let intake2_v1 = VisitService::create_intake(
        &pool,
        "ws_kayachikitsa",
        mock_intake_req(pat2.id.clone(), "usr_dr_sharma".to_string()),
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    assert_eq!(intake2_v1.visit.visit_number, "01");
    assert_eq!(intake2_v1.visit.patient_visit_seq, Some(1));
    assert!(intake2_v1.visit.opd_number.as_ref().unwrap().starts_with("0002/"));

    // 5. Create Visit 2 for Patient 1 (Returning patient gets Visit 02!)
    let intake1_v2 = VisitService::create_intake(
        &pool,
        "ws_kayachikitsa",
        mock_intake_req(pat1.id.clone(), "usr_dr_sharma".to_string()),
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    assert_eq!(intake1_v2.visit.visit_number, "02");
    assert_eq!(intake1_v2.visit.patient_visit_seq, Some(2));
    assert_eq!(intake1_v2.patient_code, "0001");

    // 6. Test Prescription Saving: Doctor prescribes for Patient 1 Visit 1
    let visit_id = &intake1_v1.visit.id;

    // Test saving draft with:
    // - empty string medicine_id
    // - custom formulation with unknown ID
    // - empty string rule_id
    // - empty string source_rule_id
    // - valid medicine (med_sitopaladi)
    let draft_rx = PrescriptionService::save_draft(
        &pool,
        visit_id,
        SavePrescriptionDraftRequest {
            source_rule_id: Some("".to_string()), // empty string should be sanitized to NULL
            source_rule_version: None,
            items: vec![
                PrescriptionItemInput {
                    medicine_id: Some("med_sitopaladi".to_string()), // valid master medicine
                    medicine_name_snapshot: "Sitopaladi Churna (Bilingual)".to_string(),
                    dosage_text: Some("3g".to_string()),
                    frequency_text: Some("Twice daily".to_string()),
                    duration_text: Some("14 days".to_string()),
                    anupana_text: Some("Honey or warm water".to_string()),
                    pathya_text: Some("Warm light food".to_string()),
                    apathya_text: Some("Cold drinks".to_string()),
                    source_type: "DOCTOR_ADDED".to_string(),
                    rule_id: Some("".to_string()), // empty string should be sanitized to NULL
                    rule_version: None,
                },
                PrescriptionItemInput {
                    medicine_id: Some("".to_string()), // empty string should be sanitized to NULL
                    medicine_name_snapshot: "Custom Kadha Preparation".to_string(),
                    dosage_text: Some("50 ml".to_string()),
                    frequency_text: Some("Once in morning".to_string()),
                    duration_text: Some("7 days".to_string()),
                    anupana_text: None,
                    pathya_text: None,
                    apathya_text: None,
                    source_type: "DOCTOR_ADDED".to_string(),
                    rule_id: None,
                    rule_version: None,
                },
                PrescriptionItemInput {
                    medicine_id: Some("custom_nonexistent_id".to_string()), // custom id sanitized to NULL
                    medicine_name_snapshot: "Special Taila Massage".to_string(),
                    dosage_text: Some("External application".to_string()),
                    frequency_text: Some("Daily".to_string()),
                    duration_text: Some("10 days".to_string()),
                    anupana_text: None,
                    pathya_text: None,
                    apathya_text: None,
                    source_type: "DOCTOR_ADDED".to_string(),
                    rule_id: None,
                    rule_version: None,
                },
            ],
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    assert_eq!(draft_rx.items.len(), 3);
    assert_eq!(draft_rx.prescription.status, "DRAFT");
    assert_eq!(draft_rx.prescription.source_rule_id, None);
    assert_eq!(draft_rx.items[0].medicine_id, Some("med_sitopaladi".to_string()));
    assert_eq!(draft_rx.items[1].medicine_id, None); // sanitized to None
    assert_eq!(draft_rx.items[2].medicine_id, None); // sanitized to None

    // 7. Verify reloading detail returns the exact draft
    let loaded_detail = PrescriptionService::get_detail(&pool, visit_id).await.unwrap().unwrap();
    assert_eq!(loaded_detail.items.len(), 3);
    assert_eq!(loaded_detail.prescription.id, draft_rx.prescription.id);

    // 8. Update Draft: re-saving with edited items replaces items atomically
    let updated_draft = PrescriptionService::save_draft(
        &pool,
        visit_id,
        SavePrescriptionDraftRequest {
            source_rule_id: None,
            source_rule_version: None,
            items: vec![
                PrescriptionItemInput {
                    medicine_id: Some("med_sitopaladi".to_string()),
                    medicine_name_snapshot: "Sitopaladi Churna".to_string(),
                    dosage_text: Some("5g".to_string()), // updated dose
                    frequency_text: Some("Thrice daily".to_string()),
                    duration_text: Some("21 days".to_string()),
                    anupana_text: Some("Honey".to_string()),
                    pathya_text: None,
                    apathya_text: None,
                    source_type: "DOCTOR_ADDED".to_string(),
                    rule_id: None,
                    rule_version: None,
                },
            ],
        },
        "usr_dr_sharma",
    )
    .await
    .unwrap();

    assert_eq!(updated_draft.items.len(), 1);
    assert_eq!(updated_draft.prescription.id, draft_rx.prescription.id); // Same prescription header!
    assert_eq!(updated_draft.items[0].dosage_text.as_deref(), Some("5g"));

    // 9. Finalize Prescription: Doctor finalizes
    let fin_rx = PrescriptionService::finalize_prescription(&pool, visit_id, "usr_dr_sharma")
        .await
        .unwrap();

    assert_eq!(fin_rx.prescription.status, "FINALIZED");
    assert!(fin_rx.prescription.finalized_at.is_some());
    assert_eq!(fin_rx.prescription.finalized_by.as_deref(), Some("usr_dr_sharma"));

    // Verify visit is also marked FINALIZED
    let vis_check = VisitService::get_visit(&pool, visit_id).await.unwrap();
    assert_eq!(vis_check.status, "FINALIZED");
    assert!(vis_check.finalized_at.is_some());

    // 10. Attempting to edit a finalized prescription must be rejected (HTTP 403 Forbidden)
    let edit_attempt = PrescriptionService::save_draft(
        &pool,
        visit_id,
        SavePrescriptionDraftRequest {
            source_rule_id: None,
            source_rule_version: None,
            items: vec![],
        },
        "usr_dr_sharma",
    )
    .await;

    assert!(edit_attempt.is_err());
    println!(">>> Post-finalization edit attempt error: {:?}", edit_attempt.err());
}

fn mock_intake_req(patient_id: String, doctor_id: String) -> CreateVisitIntakeRequest {
    CreateVisitIntakeRequest {
        workspace_id: Some("ws_kayachikitsa".to_string()),
        patient_id,
        doctor_id,
        purpose: Some("Regular consultation".to_string()),
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
    }
}
