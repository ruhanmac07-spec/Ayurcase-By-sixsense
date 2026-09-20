import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { UsersView } from '../features/authority/UsersView';
import { MasterDataView } from '../features/authority/MasterDataView';
import { PatientHistoryView } from '../features/history/PatientHistoryView';
import * as api from '../api/endpoints';
import * as T from '../api/types';

// Mock API endpoints
vi.mock('../api/endpoints', () => ({
  listUsers: vi.fn(),
  listWorkspaces: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  resetUserPassword: vi.fn(),
  listDiagnosisCatalog: vi.fn(),
  listMedicines: vi.fn(),
  createMedicine: vi.fn(),
  updateMedicine: vi.fn(),
  getPatient: vi.fn(),
  getPatientHistory: vi.fn(),
  getDocumentHtml: vi.fn(),
}));

const mockWorkspaces: T.Workspace[] = [
  {
    id: 'ws_kayachikitsa',
    code: 'KAYA',
    name: 'Kayachikitsa (Internal Medicine)',
    description: 'General Ayurvedic internal medicine and wellness department',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ws_panchakarma',
    code: 'PANCHA',
    name: 'Panchakarma Therapy Unit',
    description: 'Therapeutic detoxification and procedures department',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const mockUsers: T.UserSummary[] = [
  {
    id: 'usr_admin',
    username: 'admin',
    full_name: 'Central Admin',
    role: 'AUTHORITY',
    status: 'ACTIVE',
    workspace_id: undefined,
    workspace_name: undefined,
  },
  {
    id: 'usr_dr_sharma',
    username: 'dr_sharma',
    full_name: 'Dr. Alok Sharma, BAMS MD',
    role: 'DOCTOR',
    status: 'ACTIVE',
    workspace_id: 'ws_kayachikitsa',
    workspace_name: 'Kayachikitsa (Internal Medicine)',
  },
  {
    id: 'usr_asst_priya',
    username: 'asst_priya',
    full_name: 'Priya Nair (OPD Reception)',
    role: 'ASSISTANT',
    status: 'ACTIVE',
    workspace_id: 'ws_kayachikitsa',
    workspace_name: 'Kayachikitsa (Internal Medicine)',
  },
  {
    id: 'usr_dr_varu',
    username: 'dr_varu',
    full_name: 'Dr. Mitraj Varu, BAMS MD (Panchakarma)',
    role: 'DOCTOR',
    status: 'ACTIVE',
    workspace_id: 'ws_panchakarma',
    workspace_name: 'Panchakarma Therapy Unit',
  },
  {
    id: 'usr_asst_kavita',
    username: 'asst_kavita',
    full_name: 'Kavita Nair (Therapy Intake)',
    role: 'ASSISTANT',
    status: 'ACTIVE',
    workspace_id: 'ws_panchakarma',
    workspace_name: 'Panchakarma Therapy Unit',
  },
];

const mockMedicines: T.Medicine[] = [
  {
    id: 'med-ashwa-01',
    code: 'MED-ASHWA-01',
    name: 'Ashwagandha Churna',
    name_hi: 'अश्वगंधा चूर्ण',
    form: 'Churna',
    strength: '3-6g',
    description: 'Classical Rasayana',
    status: 'ACTIVE',
  },
  {
    id: 'med-sito-01',
    code: 'MED-SITO-01',
    name: 'Sitopaladi Churna',
    name_hi: 'सितोपलादि चूर्ण',
    form: 'Churna',
    strength: '2-4g',
    description: 'Classical formulation for Kasa',
    status: 'ACTIVE',
  },
];

describe('Authority Panel — Department & Role Organization (UsersView)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listUsers).mockResolvedValue(mockUsers);
    vi.mocked(api.listWorkspaces).mockResolvedValue(mockWorkspaces);
  });

  it('organizes users by department with strictly separated Doctors and Assistants sections', async () => {
    render(<UsersView />);

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText('Kayachikitsa (Internal Medicine)')).toBeInTheDocument();
      expect(screen.getByText('Panchakarma Therapy Unit')).toBeInTheDocument();
    });

    // Check doctor and assistant section headers exist
    const doctorSections = screen.getAllByText(/Department Physicians \(चिकित्सक\)/i);
    expect(doctorSections.length).toBe(2);

    const assistantSections = screen.getAllByText(/Clinical & Intake Assistants \(सहायक\)/i);
    expect(assistantSections.length).toBe(2);

    // Verify doctors are shown
    expect(screen.getByText('Dr. Alok Sharma, BAMS MD')).toBeInTheDocument();
    expect(screen.getByText('Dr. Mitraj Varu, BAMS MD (Panchakarma)')).toBeInTheDocument();

    // Verify assistants are shown
    expect(screen.getByText('Priya Nair (OPD Reception)')).toBeInTheDocument();
    expect(screen.getByText('Kavita Nair (Therapy Intake)')).toBeInTheDocument();

    // Verify Central Authority global section is rendered
    expect(screen.getByText('Central Authority & System Administration')).toBeInTheDocument();
    expect(screen.getByText('Central Admin')).toBeInTheDocument();
  });

  it('filters users by department selector', async () => {
    render(<UsersView />);

    await waitFor(() => {
      expect(screen.getByText('Kayachikitsa (Internal Medicine)')).toBeInTheDocument();
    });

    // Select Panchakarma department
    const deptSelect = screen.getByLabelText(/Department \/ Workspace/i);
    fireEvent.change(deptSelect, { target: { value: 'ws_panchakarma' } });

    // Panchakarma doctor must be present
    expect(screen.getByText('Dr. Mitraj Varu, BAMS MD (Panchakarma)')).toBeInTheDocument();
    // Kayachikitsa doctor must not be in visible department list
    expect(screen.queryByText('Dr. Alok Sharma, BAMS MD')).not.toBeInTheDocument();
  });

  it('filters users by search query', async () => {
    render(<UsersView />);

    await waitFor(() => {
      expect(screen.getByText('Dr. Alok Sharma, BAMS MD')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name, username.../i);
    fireEvent.change(searchInput, { target: { value: 'dr_varu' } });

    expect(screen.getByText('Dr. Mitraj Varu, BAMS MD (Panchakarma)')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Alok Sharma, BAMS MD')).not.toBeInTheDocument();
  });
});

describe('Bilingual Medicine Master Catalog (MasterDataView)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listDiagnosisCatalog).mockResolvedValue([]);
    vi.mocked(api.listMedicines).mockResolvedValue(mockMedicines);
  });

  it('displays both English and Hindi formulation names in the master catalog', async () => {
    render(<MasterDataView />);

    // Click on Formulated Medicines subtab
    const medTab = screen.getByRole('button', { name: /Formulated Medicines/i });
    fireEvent.click(medTab);

    await waitFor(() => {
      expect(screen.getByText('Ashwagandha Churna')).toBeInTheDocument();
      expect(screen.getByText('अश्वगंधा चूर्ण')).toBeInTheDocument();
      expect(screen.getByText('Sitopaladi Churna')).toBeInTheDocument();
      expect(screen.getByText('सितोपलादि चूर्ण')).toBeInTheDocument();
    });
  });

  it('filters medicines by Hindi Devanagari search query', async () => {
    render(<MasterDataView />);

    const medTab = screen.getByRole('button', { name: /Formulated Medicines/i });
    fireEvent.click(medTab);

    await waitFor(() => {
      expect(screen.getByText('Ashwagandha Churna')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Filter medicines.../i);
    fireEvent.change(searchInput, { target: { value: 'अश्वगंधा' } });

    expect(screen.getByText('Ashwagandha Churna')).toBeInTheDocument();
    expect(screen.getByText('अश्वगंधा चूर्ण')).toBeInTheDocument();
    expect(screen.queryByText('Sitopaladi Churna')).not.toBeInTheDocument();
  });
});

describe('Patient Code Label Consistency (PatientHistoryView)', () => {
  const mockPatientRecord = {
    id: 'pat-100',
    workspace_id: 'ws_kayachikitsa',
    patient_code: 'OPD-2026-0042',
    full_name: 'Rajesh Verma',
    sex: 'Male',
    date_of_birth: '1980-05-15',
    phone: '9876543210',
    status: 'ACTIVE' as const,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getPatient).mockResolvedValue(mockPatientRecord);
    vi.mocked(api.getPatientHistory).mockResolvedValue([]);
  });

  it('displays Patient Code: prefix in the patient header badge', async () => {
    render(
      <PatientHistoryView
        patientId="pat-100"
        patientName="Rajesh Verma"
        patientUhid="OPD-2026-0042"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Patient Code: OPD-2026-0042/i)).toBeInTheDocument();
    });
  });
});
