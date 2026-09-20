export interface OcrExtractionResult {
  isReadable: boolean;
  rawTextPreview?: string;
  candidateExtraction?: {
    conditions: string[];
    medications: string[];
    vitals: Record<string, string>;
    notes: string;
    confidence: number;
  };
  errorMessage?: string;
}

export async function processDocumentOcr(
  fileName: string,
  _fileType: string,
  textSampleOrPreset?: string
): Promise<OcrExtractionResult> {
  const name = fileName.toLowerCase();

  // If designated as unreadable or contains 'blurry' / 'unreadable'
  if (name.includes('blurry') || name.includes('unreadable') || textSampleOrPreset === 'PRESET_UNREADABLE') {
    return {
      isReadable: false,
      rawTextPreview: '<< DEGRADED IMAGE SCAN / ILLEGIBLE HANDWRITING >>',
      errorMessage: 'Could not reliably extract information from this document. Image resolution or handwriting is below clinical threshold.',
      candidateExtraction: undefined,
    };
  }

  // Preset or simulated extraction for Cardiac / Discharge summary
  if (name.includes('discharge') || name.includes('ecg') || textSampleOrPreset === 'PRESET_CARDIAC') {
    return {
      isReadable: true,
      rawTextPreview: `STERLING MULTISPECIALTY HOSPITAL - CLINICAL DISCHARGE SUMMARY\nPatient: Ramesh Patel (52M)\nAdmission Diagnosis: Essential Systemic Hypertension\nDischarge Vitals: BP 148/92 mmHg, Pulse 76 bpm, SpO2 98%\nPrescribed Medications: Tab Amlodipine 5mg OD, Tab Atorvastatin 10mg OD\nECG Summary: Sinus rhythm with mild LVH voltage criteria.`,
      candidateExtraction: {
        conditions: ['Essential Systemic Hypertension', 'Left Ventricular Hypertrophy (LVH)'],
        medications: ['Tab Amlodipine 5mg Once Daily', 'Tab Atorvastatin 10mg Once Daily'],
        vitals: {
          bloodPressure: '148/92 mmHg',
          heartRate: '76 bpm',
          spo2: '98%',
        },
        notes: 'AI candidate extraction successful. Document verified as institutional discharge note.',
        confidence: 0.94,
      },
    };
  }

  // Preset or simulated extraction for Blood Lab Report
  if (name.includes('lab') || name.includes('blood') || name.includes('metabolic') || textSampleOrPreset === 'PRESET_LAB') {
    return {
      isReadable: true,
      rawTextPreview: `PATHOLOGY & BIOCHEMISTRY INVESTIGATION REPORT\nGlycosylated Hemoglobin (HbA1c): 6.8% (Elevated)\nFasting Blood Sugar: 128 mg/dL\nTotal Cholesterol: 214 mg/dL\nTriglycerides: 190 mg/dL\nImpression: Early Type 2 Diabetes Mellitus / Dyslipidemia.`,
      candidateExtraction: {
        conditions: ['Early Type 2 Diabetes Mellitus', 'Dyslipidemia'],
        medications: ['Dietary lifestyle modification', 'Metformin 500mg advised'],
        vitals: {
          fastingGlucose: '128 mg/dL',
          hba1c: '6.8%',
        },
        notes: 'Clinical biochemistry report with abnormal metabolic indicators.',
        confidence: 0.91,
      },
    };
  }

  // General default fallback
  return {
    isReadable: true,
    rawTextPreview: `GENERAL MEDICAL ASSESSMENT REPORT\nFindings: Mild respiratory congestion, clear lung fields.\nAdvised: Oral hydration, rest.`,
    candidateExtraction: {
      conditions: ['Mild Upper Respiratory Infection'],
      medications: ['Paracetamol 500mg SOS', 'Saline nasal drops'],
      vitals: {
        temperatureF: '99.1 F',
      },
      notes: 'General clinical consultation record.',
      confidence: 0.85,
    },
  };
}
