// Automated Verification of all 4 TECHNEXA 2026 Live Demo Flows + Hardened Foundation Tests
const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('TECHNEXA 2026 — Comprehensive Flow & Invariant Suite');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  async function switchPersona(userId) {
    const res = await fetch(`${BASE_URL}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return res.json();
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Session & Role Resolution
    // ----------------------------------------------------
    console.log('\n--- 1. Session & Demo Persona Management ---');
    await switchPersona('usr-patient-1');
    const sessRes = await fetch(`${BASE_URL}/api/auth/session`);
    const sessData = await sessRes.json();
    assert(sessRes.status === 200, 'Session API returns 200 OK');
    assert(sessData.allUsers?.length === 4, 'All 4 MVP roles available in persona switcher');
    assert(sessData.user?.role === 'PATIENT', 'Default user is Patient (Ramesh Patel)');

    // ----------------------------------------------------
    // TEST 2: RBAC Security Barrier Test
    // ----------------------------------------------------
    console.log('\n--- 2. RBAC Security Barrier: Prevent Unauthorized Patient Clinical Referral ---');
    // Ensure active user is PATIENT
    await switchPersona('usr-patient-1');
    const rbacRefRes = await fetch(`${BASE_URL}/api/referrals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'pat-1',
        patientSnapshot: {
          name: 'Ramesh Patel',
          age: 52,
          gender: 'MALE',
          mobile: '+91 98250 12345',
          bloodGroup: 'B+',
          allergies: ['Sulfa Drugs (Skin Rash)'],
          medications: [{ name: 'Amlodipine', dosage: '5mg' }],
          conditions: ['Hypertension'],
        },
        referringDoctorId: 'usr-pat-1',
        referringDoctorName: 'Patient Trying to Refer',
        referringClinic: 'Self',
        receivingFacilityId: 'fac-hosp-1',
        receivingFacilityName: 'Sterling Apex Hospital',
        urgency: 'ROUTINE',
        chiefComplaint: 'Unauthorized test',
        clinicalFindings: 'None',
        careRequirement: 'None',
        requiredCapabilities: ['GENERAL_MEDICINE'],
        doctorConfirmedDecision: 'Unauthorized',
      }),
    });
    assert(rbacRefRes.status === 403, 'Patient cannot create clinical referrals (RBAC blocks with 403 Forbidden)');

    // ----------------------------------------------------
    // TEST 3: DEMO 1 — Patient Symptom Self-Assessment
    // ----------------------------------------------------
    console.log('\n--- 3. DEMO 1: Symptom Self-Assessment (Normal vs Emergency) ---');
    // Normal symptom case
    const normalRes = await fetch(`${BASE_URL}/api/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chiefComplaint: 'Mild viral cold symptoms and low grade body ache',
        duration: '2 days',
        severity: 3,
      }),
    });
    const normalData = await normalRes.json();
    assert(normalData.urgencyLevel === 'ROUTINE', 'Normal symptoms evaluate to ROUTINE urgency');
    assert(normalData.isEmergencyAlert === false, 'Normal symptoms do not trigger false emergency alert');
    assert(
      normalData.recommendedAction.toLowerCase().includes('primary') ||
      normalData.recommendedAction.toLowerCase().includes('physician') ||
      normalData.recommendedAction.toLowerCase().includes('phc'),
      'Advises consulting a doctor (no fake autonomous diagnosis)'
    );

    // Acute cardiac emergency case
    const emergRes = await fetch(`${BASE_URL}/api/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chiefComplaint: 'Crushing central chest pain radiating to left arm with breathlessness',
        duration: '30 minutes',
        severity: 9,
        vitals: { bloodPressure: '160/100', spo2: 91 },
      }),
    });
    const emergData = await emergRes.json();
    assert(emergData.urgencyLevel === 'EMERGENCY', 'Acute chest pain evaluates to EMERGENCY urgency');
    assert(emergData.isEmergencyAlert === true, 'Emergency alert flag is active');
    assert(emergData.requiredCapabilities.includes('CARDIOLOGY'), 'Cardiology capability derived');
    assert(emergData.requiredCapabilities.includes('CATH_LAB'), 'Cath Lab capability derived');

    // ----------------------------------------------------
    // TEST 4: DEMO 2 — Doctor Lookup, Override, Matching & Referral
    // ----------------------------------------------------
    console.log('\n--- 4. DEMO 2: Doctor Lookup, Clinical Workspace & AI Override ---');
    // Switch to PHC Doctor persona
    await switchPersona('usr-doctor-1');

    // Lookup Ramesh Patel
    const lookupRes = await fetch(`${BASE_URL}/api/patient/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'PAT-1081-SEC' }),
    });
    const lookupData = await lookupRes.json();
    assert(lookupRes.status === 200, 'Patient lookup by QR token succeeds for doctor');
    assert(lookupData.patient?.name === 'Ramesh Patel', 'Ramesh Patel profile returned');
    assert(lookupData.patient?.allergies.includes('Sulfa Drugs (Skin Rash)'), 'Critical allergy alert present');

    // Capability-aware facility matching
    const matchRes = await fetch(`${BASE_URL}/api/facilities/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requiredCapabilities: ['CARDIOLOGY', 'CATH_LAB', 'ECG', 'EMERGENCY_24_7', 'ICU'],
        maxResults: 3,
      }),
    });
    const matchData = await matchRes.json();
    assert(matchData.matches?.length > 0, 'Facility matcher returns suitable facilities');
    assert(matchData.matches[0].isFullMatch === true, 'Top facility is full capability match (Sterling Apex Heart Institute)');
    assert(matchData.matches[0].facility.capabilities.includes('CATH_LAB'), 'Top facility provides 24/7 Cath Lab');

    // Test Zero-match fallback capability engine
    const zeroMatchRes = await fetch(`${BASE_URL}/api/facilities/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requiredCapabilities: ['ORGAN_TRANSPLANT_SPECIALTY', 'PEDIATRIC_CARDIO_SURGERY'],
        maxResults: 3,
      }),
    });
    const zeroMatchData = await zeroMatchRes.json();
    assert(zeroMatchData.fallbackActivated === true, 'Zero-match fallback guidance activated when no facility matches');
    assert(zeroMatchData.message.includes('tele-consultation'), 'Provides guidance for remote tele-consultation on zero match');

    // Create digital referral with Doctor Override
    const refRes = await fetch(`${BASE_URL}/api/referrals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'pat-1',
        patientSnapshot: {
          name: 'Ramesh Patel',
          age: 52,
          gender: 'MALE',
          mobile: '+91 98250 12345',
          bloodGroup: 'B+',
          allergies: ['Sulfa Drugs (Skin Rash)'],
          medications: [{ name: 'Amlodipine', dosage: '5mg' }],
          conditions: ['Hypertension'],
        },
        referringDoctorId: 'usr-doctor-1',
        referringDoctorName: 'Dr. Priya Sharma (Medical Officer)',
        referringClinic: 'Anand Rural Community PHC',
        receivingFacilityId: 'fac-hosp-1',
        receivingFacilityName: 'Sterling Apex Heart & Multi-Specialty Hospital',
        urgency: 'URGENT',
        chiefComplaint: 'Exertional angina with ST depression',
        clinicalFindings: 'Diaphoretic, 1.5mm ST depression in V4-V6',
        careRequirement: 'Emergency Cardiology Evaluation & Interventional Cath Lab Transfer',
        requiredCapabilities: ['CARDIOLOGY', 'CATH_LAB', 'ECG', 'EMERGENCY_24_7', 'ICU'],
        aiAssessmentSummary: 'AI suggested Urgent Cardiology evaluation',
        doctorConfirmedDecision: 'Confirmed by Dr. Priya Sharma: Acute coronary syndrome suspected. Overridden to high priority.',
        isDoctorOverridden: true,
        doctorOverrideReason: 'Clinical findings and ST depression on ECG require urgent tertiary interventional cover.',
      }),
    });
    const refData = await refRes.json();
    assert(refRes.status === 200, 'Digital referral created successfully by doctor');
    assert(refData.referral?.referralCode.startsWith('REF-2026-'), 'Structured referral code generated');
    assert(refData.referral?.isDoctorOverridden === true, 'Doctor override status recorded');

    // Hospital Intake Status Updates: Switch to Hospital Doctor persona
    await switchPersona('usr-hospital-doc-1');
    const refId = refData.referral.id;
    const acceptRes = await fetch(`${BASE_URL}/api/referrals/${refId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ACCEPTED',
        notes: 'Referral accepted by Dr. Rajesh Mehta. Cath Lab alerted.',
      }),
    });
    const acceptData = await acceptRes.json();
    assert(acceptData.referral?.status === 'ACCEPTED', 'Hospital accepts incoming referral');

    const arriveRes = await fetch(`${BASE_URL}/api/referrals/${refId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ARRIVED',
        notes: 'Patient arrived at hospital triage.',
      }),
    });
    const arriveData = await arriveRes.json();
    assert(arriveData.referral?.status === 'ARRIVED', 'Hospital marks patient arrived');

    const outcomeRes = await fetch(`${BASE_URL}/api/referrals/${refId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'COMPLETED_OUTCOME',
        notes: 'Clinical care completed and outcome documented.',
        outcomeNotes: 'Underwent successful primary angioplasty with drug-eluting stent. Stable in Cardiac ICU.',
        counterReferralFollowUp: 'Prescribed DAPT for 12 months. Routine follow-up at Anand Rural PHC in 14 days.',
      }),
    });
    const outcomeData = await outcomeRes.json();
    assert(outcomeData.referral?.status === 'COMPLETED_OUTCOME', 'Hospital updates clinical outcome & counter-referral');
    assert(outcomeData.referral?.outcomeNotes.includes('angioplasty'), 'Treatment outcome persisted');

    // ----------------------------------------------------
    // TEST 5: DEMO 3 — Emergency SOS Fast-Lane
    // ----------------------------------------------------
    console.log('\n--- 5. DEMO 3: Emergency SOS Fast-Lane (Immediate 108 Dispatch & False Alarm) ---');
    // Switch to Patient persona
    await switchPersona('usr-patient-1');
    const sosRes = await fetch(`${BASE_URL}/api/sos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'pat-1',
        symptoms: ['Acute crushing chest pain (9/10)', 'Diaphoresis'],
      }),
    });
    const sosData = await sosRes.json();
    assert(sosRes.status === 200, 'SOS triggered successfully');
    assert(sosData.event?.ambulanceStatus === 'DISPATCHED', 'Ambulance action starts IMMEDIATELY upon SOS press');
    assert(sosData.event?.ambulanceId.startsWith('AMB-GJ-01-'), 'Ambulance vehicle assigned');
    assert(sosData.event?.allergies.includes('Sulfa Drugs (Skin Rash)'), 'Emergency dossier fused with patient allergies');

    // Destination selection
    const selFacRes = await fetch(`${BASE_URL}/api/sos/select-facility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: sosData.event.id,
        facilityId: 'fac-hosp-1',
        notes: 'Pre-alert Cath Lab team.',
      }),
    });
    const selFacData = await selFacRes.json();
    assert(selFacData.event?.selectedFacilityId === 'fac-hosp-1', 'Destination hospital recorded');
    assert(selFacData.event?.hospitalStatus === 'ALERTED', 'Hospital receives emergency alert');

    // False Alarm cancellation test
    const cancelRes = await fetch(`${BASE_URL}/api/sos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CANCEL',
        eventId: sosData.event.id,
        cancellationReason: 'Patient reports symptom relief and cancels request',
      }),
    });
    const cancelData = await cancelRes.json();
    assert(cancelData.event?.isCancelled === true, 'Emergency SOS successfully cancelled as false alarm');
    assert(cancelData.event?.ambulanceStatus === 'CANCELLED', 'Ambulance status updated to CANCELLED');

    // ----------------------------------------------------
    // TEST 6: DEMO 4 — Medical Document OCR & Verification
    // ----------------------------------------------------
    console.log('\n--- 6. DEMO 4: Medical Document OCR & Clinician Verification ---');
    // Switch to PHC Doctor persona
    await switchPersona('usr-doctor-1');

    // Upload readable discharge summary
    const docRes = await fetch(`${BASE_URL}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'pat-1',
        title: 'Sterling Hospital Discharge Summary.pdf',
        fileType: 'PDF',
        preset: 'PRESET_CARDIAC',
      }),
    });
    const docData = await docRes.json();
    assert(docData.document?.isReadable === true, 'Readable document flagged as readable');
    assert(docData.document?.verificationStatus === 'NEEDS_VERIFICATION', 'Initial status is NEEDS_VERIFICATION');
    assert(docData.document?.candidateExtraction?.conditions.includes('Essential Systemic Hypertension'), 'OCR candidate conditions extracted');

    // Clinician verifies document
    const verRes = await fetch(`${BASE_URL}/api/documents/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: docData.document.id,
        verifiedConditions: docData.document.candidateExtraction.conditions,
        verifiedMedications: docData.document.candidateExtraction.medications,
      }),
    });
    const verData = await verRes.json();
    assert(verData.document?.verificationStatus === 'VERIFIED', 'Clinician verifies candidate findings');

    // Verify patient profile now contains the verified history with provenance
    const patVerifyRes = await fetch(`${BASE_URL}/api/patient?id=pat-1`);
    const patVerifyData = await patVerifyRes.json();
    assert(patVerifyData.medicalHistory?.length > 0, 'Verified condition added to patient medical history');
    assert(
      patVerifyData.medicalHistory.some((m) => m.provenance?.sourceType === 'DOCUMENT_OCR_VERIFIED'),
      'Data provenance tags document as DOCUMENT_OCR_VERIFIED'
    );

    // Test unreadable document safe fallback
    const unreadableRes = await fetch(`${BASE_URL}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'pat-1',
        title: 'Blurry Handwritten Slip.jpg',
        fileType: 'IMAGE_JPG',
        preset: 'PRESET_UNREADABLE',
      }),
    });
    const unreadableData = await unreadableRes.json();
    assert(unreadableData.document?.isReadable === false, 'Unreadable document correctly identified as unreadable');
    assert(unreadableData.document?.candidateExtraction === undefined, 'No hallucinated data generated for unreadable document');

    // ----------------------------------------------------
    // TEST 7: Audit Trail
    // ----------------------------------------------------
    console.log('\n--- 7. Access Audit Trail ---');
    const audRes = await fetch(`${BASE_URL}/api/audit`);
    const audData = await audRes.json();
    assert(audData.length > 0, 'Audit logs recorded');
    assert(audData.some((l) => l.isBreakGlass === true), 'Emergency break-glass access logged in audit ledger');

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} / ${total} assertions passed successfully!`);
    console.log('====================================================');
  } catch (err) {
    console.error('Fatal error during test suite:', err);
    process.exitCode = 1;
  }
}

runTests();
