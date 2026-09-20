import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PatientHistoryView } from '../features/history/PatientHistoryView';
import * as endpoints from '@/api/endpoints';

// Mock API endpoints
vi.mock('@/api/endpoints', () => ({
  getPatient: vi.fn(),
  getPatientHistory: vi.fn(),
  getDocumentHtml: vi.fn(),
}));

const mockPatient = {
  id: 'pat-100',
  workspace_id: 'ws-default',
  uhid: 'AYUR-2026-001',
  full_name: 'Aarav Sharma',
  dob: '1984-05-12',
  gender: 'Male',
  phone: '+91 98765 43210',
  email: 'aarav@example.com',
  address: '123 Station Road',
  city: 'Jaipur',
  state: 'Rajasthan',
  pincode: '302001',
  primary_doctor_id: 'doc-1',
  patient_code: 'PAT-2026-001',
  status: 'ACTIVE' as const,
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
};

describe('ErrorBoundary Component', () => {
  const ThrowError = () => {
    throw new Error('Test crash in clinical view');
  };

  it('catches render errors and renders a friendly clinical error fallback instead of blank white page', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallbackTitle="Patient Encounter View Encountered an Error">
        <ThrowError />
      </ErrorBoundary>
    );

    expect(
      screen.getByText('Patient Encounter View Encountered an Error')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Test crash in clinical view/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Try Again/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Reload Workspace/i })
    ).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});

describe('PatientHistoryView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders patient context header and handles empty encounter history cleanly', async () => {
    vi.mocked(endpoints.getPatient).mockResolvedValue(mockPatient);
    vi.mocked(endpoints.getPatientHistory).mockResolvedValue([]);

    render(
      <PatientHistoryView
        patientId={mockPatient.id}
        patientName={mockPatient.full_name}
        patientUhid={mockPatient.uhid}
        onClose={vi.fn()}
      />
    );

    // Initial props rendered immediately in header
    expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    expect(screen.getByText(/AYUR-2026-001/i)).toBeInTheDocument();

    // After async load completes
    await waitFor(() => {
      expect(
        screen.getByText(/No prior clinical visits or consultations recorded for this patient yet/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/\+91 98765 43210/i)).toBeInTheDocument();
    });
  });

  it('safely renders legacy flat visit records without crashing (defensive mapping against blank screen)', async () => {
    const legacyHistoryItem = {
      id: 'visit-999',
      visit_date: '2026-03-05T09:30:00Z',
      queue_status: 'COMPLETED',
      chief_complaint: 'Severe Amavata joint stiffness',
      pulse_rate: 74,
      blood_pressure: '120/80',
      temperature_f: 98.4,
      created_at: '2026-03-05T09:30:00Z',
    };

    vi.mocked(endpoints.getPatient).mockResolvedValue(mockPatient);
    vi.mocked(endpoints.getPatientHistory).mockResolvedValue([legacyHistoryItem]);

    render(
      <PatientHistoryView
        patientId={mockPatient.id}
        patientName={mockPatient.full_name}
        patientUhid={mockPatient.uhid}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Severe Amavata joint stiffness/i)).toBeInTheDocument();
      expect(screen.getByText(/74 bpm/i)).toBeInTheDocument();
      expect(screen.getByText(/120\/80/i)).toBeInTheDocument();
    });
  });

  it('renders structured visit encounters with Ayush assessment, medicines, and documents', async () => {
    const structuredHistoryItem = {
      visit: {
        id: 'visit-101',
        patient_id: 'pat-100',
        visit_date: '2026-03-08T11:15:00Z',
        queue_status: 'COMPLETED',
        created_at: '2026-03-08T11:15:00Z',
      },
      vitals: {
        pulse_bpm: 76,
        bp_systolic: 122,
        bp_diastolic: 82,
        temperature_f: 98.6,
        spo2_percent: 99,
        respiratory_rate: 16,
      },
      complaints: {
        chief_complaints_text: 'Chronic lower back pain radiating to left leg (Gridhrasi)',
        history_presenting_illness: 'Symptoms worsened during cold mornings',
      },
      ayush_case: {
        prakriti: 'Vata-Pitta',
        vikriti: 'Vata Vriddhi',
        ashtavidha_nadi: 'Sarpagati / Vata',
        agni: 'Manda',
        kostha: 'Krura',
      },
      diagnoses: [
        {
          disease_name: 'Gridhrasi (Sciatica)',
          icd11_code: 'FA80',
          namaste_code: 'AYU-GRID-01',
          provisional_or_final: 'FINAL',
        },
      ],
      prescription: {
        items: [
          {
            medicine_name: 'Yogaraja Guggulu',
            dosage_form: 'Vati / Tablet',
            strength: '500mg',
            frequency: '1-0-1 after food',
            duration_days: 14,
            instructions: 'With warm water',
          },
        ],
      },
      documents: [
        {
          id: 'doc-501',
          document_type: 'CASE_SHEET',
          storage_path: 'cases/pat-100_v1.html',
          sha256_hash: 'abc1234567890abcdef',
          created_at: '2026-03-08T11:45:00Z',
        },
      ],
    };

    vi.mocked(endpoints.getPatient).mockResolvedValue(mockPatient);
    vi.mocked(endpoints.getPatientHistory).mockResolvedValue([structuredHistoryItem]);

    render(
      <PatientHistoryView
        patientId={mockPatient.id}
        patientName={mockPatient.full_name}
        patientUhid={mockPatient.uhid}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      // Complaints
      expect(
        screen.getByText(/Chronic lower back pain radiating to left leg \(Gridhrasi\)/i)
      ).toBeInTheDocument();

      // Ayush examination
      expect(screen.getByText('Vata-Pitta')).toBeInTheDocument();
      expect(screen.getByText('Vata Vriddhi')).toBeInTheDocument();
      expect(screen.getByText('Sarpagati / Vata')).toBeInTheDocument();

      // Diagnosis
      expect(screen.getByText(/Gridhrasi \(Sciatica\)/i)).toBeInTheDocument();

      // Prescription item
      expect(screen.getByText(/Yogaraja Guggulu/i)).toBeInTheDocument();
      expect(screen.getByText(/1-0-1 after food/i)).toBeInTheDocument();

      // Document view button
      expect(screen.getByRole('button', { name: /View/i })).toBeInTheDocument();
    });
  });

  it('triggers onClose when close button is clicked', async () => {
    const handleClose = vi.fn();

    vi.mocked(endpoints.getPatient).mockResolvedValue(mockPatient);
    vi.mocked(endpoints.getPatientHistory).mockResolvedValue([]);

    render(
      <PatientHistoryView
        patientId={mockPatient.id}
        patientName={mockPatient.full_name}
        patientUhid={mockPatient.uhid}
        onClose={handleClose}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No prior clinical visits or consultations recorded for this patient yet/i)
      ).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: /Close history modal/i });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
