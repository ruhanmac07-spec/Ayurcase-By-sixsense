import * as XLSX from 'xlsx';

export interface AuthorityBackupExport {
  metadata: {
    system_name: string;
    server_role: string;
    export_timestamp: string;
    exported_by: string;
    authority_username: string;
    counts: Record<string, number>;
  };
  workspaces: any[];
  users: any[];
  patients: any[];
  visits: any[];
  vitals: any[];
  complaints: any[];
  complaint_items: any[];
  ayush_assessments: any[];
  diagnoses: any[];
  prescriptions: any[];
  prescription_items: any[];
  medicines: any[];
  clinical_rules: any[];
  audit_logs: any[];
  backup_records: any[];
}

/**
 * Calculates dynamic column widths so text is never truncated in Excel
 */
function setAutoColumnWidths(ws: XLSX.WorkSheet, data: any[], headers: { key: string; label: string }[]) {
  const colWidths = headers.map((h) => {
    let maxLen = h.label.length;
    for (const row of data) {
      const val = row[h.label] ?? row[h.key];
      if (val !== undefined && val !== null) {
        const str = String(val);
        if (str.length > maxLen) {
          maxLen = str.length;
        }
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 50) };
  });
  ws['!cols'] = colWidths;
}

/**
 * Constructs a complete, highly structured Excel workbook (.xlsx)
 * representing the authoritative system state of AYURCASE.
 */
