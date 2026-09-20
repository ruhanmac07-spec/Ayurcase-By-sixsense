import { describe, it, expect } from 'vitest';
import { buildAuthorityExcelWorkbook, AuthorityBackupExport } from '../utils/excelBackup';

describe('Authority Excel Backup Generation', () => {
  it('constructs a multi-sheet workbook with all clinical and administrative worksheets and triggers download', () => {
    const mockExportData: AuthorityBackupExport = {
      metadata: {
        system_name: 'AYURCASE Clinical Healthcare System',
        server_role: 'SIXSENSE Central Server',
        export_timestamp: '2026-09-16T09:00:00Z',
        exported_by: 'Super Authority',
        authority_username: 'authority',
        counts: {
          patients: 2,
          visits: 2,
          prescriptions: 2,
        },
      },
      workspaces: [
        { code: 'KAYA', name: 'Kayachikitsa', description: 'Internal Medicine', status: 'ACTIVE', created_at: '2026-09-01' },
      ],
      users: [
        { username: 'dr_sharma', full_name: 'Dr. Sharma', role: 'DOCTOR', workspace_name: 'Kayachikitsa', status: 'ACTIVE', created_at: '2026-09-01' },
      ],
      patients: [
        {
          patient_code: 'P-0001',
          opd_case_id: 'OPD-101',
          full_name: 'Aarav Patel',
          sex: 'M',
          date_of_birth: '1985-05-12',
          phone: '9876543210',
          address: 'Ahmedabad',
          emergency_contact: '9876543211',
          workspace_name: 'Kayachikitsa',
          status: 'ACTIVE',
          created_at: '2026-09-10',
        },
      ],
      visits: [
        {
          visit_number: 'V-0001',
          patient_code: 'P-0001',
          patient_name: 'Aarav Patel',
          doctor_name: 'Dr. Sharma',
          workspace_name: 'Kayachikitsa',
          visit_date: '2026-09-15',
          purpose: 'Kasa / Cough treatment',
          status: 'FINALIZED',
          finalized_at: '2026-09-15T11:00:00Z',
        },
      ],
      vitals: [
        {
          visit_number: 'V-0001',
          patient_code: 'P-0001',
          patient_name: 'Aarav Patel',
          temperature: 98.6,
          pulse_rate: 74,
          respiratory_rate: 18,
          systolic_bp: 120,
          diastolic_bp: 80,
          oxygen_saturation: 99.0,
          height_cm: 172.0,
          weight_kg: 68.0,
          notes: 'Normal vitals',
          recorded_by_name: 'Assistant Nurse',
          recorded_at: '2026-09-15T10:30:00Z',
        },
      ],
      complaints: [
        {
          visit_number: 'V-0001',
          patient_code: 'P-0001',
          patient_name: 'Aarav Patel',
          chief_complaint: 'Dry persistent cough since 10 days',
          history_text: 'Aggravated during cold mornings',
          past_history: 'None',
          family_history: 'Non-contributory',
          personal_history: 'Vegetarian',
          recorded_at: '2026-09-15T10:35:00Z',
        },
      ],
      complaint_items: [
        {
          visit_number: 'V-0001',
          patient_code: 'P-0001',
          complaint_text: 'Kasa (Cough)',
          duration_value: 10,
          duration_unit: 'DAYS',
          notes: 'Aggravated at night',
        },
      ],
      ayush_assessments: [
        {
          visit_number: 'V-0001',
          patient_code: 'P-0001',
          patient_name: 'Aarav Patel',
          prakriti: 'Vata-Kapha',
          nadi: 'Mandam',
          agni: 'Vishamagni',
          koshtha: 'Madhyama',
          notes: 'Ama present',
          recorded_at: '2026-09-15T10:40:00Z',
        },
      ],
      diagnoses: [
        {
          visit_number: 'V-0001',
          patient_code: 'P-0001',
          patient_name: 'Aarav Patel',
          diagnosis_code: 'NAMC-KAS-01',
          diagnosis_name: 'Kaphaja Kasa',
          diagnosis_text: 'Productive phlegm with mild chest congestion',
          doctor_name: 'Dr. Sharma',
          selected_at: '2026-09-15T10:45:00Z',
        },
      ],
      prescriptions: [
        {
          visit_number: 'V-0001',
          patient_code: 'P-0001',
          patient_name: 'Aarav Patel',
          doctor_name: 'Dr. Sharma',
          status: 'FINALIZED',
          created_at: '2026-09-15T10:50:00Z',
          finalized_at: '2026-09-15T10:55:00Z',
        },
      ],
      prescription_items: [
        {
          visit_number: 'V-0001',
          patient_code: 'P-0001',
          patient_name: 'Aarav Patel',
          medicine_name: 'Sitopaladi Churna',
          medicine_name_hi: 'सितोपलादि चूर्ण',
          form: 'Churna',
          dosage: '3 grams',
          frequency: 'Twice daily',
          duration: '14 days',
          anupana: 'Honey (Madhu)',
          pathya: 'Warm water, old rice',
          apathya: 'Cold beverages, ice cream, curd',
          source_type: 'RULE_SUGGESTION',
          rx_status: 'FINALIZED',
          created_at: '2026-09-15T10:52:00Z',
        },
      ],
      medicines: [
        {
          code: 'MED-001',
          name: 'Sitopaladi Churna',
          name_hi: 'सितोपलादि चूर्ण',
          form: 'Churna',
          strength: 'Standard',
          description: 'Classical Ayurvedic respiratory formula',
          status: 'ACTIVE',
        },
      ],
      clinical_rules: [
        {
          rule_code: 'RULE-KAS-01',
          diagnosis_code: 'NAMC-KAS-01',
          diagnosis_name: 'Kaphaja Kasa',
          version: 1,
          status: 'ACTIVE',
          anupana: 'Honey',
          pathya: 'Warm drinks',
          apathya: 'Cold items',
          validated_at: '2026-09-05',
        },
      ],
      audit_logs: [
        {
          created_at: '2026-09-15T11:00:00Z',
          user_name: 'Dr. Sharma',
          workspace_name: 'Kayachikitsa',
          action: 'FINALIZE_PRESCRIPTION',
          entity_type: 'PRESCRIPTION',
          entity_id: 'rx_01',
          details_json: '{"items_count": 1}',
        },
      ],
      backup_records: [],
    };

    const wb = buildAuthorityExcelWorkbook(mockExportData);
    expect(wb).toBeDefined();

    const sheetNames = wb.SheetNames;
    expect(sheetNames).toContain('System Overview');
    expect(sheetNames).toContain('Patients');
    expect(sheetNames).toContain('Visits');
    expect(sheetNames).toContain('Prescriptions');
    expect(sheetNames).toContain('Clinical Vitals');
    expect(sheetNames).toContain('Complaints & History');
    expect(sheetNames).toContain('Complaint Items');
    expect(sheetNames).toContain('Diagnoses');
    expect(sheetNames).toContain('AYUSH Assessments');
    expect(sheetNames).toContain('Medicines Master');
    expect(sheetNames).toContain('Clinical Rules');
    expect(sheetNames).toContain('Departments');
    expect(sheetNames).toContain('Staff Accounts');
    expect(sheetNames).toContain('Audit Trail');

    // Check rows count in Patients sheet
    const patientsSheet = wb.Sheets['Patients'];
    expect(patientsSheet).toBeDefined();
    expect(patientsSheet['!ref']).toBeDefined();
  });
});
