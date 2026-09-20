import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PatientHistoryView } from '../features/history/PatientHistoryView';
import * as endpoints from '@/api/endpoints';

vi.mock('@/api/endpoints', () => ({
  getPatient: vi.fn(),
  getPatientHistory: vi.fn(),
  getDocumentHtml: vi.fn(),
  getDocumentPdfBlobUrl: vi.fn(),
  searchDiagnosisCatalog: vi.fn(),
}));

const mockPatient = {
  id: 'pat-100',
  workspace_id: 'ws-default',
  uhid: 'AYUR-2026-001',
  full_name: 'Vikram Singhania',
  dob: '1984-05-12',
  gender: 'Male',
  phone: '+91 98765 43210',
  email: 'vikram@example.com',
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

const mockHistoryItem = {
  visit: {
    id: 'vis-101',
    patient_id: 'pat-100',
    doctor_id: 'doc-1',
    department_id: 'dep-1',
    status: 'FINALIZED',
    purpose: 'Acid reflux and indigestion',
    visit_date: '2026-03-08T10:00:00Z',
    created_at: '2026-03-08T10:00:00Z',
    updated_at: '2026-03-08T11:45:00Z',
  },
  doctor_name: 'Dr. Sharma',
  department_name: 'Kayachikitsa',
  complaints: {
    id: 'cmp-101',
    visit_id: 'vis-101',
    chief_complaint: 'Amlapitta with burning sensation',
    history_text: 'Spicy dietary habits',
    created_at: '2026-03-08T10:15:00Z',
  },
  complaints_list: [
    {
      id: 'vc-1',
      visit_id: 'vis-101',
      complaint_text: 'Amlodgara (Acid eructations)',
      duration_value: 3,
      duration_unit: 'Weeks',
      notes: 'Severe postprandial burning',
      sort_order: 0,
      created_at: '2026-03-08T10:15:00Z',
    },
  ],
  vitals: null,
  ayush_exam: null,
  diagnoses: [
    {
      id: 'vd-101',
      diagnosis_id: 'diag-amp-01',
      code: 'AMP-01',
      name: 'Amlapitta',
      diagnosis_text: 'Urdhwaga Amlapitta',
      selected_at: '2026-03-08T10:20:00Z',
    },
  ],
  prescription: null,
  documents: [
    {
      id: 'doc-pdf-999',
      visit_id: 'vis-101',
      doc_type: 'CASE_SHEET',
      title: 'Sealed Case Sheet & Prescription',
      file_path: '/sealed/CASE_PAT-2026-001.pdf',
      sha256_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      created_at: '2026-03-08T11:45:00Z',
    },
  ],
};

describe('Phase 2 Final Critical Fixes Verification', () => {
  let revokeObjectURLSpy: any;

  beforeEach(() => {
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.mocked(endpoints.getPatient).mockResolvedValue(mockPatient);
    vi.mocked(endpoints.getPatientHistory).mockResolvedValue([mockHistoryItem]);
  });

  afterEach(() => {
    revokeObjectURLSpy?.mockRestore();
    vi.clearAllMocks();
  });

  it('renders embedded PDF iframe with Blob URL for sealed documents instead of raw text', async () => {
    const mockBlobUrl = 'blob:http://localhost:5173/test-pdf-blob-uuid';
    vi.mocked(endpoints.getDocumentPdfBlobUrl).mockResolvedValue(mockBlobUrl);

    render(
      <PatientHistoryView
        patientId={mockPatient.id}
        patientName={mockPatient.full_name}
        patientUhid={mockPatient.uhid}
        onClose={vi.fn()}
      />
    );

    // Wait for history view to render
    await waitFor(() => {
      expect(screen.getByText(/Amlodgara \(Acid eructations\)/i)).toBeInTheDocument();
      expect(screen.getByText('3 Weeks')).toBeInTheDocument();
      expect(screen.getByText(/AMP-01/i)).toBeInTheDocument();
    });

    // Click "View Document" button for the sealed document
    const viewButton = screen.getByRole('button', { name: /View Document/i });
    fireEvent.click(viewButton);

    await waitFor(() => {
      expect(endpoints.getDocumentPdfBlobUrl).toHaveBeenCalledWith('doc-pdf-999');
      // Iframe should be present with PDF blob URL
      const iframe = screen.getByTitle('Sealed Clinical Document') as HTMLIFrameElement;
      expect(iframe).toBeInTheDocument();
      expect(iframe.getAttribute('src')).toBe(mockBlobUrl);
    });

    // Verify "Print Document" and modal title exist
    expect(screen.getByText('Sealed Clinical Document Preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print Document/i })).toBeInTheDocument();

    // Close preview modal by clicking the X button in the modal header
    const closeBtn = screen.getByRole('button', { name: /Close document preview/i });
    fireEvent.click(closeBtn);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(mockBlobUrl);
  });

  it('verifies repeatable complaints with duration value and units are displayed accurately', async () => {
    render(
      <PatientHistoryView
        patientId={mockPatient.id}
        patientName={mockPatient.full_name}
        patientUhid={mockPatient.uhid}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Amlodgara (Acid eructations)')).toBeInTheDocument();
      expect(screen.getByText('3 Weeks')).toBeInTheDocument();
      expect(screen.getByText(/Severe postprandial burning/i)).toBeInTheDocument();
    });
  });
});
