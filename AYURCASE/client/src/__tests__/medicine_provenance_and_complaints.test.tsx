import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ConsultationWorkspace } from '../features/doctor/ConsultationWorkspace';
import { MasterDataView } from '../features/authority/MasterDataView';
import { PatientHistoryView } from '../features/history/PatientHistoryView';
import { useAuth } from '../state/AuthContext';
import * as api from '../api/endpoints';
import * as T from '../api/types';

// Mock AuthContext hook
vi.mock('../state/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock all relevant API endpoints
vi.mock('../api/endpoints', () => ({
  getConsultationWorkspace: vi.fn(),
  saveClinicalNotes: vi.fn(),
  attachDiagnosis: vi.fn(),
  removeDiagnosis: vi.fn(),
  getDiagnoses: vi.fn(),
  getPrescriptionDetail: vi.fn(),
  savePrescription: vi.fn(),
  finalizePrescription: vi.fn(),
  getValidatedAssistance: vi.fn(),
  searchMedicines: vi.fn(),
  listDiagnosisCatalog: vi.fn(),
  listMedicines: vi.fn(),
  downloadMedicineCsvTemplate: vi.fn(),
  previewMedicineCsv: vi.fn(),
  commitMedicineCsv: vi.fn(),
  getMedicineReferences: vi.fn(),
  getPatient: vi.fn(),
  getPatientHistory: vi.fn(),
  getDocumentHtml: vi.fn(),
}));

const mockDoctorUser = {
  id: 'usr_dr_sharma',
  username: 'dr_sharma',
  fullName: 'Dr. Alok Sharma, BAMS MD',
  role: 'DOCTOR' as const,
  workspaceId: 'ws_kayachikitsa',
};

const mockAuthorityUser = {
  id: 'usr_admin',
  username: 'admin',
  fullName: 'Ayurvedic Medical Superintendent',
  role: 'AUTHORITY' as const,
};

describe('Repeatable Chief Complaints UI in ConsultationWorkspace', () => {
  const mockVisitWorkspace = {
    visit_detail: {
      visit: {
        id: 'vis_test_101',
        patient_id: 'pat_101',
        doctor_id: 'usr_dr_sharma',
        visit_number: 1,
        visit_date: '2026-09-14',
        purpose: 'Routine review',
        status: 'IN_PROGRESS',
        created_by: 'usr_dr_sharma',
        created_at: '2026-09-14T10:00:00Z',
        updated_at: '2026-09-14T10:00:00Z',
      },
      patient_name: 'Rajesh Verma',
      patient_code: 'OPD-2026-0001',
      doctor_name: 'Dr. Alok Sharma, BAMS MD',
      complaints: {
        id: 'cmp_101',
        visit_id: 'vis_test_101',
        chief_complaint: 'Katishoola — 3 Weeks; Janu Sandhigata Vata — 6 Months',
        history_text: 'Pain aggravated during morning hours.',
        past_history: 'None',
        family_history: 'None',
        personal_history: 'Sedentary',
        recorded_by: 'usr_dr_sharma',
        recorded_at: '2026-09-14T10:05:00Z',
        updated_at: '2026-09-14T10:05:00Z',
      },
      complaints_list: [
        {
          id: 'vcmp_1',
          visit_id: 'vis_test_101',
          complaint_text: 'Katishoola',
          duration_value: 3,
          duration_unit: 'Weeks',
          notes: 'Lower back stiffness',
          sort_order: 0,
          created_at: '2026-09-14T10:05:00Z',
        },
        {
          id: 'vcmp_2',
          visit_id: 'vis_test_101',
          complaint_text: 'Janu Sandhigata Vata',
          duration_value: 6,
          duration_unit: 'Months',
          notes: 'Crepitus in right knee',
          sort_order: 1,
          created_at: '2026-09-14T10:05:00Z',
        },
      ],
      vitals: null,
      consent: null,
      ayush_case: null,
      queue_entry: null,
    },
    diagnoses: [],
    prescription: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: mockDoctorUser,
      token: 'mock-token',
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
    } as any);
    vi.mocked(api.getConsultationWorkspace).mockResolvedValue(mockVisitWorkspace as any);
    vi.mocked(api.saveClinicalNotes).mockResolvedValue({ success: true, message: 'Notes saved' } as any);
    vi.mocked(api.searchMedicines).mockResolvedValue([]);
  });

  it('renders existing repeatable chief complaints with individual duration and units', async () => {
    render(<ConsultationWorkspace visitId="vis_test_101" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Chief Complaints & Durations/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('Katishoola')).toBeInTheDocument();
      expect(screen.getByDisplayValue('3')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Janu Sandhigata Vata')).toBeInTheDocument();
      expect(screen.getByDisplayValue('6')).toBeInTheDocument();
    });
  });

  it('adds a new complaint row when "Add Another Chief Complaint" is clicked', async () => {
    render(<ConsultationWorkspace visitId="vis_test_101" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Chief Complaints & Durations/i)).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /Add Another Chief Complaint/i });
    fireEvent.click(addBtn);

    const inputs = screen.getAllByPlaceholderText(/Complaint \(e\.g\. Shoola/i);
    expect(inputs.length).toBe(3);
  });

  it('appends a suggestion chip when clicked', async () => {
    render(<ConsultationWorkspace visitId="vis_test_101" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('+ Jwara (Fever)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Jwara (Fever)'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Jwara (Fever)')).toBeInTheDocument();
    });
  });

  it('saves clinical notes and dispatches complaints_list array payload', async () => {
    render(<ConsultationWorkspace visitId="vis_test_101" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Katishoola')).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /Save Notes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.saveClinicalNotes).toHaveBeenCalledWith(
        'vis_test_101',
        expect.objectContaining({
          complaints_list: expect.arrayContaining([
            expect.objectContaining({
              complaint_text: 'Katishoola',
              duration_value: 3,
              duration_unit: 'Weeks',
            }),
            expect.objectContaining({
              complaint_text: 'Janu Sandhigata Vata',
              duration_value: 6,
              duration_unit: 'Months',
            }),
          ]),
        })
      );
    });
  });
});