export function buildAuthorityExcelWorkbook(data: AuthorityBackupExport): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // 1. Overview Sheet
  const overviewRows = [
    { Property: 'Healthcare System', Value: data.metadata.system_name || 'AYURCASE Clinical Healthcare' },
    { Property: 'Server Architecture', Value: data.metadata.server_role || 'SIXSENSE Central Server' },
    { Property: 'Backup Export Timestamp', Value: new Date(data.metadata.export_timestamp).toLocaleString() },
    { Property: 'Authority Administrator', Value: `${data.metadata.exported_by} (@${data.metadata.authority_username})` },
    { Property: 'Database Engine', Value: 'SQLite (ACID Compliant)' },
    { Property: 'Format', Value: 'Structured Multi-Worksheet Microsoft Excel (.xlsx)' },
    { Property: '---', Value: '---' },
    { Property: 'Registered Patients', Value: data.patients?.length || 0 },
    { Property: 'Consultation Visits', Value: data.visits?.length || 0 },
    { Property: 'Clinical Vitals Recorded', Value: data.vitals?.length || 0 },
    { Property: 'Prescriptions Finalized', Value: data.prescriptions?.length || 0 },
    { Property: 'Medication Items Prescribed', Value: data.prescription_items?.length || 0 },
    { Property: 'Diagnoses Documented', Value: data.diagnoses?.length || 0 },
    { Property: 'Formulary Master Medicines', Value: data.medicines?.length || 0 },
    { Property: 'Validated Clinical Rules', Value: data.clinical_rules?.length || 0 },
    { Property: 'Departments / Workspaces', Value: data.workspaces?.length || 0 },
    { Property: 'Clinical Staff Accounts', Value: data.users?.length || 0 },
    { Property: 'Audit Trail Events', Value: data.audit_logs?.length || 0 },
  ];
  const wsOverview = XLSX.utils.json_to_sheet(overviewRows);
  wsOverview['!cols'] = [{ wch: 30 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, 'System Overview');

  // 2. Patients Sheet
  const patientHeaders = [
    { key: 'patient_code', label: 'Patient Code (UHID)' },
    { key: 'opd_case_id', label: 'OPD Case No.' },
    { key: 'full_name', label: 'Patient Full Name' },
    { key: 'sex', label: 'Gender' },
    { key: 'date_of_birth', label: 'DOB' },
    { key: 'phone', label: 'Contact Phone' },
    { key: 'address', label: 'Address' },
    { key: 'emergency_contact', label: 'Emergency Contact' },
    { key: 'workspace_name', label: 'Registered Department' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Registration Date' },
  ];
  const patientRows = (data.patients || []).map((p) => ({
    'Patient Code (UHID)': p.patient_code || '',
    'OPD Case No.': p.opd_case_id || '—',
    'Patient Full Name': p.full_name || '',
    'Gender': p.sex || '—',
    'DOB': p.date_of_birth || '—',
    'Contact Phone': p.phone || '—',
    'Address': p.address || '—',
    'Emergency Contact': p.emergency_contact || '—',
    'Registered Department': p.workspace_name || 'General',
    'Status': p.status || 'ACTIVE',
    'Registration Date': p.created_at ? new Date(p.created_at).toLocaleString() : '',
  }));
  const wsPatients = XLSX.utils.json_to_sheet(patientRows);
  setAutoColumnWidths(wsPatients, patientRows, patientHeaders);
  XLSX.utils.book_append_sheet(wb, wsPatients, 'Patients');

  // 3. Visits & Consultations Sheet
  const visitHeaders = [
    { key: 'visit_number', label: 'Visit Number' },
    { key: 'patient_code', label: 'Patient Code' },
    { key: 'patient_name', label: 'Patient Name' },
    { key: 'doctor_name', label: 'Treating Physician' },
    { key: 'workspace_name', label: 'Department' },
    { key: 'visit_date', label: 'Consultation Date' },
    { key: 'purpose', label: 'Encounter Purpose' },
    { key: 'status', label: 'Encounter Status' },
    { key: 'finalized_at', label: 'Finalized At' },
  ];
  const visitRows = (data.visits || []).map((v) => ({
    'Visit Number': v.visit_number || '',
    'Patient Code': v.patient_code || '',
    'Patient Name': v.patient_name || '',
    'Treating Physician': v.doctor_name || '',
    'Department': v.workspace_name || 'General',
    'Consultation Date': v.visit_date ? new Date(v.visit_date).toLocaleString() : '',
    'Encounter Purpose': v.purpose || 'OPD Consultation',
    'Encounter Status': v.status || '',
    'Finalized At': v.finalized_at ? new Date(v.finalized_at).toLocaleString() : 'Pending',
  }));
  const wsVisits = XLSX.utils.json_to_sheet(visitRows);
  setAutoColumnWidths(wsVisits, visitRows, visitHeaders);
  XLSX.utils.book_append_sheet(wb, wsVisits, 'Visits');

  // 4. Prescriptions & Formulations Sheet
  const rxHeaders = [
    { key: 'visit_number', label: 'Visit Number' },
    { key: 'patient_code', label: 'Patient Code' },
    { key: 'patient_name', label: 'Patient Name' },
    { key: 'medicine_name', label: 'Formulation (English)' },
    { key: 'medicine_name_hi', label: 'Formulation (Hindi)' },
    { key: 'form', label: 'Dosage Form' },
    { key: 'dosage', label: 'Dosage (Matra)' },
    { key: 'frequency', label: 'Frequency (Kala)' },
    { key: 'duration', label: 'Duration' },
    { key: 'anupana', label: 'Vehicle (Anupana)' },
    { key: 'pathya', label: 'Pathya (Recommended)' },
    { key: 'apathya', label: 'Apathya (Avoid)' },
    { key: 'source_type', label: 'Source Type' },
    { key: 'rx_status', label: 'Prescription Status' },
    { key: 'created_at', label: 'Prescribed Date' },
  ];
  const rxRows = (data.prescription_items || []).map((item) => ({
    'Visit Number': item.visit_number || '',
    'Patient Code': item.patient_code || '',
    'Patient Name': item.patient_name || '',
    'Formulation (English)': item.medicine_name || '',
    'Formulation (Hindi)': item.medicine_name_hi || '—',
    'Dosage Form': item.form || '—',
    'Dosage (Matra)': item.dosage || '—',
    'Frequency (Kala)': item.frequency || '—',
    'Duration': item.duration || '—',
    'Vehicle (Anupana)': item.anupana || '—',
    'Pathya (Recommended)': item.pathya || '—',
    'Apathya (Avoid)': item.apathya || '—',
    'Source Type': item.source_type || 'DOCTOR_ADDED',
    'Prescription Status': item.rx_status || 'FINALIZED',
    'Prescribed Date': item.created_at ? new Date(item.created_at).toLocaleString() : '',
  }));
  const wsRx = XLSX.utils.json_to_sheet(rxRows);
  setAutoColumnWidths(wsRx, rxRows, rxHeaders);
  XLSX.utils.book_append_sheet(wb, wsRx, 'Prescriptions');

  // 5. Clinical Vitals Sheet
  const vitalsHeaders = [
    { key: 'visit_number', label: 'Visit Number' },
    { key: 'patient_code', label: 'Patient Code' },
    { key: 'patient_name', label: 'Patient Name' },
    { key: 'blood_pressure', label: 'BP (mmHg)' },
    { key: 'pulse_rate', label: 'Pulse (bpm)' },
    { key: 'respiratory_rate', label: 'Resp Rate (/min)' },
    { key: 'temperature', label: 'Temp (°F)' },
    { key: 'oxygen_saturation', label: 'SpO2 (%)' },
    { key: 'weight_kg', label: 'Weight (kg)' },
    { key: 'height_cm', label: 'Height (cm)' },
    { key: 'notes', label: 'Clinical Notes' },
    { key: 'recorded_by_name', label: 'Recorded By' },
    { key: 'recorded_at', label: 'Recorded At' },
  ];
  const vitalsRows = (data.vitals || []).map((vt) => {
    const bp =
      vt.systolic_bp && vt.diastolic_bp
        ? `${vt.systolic_bp}/${vt.diastolic_bp}`
        : '—';
    return {
      'Visit Number': vt.visit_number || '',
      'Patient Code': vt.patient_code || '',
      'Patient Name': vt.patient_name || '',
      'BP (mmHg)': bp,
      'Pulse (bpm)': vt.pulse_rate ?? '—',
      'Resp Rate (/min)': vt.respiratory_rate ?? '—',
      'Temp (°F)': vt.temperature ? `${vt.temperature}°F` : '—',
      'SpO2 (%)': vt.oxygen_saturation ? `${vt.oxygen_saturation}%` : '—',
      'Weight (kg)': vt.weight_kg ?? '—',
      'Height (cm)': vt.height_cm ?? '—',
      'Clinical Notes': vt.notes || '—',
      'Recorded By': vt.recorded_by_name || 'Staff',
      'Recorded At': vt.recorded_at ? new Date(vt.recorded_at).toLocaleString() : '',
    };
  });
  const wsVitals = XLSX.utils.json_to_sheet(vitalsRows);
  setAutoColumnWidths(wsVitals, vitalsRows, vitalsHeaders);
  XLSX.utils.book_append_sheet(wb, wsVitals, 'Clinical Vitals');

  // 6. Complaints & History Sheet
  const complaintsHeaders = [
    { key: 'visit_number', label: 'Visit Number' },
    { key: 'patient_code', label: 'Patient Code' },
    { key: 'patient_name', label: 'Patient Name' },
    { key: 'chief_complaint', label: 'Chief Complaint (Pradhana Vedana)' },
    { key: 'history_text', label: 'History of Present Illness' },
    { key: 'past_history', label: 'Past Medical History' },
    { key: 'family_history', label: 'Family History' },
    { key: 'personal_history', label: 'Personal Habits' },
    { key: 'recorded_at', label: 'Recorded At' },
  ];
  const complaintsRows = (data.complaints || []).map((c) => ({
    'Visit Number': c.visit_number || '',
    'Patient Code': c.patient_code || '',
    'Patient Name': c.patient_name || '',
    'Chief Complaint (Pradhana Vedana)': c.chief_complaint || '—',
    'History of Present Illness': c.history_text || '—',
    'Past Medical History': c.past_history || '—',
    'Family History': c.family_history || '—',
    'Personal Habits': c.personal_history || '—',
    'Recorded At': c.recorded_at ? new Date(c.recorded_at).toLocaleString() : '',
  }));
  const wsComplaints = XLSX.utils.json_to_sheet(complaintsRows);
  setAutoColumnWidths(wsComplaints, complaintsRows, complaintsHeaders);
  XLSX.utils.book_append_sheet(wb, wsComplaints, 'Complaints & History');

  // 7. Individual Complaints Sheet (with durations)
  if (data.complaint_items && data.complaint_items.length > 0) {
    const compItemRows = data.complaint_items.map((ci) => ({
      'Visit Number': ci.visit_number || '',
      'Patient Code': ci.patient_code || '',
      'Complaint Item': ci.complaint_text || '',
      'Duration Value': ci.duration_value ?? '—',
      'Duration Unit': ci.duration_unit || '—',
      'Clinical Notes': ci.notes || '—',
    }));
    const wsCompItems = XLSX.utils.json_to_sheet(compItemRows);
    wsCompItems['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsCompItems, 'Complaint Items');
  }

  // 8. Diagnoses Sheet
  const diagHeaders = [
    { key: 'visit_number', label: 'Visit Number' },
    { key: 'patient_code', label: 'Patient Code' },
    { key: 'patient_name', label: 'Patient Name' },
    { key: 'diagnosis_code', label: 'NAMC / Diagnosis Code' },
    { key: 'diagnosis_name', label: 'Condition Name (Nidan)' },
    { key: 'diagnosis_text', label: 'Doctor Clinical Remarks' },
    { key: 'doctor_name', label: 'Diagnosed By' },
    { key: 'selected_at', label: 'Diagnosis Date' },
  ];
  const diagRows = (data.diagnoses || []).map((d) => ({
    'Visit Number': d.visit_number || '',
    'Patient Code': d.patient_code || '',
    'Patient Name': d.patient_name || '',
    'NAMC / Diagnosis Code': d.diagnosis_code || '',
    'Condition Name (Nidan)': d.diagnosis_name || '',
    'Doctor Clinical Remarks': d.diagnosis_text || '—',
    'Diagnosed By': d.doctor_name || 'Attending Physician',
    'Diagnosis Date': d.selected_at ? new Date(d.selected_at).toLocaleString() : '',
  }));
  const wsDiag = XLSX.utils.json_to_sheet(diagRows);
  setAutoColumnWidths(wsDiag, diagRows, diagHeaders);
  XLSX.utils.book_append_sheet(wb, wsDiag, 'Diagnoses');

  // 9. AYUSH Case Taking Sheet
  const ayushHeaders = [
    { key: 'visit_number', label: 'Visit Number' },
    { key: 'patient_code', label: 'Patient Code' },
    { key: 'patient_name', label: 'Patient Name' },
    { key: 'prakriti', label: 'Prakriti' },
    { key: 'nadi', label: 'Nadi Pariksha' },
    { key: 'agni', label: 'Agni State' },
    { key: 'koshtha', label: 'Koshtha' },
    { key: 'notes', label: 'AYUSH Observations' },
    { key: 'recorded_at', label: 'Assessment Date' },
  ];
  const ayushRows = (data.ayush_assessments || []).map((a) => ({
    'Visit Number': a.visit_number || '',
    'Patient Code': a.patient_code || '',
    'Patient Name': a.patient_name || '',
    'Prakriti': a.prakriti || '—',
    'Nadi Pariksha': a.nadi || '—',
    'Agni State': a.agni || '—',
    'Koshtha': a.koshtha || '—',
    'AYUSH Observations': a.notes || '—',
    'Assessment Date': a.recorded_at ? new Date(a.recorded_at).toLocaleString() : '',
  }));
  const wsAyush = XLSX.utils.json_to_sheet(ayushRows);
  setAutoColumnWidths(wsAyush, ayushRows, ayushHeaders);
  XLSX.utils.book_append_sheet(wb, wsAyush, 'AYUSH Assessments');

  // 10. Master Medicines Catalog Sheet
  const medHeaders = [
    { key: 'code', label: 'Medicine Code' },
    { key: 'name', label: 'Formulation Name (English)' },
    { key: 'name_hi', label: 'Formulation Name (Hindi/Devanagari)' },
    { key: 'form', label: 'Dosage Form' },
    { key: 'strength', label: 'Strength' },
    { key: 'description', label: 'Clinical Description / Indications' },
    { key: 'status', label: 'Status' },
  ];
  const medRows = (data.medicines || []).map((m) => ({
    'Medicine Code': m.code || '',
    'Formulation Name (English)': m.name || '',
    'Formulation Name (Hindi/Devanagari)': m.name_hi || '—',
    'Dosage Form': m.form || '—',
    'Strength': m.strength || '—',
    'Clinical Description / Indications': m.description || '—',
    'Status': m.status || 'ACTIVE',
  }));
  const wsMed = XLSX.utils.json_to_sheet(medRows);
  setAutoColumnWidths(wsMed, medRows, medHeaders);
  XLSX.utils.book_append_sheet(wb, wsMed, 'Medicines Master');

  // 11. Clinical Rules Sheet
  const ruleHeaders = [
    { key: 'rule_code', label: 'Rule Code' },
    { key: 'diagnosis_code', label: 'Diagnosis Code' },
    { key: 'diagnosis_name', label: 'Condition Name' },
    { key: 'version', label: 'Version' },
    { key: 'status', label: 'Rule Status' },
    { key: 'anupana', label: 'Standard Anupana' },
    { key: 'pathya', label: 'Standard Pathya' },
    { key: 'apathya', label: 'Standard Apathya' },
    { key: 'validated_at', label: 'Validated Date' },
  ];
  const ruleRows = (data.clinical_rules || []).map((r) => ({
    'Rule Code': r.rule_code || '',
    'Diagnosis Code': r.diagnosis_code || '',
    'Condition Name': r.diagnosis_name || '',
    'Version': `v${r.version || 1}`,
    'Rule Status': r.status || 'ACTIVE',
    'Standard Anupana': r.anupana || '—',
    'Standard Pathya': r.pathya || '—',
    'Standard Apathya': r.apathya || '—',
    'Validated Date': r.validated_at ? new Date(r.validated_at).toLocaleString() : '—',
  }));
  const wsRules = XLSX.utils.json_to_sheet(ruleRows);
  setAutoColumnWidths(wsRules, ruleRows, ruleHeaders);
  XLSX.utils.book_append_sheet(wb, wsRules, 'Clinical Rules');

  // 12. Workspaces Sheet
  const wsRows = (data.workspaces || []).map((w) => ({
    'Department Code': w.code || '',
    'Department Name': w.name || '',
    'Description': w.description || '—',
    'Status': w.status || 'ACTIVE',
    'Created At': w.created_at ? new Date(w.created_at).toLocaleString() : '',
  }));
  const wsDepartments = XLSX.utils.json_to_sheet(wsRows);
  wsDepartments['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 35 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsDepartments, 'Departments');

  // 13. Users & Staff Accounts Sheet
  const userRows = (data.users || []).map((u) => ({
    'Username': u.username || '',
    'Full Name': u.full_name || '',
    'Role': u.role || '',
    'Assigned Department': u.workspace_name || 'All Departments',
    'Account Status': u.status || 'ACTIVE',
    'Last Login': u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never',
    'Created Date': u.created_at ? new Date(u.created_at).toLocaleString() : '',
  }));
  const wsUsers = XLSX.utils.json_to_sheet(userRows);
  wsUsers['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsUsers, 'Staff Accounts');

  // 14. Audit Trail Sheet
  const auditRows = (data.audit_logs || []).map((a) => ({
    'Timestamp': a.created_at ? new Date(a.created_at).toLocaleString() : '',
    'User': a.user_name || 'System',
    'Department': a.workspace_name || 'Global',
    'Action Taken': a.action || '',
    'Entity Type': a.entity_type || '—',
    'Entity ID': a.entity_id || '—',
    'Details Summary': a.details_json ? String(a.details_json).slice(0, 100) : '—',
  }));
  const wsAudit = XLSX.utils.json_to_sheet(auditRows);
  wsAudit['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 26 }, { wch: 16 }, { wch: 20 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsAudit, 'Audit Trail');

  return wb;
}

export function generateAuthorityExcelBackup(data: AuthorityBackupExport): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `AYURCASE_AUTHORITY_BACKUP_${timestamp}.xlsx`;
  const wb = buildAuthorityExcelWorkbook(data);
  XLSX.writeFile(wb, filename);
  return filename;
}