describe('Authority CSV Import and Clinical References (MasterDataView)', () => {
  const mockMedicines: T.Medicine[] = [
    {
      id: 'med_ashwa_01',
      code: 'ASHWA-CHURNA',
      name: 'Ashwagandha Churna',
      name_hi: 'अश्वगंधा चूर्ण',
      english_name: 'Ashwagandha Churna',
      sanskrit_name: 'Aśvagandhā Cūrṇa',
      form: 'Churna',
      strength: '3g-6g',
      status: 'ACTIVE',
      source: 'BAMS Classical',
      validation_status: 'VALIDATED',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  const mockReferences: T.ClinicalReference[] = [
    {
      id: 'cref_01',
      medicine_id: 'med_ashwa_01',
      chief_complaint: 'Chronic fatigue, insomnia, vata imbalance',
      duration_context: '4-8 weeks',
      roga_name: 'Klaibya / Daurbalya',
      namc_code: 'DAU-01',
      formulation_form: 'Churna',
      dose: '3-6g',
      frequency: 'twice daily',
      anupana: 'Warm cow milk',
      source: 'BAMS Classical Formulation Protocol',
      source_reference: 'NAMC Standard Formulations Guide 2024',
      validation_status: 'VALIDATED',
      dataset_version: 'v1.0',
      imported_at: '2026-09-14T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    window.URL.revokeObjectURL = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      user: mockAuthorityUser,
      token: 'mock-auth-token',
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
    } as any);
    vi.mocked(api.listDiagnosisCatalog).mockResolvedValue([]);
    vi.mocked(api.listMedicines).mockResolvedValue(mockMedicines);
    vi.mocked(api.getMedicineReferences).mockResolvedValue(mockReferences);
  });

  it('opens CSV import modal and displays template download and preview controls', async () => {
    vi.mocked(api.downloadMedicineCsvTemplate).mockResolvedValue('code,name\nM1,Med1');
    render(<MasterDataView />);

    const medTab = screen.getByRole('button', { name: /Formulated Medicines/i });
    fireEvent.click(medTab);

    await waitFor(() => {
      expect(screen.getByText('Ashwagandha Churna')).toBeInTheDocument();
    });

    // Test CSV Templates dropdown
    const templateBtn = screen.getByRole('button', { name: /CSV Templates/i });
    fireEvent.click(templateBtn);
    expect(screen.getByText('Medicine Master Template')).toBeInTheDocument();
    expect(screen.getByText('Clinical References Template')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Medicine Master Template'));
    expect(api.downloadMedicineCsvTemplate).toHaveBeenCalledWith('medicine_master');

    // Test opening Import Modal
    const importBtn = screen.getByRole('button', { name: /Import CSV \(Authority\)/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(screen.getByText(/Authority CSV Import & Monograph Ingestion/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Dataset Name')).toBeInTheDocument();
    expect(screen.getByText('Dataset Version')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste comma-separated CSV text/i)).toBeInTheDocument();
  });

  it('displays preview analysis statistics and rows upon CSV preview', async () => {
    vi.mocked(api.previewMedicineCsv).mockResolvedValue({
      csv_type: 'MEDICINE_MASTER',
      rows_detected: 2,
      new_medicines: 1,
      existing_medicines: 1,
      duplicate_rows: 0,
      conflicts: 0,
      warnings: [],
      errors: [],
      can_commit: true,
      preview_rows: [
        {
          row: 2,
          medicine: 'Shatavari Ghruta',
          name: 'Shatavari Ghruta',
          form: 'Ghruta',
          strength: '10ml',
          status: 'VALIDATED',
          already_in_db: false,
        },
      ],
    });

    render(<MasterDataView />);

    const medTab = screen.getByRole('button', { name: /Formulated Medicines/i });
    fireEvent.click(medTab);

    await waitFor(() => {
      expect(screen.getByText('Ashwagandha Churna')).toBeInTheDocument();
    });

    const importBtn = screen.getByRole('button', { name: /Import CSV \(Authority\)/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(screen.getByText(/Authority CSV Import & Monograph Ingestion/i)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Paste comma-separated CSV text/i);
    fireEvent.change(textarea, { target: { value: 'Medicine Name,Form\nShatavari Ghruta,Ghruta' } });

    await waitFor(() => {
      expect(screen.getByText('Rows Detected')).toBeInTheDocument();
      expect(screen.getByText('Shatavari Ghruta')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Commit Import/i })).toBeInTheDocument();
    });
  });

  it('opens clinical references inspector modal when "References" is clicked', async () => {
    render(<MasterDataView />);

    const medTab = screen.getByRole('button', { name: /Formulated Medicines/i });
    fireEvent.click(medTab);

    await waitFor(() => {
      expect(screen.getByText('Ashwagandha Churna')).toBeInTheDocument();
    });

    const inspectBtn = screen.getByRole('button', { name: /^References$/i });
    fireEvent.click(inspectBtn);

    await waitFor(() => {
      expect(api.getMedicineReferences).toHaveBeenCalledWith('med_ashwa_01');
      expect(screen.getByText(/Classical & Research References/i)).toBeInTheDocument();
      expect(screen.getByText('Klaibya / Daurbalya')).toBeInTheDocument();
      expect(screen.getByText('Warm cow milk')).toBeInTheDocument();
      expect(screen.getByText(/BAMS Classical Formulation Protocol/i)).toBeInTheDocument();
    });
  });
});

describe('Patient History View Repeatable Complaints Rendering', () => {
  const mockPatientRecord = {
    id: 'pat-101',
    workspace_id: 'ws_kayachikitsa',
    patient_code: 'OPD-2026-0001',
    full_name: 'Rajesh Verma',
    sex: 'Male',
    date_of_birth: '1978-01-01',
    phone: '9876543210',
    status: 'ACTIVE' as const,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  };

  const mockHistoricalVisits = [
    {
      id: 'vis_test_101',
      visit_number: 1,
      visit_date: '2026-09-14',
      purpose: 'Initial consultation',
      status: 'FINALIZED',
      doctor_name: 'Dr. Alok Sharma, BAMS MD',
      has_document: true,
      document_id: 'doc_101',
      complaints: {
        chief_complaint: 'Katishoola — 3 Weeks; Janu Sandhigata Vata — 6 Months',
      },
      complaints_list: [
        {
          id: 'vcmp_1',
          visit_id: 'vis_test_101',
          complaint_text: 'Katishoola (Lower back stiffness)',
          duration_value: 3,
          duration_unit: 'Weeks',
          notes: 'Morning aggravation',
        },
        {
          id: 'vcmp_2',
          visit_id: 'vis_test_101',
          complaint_text: 'Janu Sandhigata Vata (Right knee)',
          duration_value: 6,
          duration_unit: 'Months',
          notes: 'Crepitus present',
        },
      ],
      diagnoses: ['Sandhigata Vata (Osteoarthritis)'],
      prescription: {
        status: 'FINALIZED',
        items: [],
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getPatient).mockResolvedValue(mockPatientRecord);
    vi.mocked(api.getPatientHistory).mockResolvedValue(mockHistoricalVisits as any);
  });

  it('renders numbered repeatable chief complaints with duration in patient encounter history', async () => {
    render(
      <PatientHistoryView
        patientId="pat-101"
        patientName="Rajesh Verma"
        patientUhid="OPD-2026-0001"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Katishoola \(Lower back stiffness\)/i)).toBeInTheDocument();
      expect(screen.getByText(/3 Weeks/i)).toBeInTheDocument();
      expect(screen.getByText(/Janu Sandhigata Vata \(Right knee\)/i)).toBeInTheDocument();
      expect(screen.getByText(/6 Months/i)).toBeInTheDocument();
    });
  });
});
