import { FacilityCapability, UrgencyLevel } from '@/types';

export interface TriageInput {
  chiefComplaint: string;
  duration?: string;
  severity?: number; // 1-10
  vitals?: {
    bloodPressure?: string;
    heartRate?: number;
    spo2?: number;
    temperatureF?: number;
    bloodGlucose?: number;
  };
  patientHistory?: string[];
  allergies?: string[];
  additionalNotes?: string;
}

export interface TriageAssessment {
  urgencyLevel: UrgencyLevel;
  careRequirement: string;
  requiredCapabilities: FacilityCapability[];
  aiReasoning: string[];
  recommendedAction: string;
  isEmergencyAlert: boolean;
}

export async function runClinicalTriage(input: TriageInput): Promise<TriageAssessment> {
  const text = `${input.chiefComplaint} ${input.additionalNotes || ''}`.toLowerCase();
  const bp = input.vitals?.bloodPressure || '';
  const spo2 = input.vitals?.spo2;
  const hr = input.vitals?.heartRate;

  // Evaluate safety-critical deterministic red flags
  const hasChestPain = text.includes('chest') || text.includes('angina') || text.includes('heart') || text.includes('sternum');
  const hasBreathingDifficulty = text.includes('breath') || text.includes('dyspnea') || text.includes('suffocat') || (spo2 !== undefined && spo2 < 92);
  const hasTrauma = text.includes('fracture') || text.includes('accident') || text.includes('bleed') || text.includes('head injury') || text.includes('trauma');
  const hasNeuroSigns = text.includes('faint') || text.includes('stroke') || text.includes('paralysis') || text.includes('seizure') || text.includes('slur');
  const hasSeverePain = (input.severity !== undefined && input.severity >= 8) || text.includes('severe') || text.includes('crushing') || text.includes('unbearable');

  // Check critical vitals
  let isHypertensiveCrisis = false;
  if (bp.includes('/')) {
    const [sys, dia] = bp.split('/').map((n) => parseInt(n.trim(), 10));
    if (!isNaN(sys) && sys >= 180) isHypertensiveCrisis = true;
    if (!isNaN(dia) && dia >= 110) isHypertensiveCrisis = true;
  }

  // 1. CARDIAC EMERGENCY
  if ((hasChestPain && (hasSeverePain || hasBreathingDifficulty || isHypertensiveCrisis)) || text.includes('heart attack')) {
    return {
      urgencyLevel: 'EMERGENCY',
      careRequirement: 'Emergency Cardiology Triage & Urgent Cath Lab / Cardiac ICU Access',
      requiredCapabilities: ['CARDIOLOGY', 'CATH_LAB', 'ECG', 'EMERGENCY_24_7', 'ICU'],
      aiReasoning: [
        'High clinical suspicion of Acute Coronary Syndrome (ACS) or acute myocardial ischemia.',
        'Presence of acute chest symptoms combined with severe intensity or vital instability.',
        'Requires immediate facility equipped with 12-lead ECG, cardiac biomarkers, and 24/7 catheterization suite.',
      ],
      recommendedAction: 'Initiate emergency protocol immediately. Transfer to tertiary cardiac emergency center.',
      isEmergencyAlert: true,
    };
  }

  // 2. STROKE / ACUTE NEUROLOGICAL EMERGENCY
  if (hasNeuroSigns || text.includes('weak') || text.includes('numb') || text.includes('droop')) {
    return {
      urgencyLevel: 'EMERGENCY',
      careRequirement: 'Acute Stroke Protocol, Immediate Helical Head CT & Emergency Neurology Triage',
      requiredCapabilities: ['NEUROLOGY', 'DIAGNOSTIC_CT_MRI', 'EMERGENCY_24_7', 'ICU'],
      aiReasoning: [
        'Acute neurological deficit (weakness, speech impairment, or focal deficit) suspicious for Acute Ischemic Stroke / CVA.',
        'Time-critical golden hour intervention window requires immediate CT/MRI imaging and stroke center transfer.',
      ],
      recommendedAction: 'Activate acute stroke code. Immediate transfer to stroke-ready facility with 24/7 CT scanner.',
      isEmergencyAlert: true,
    };
  }

  // 2. TRAUMA / SURGICAL EMERGENCY
  if (hasTrauma && (hasSeverePain || text.includes('fracture') || text.includes('bleed'))) {
    return {
      urgencyLevel: 'EMERGENCY',
      careRequirement: 'Specialized Trauma Care, Helical CT Diagnostics & Emergency Orthopedics',
      requiredCapabilities: ['TRAUMA_CARE', 'ORTHOPEDICS', 'EMERGENCY_24_7', 'DIAGNOSTIC_CT_MRI', 'ICU'],
      aiReasoning: [
        'Acute traumatic injury with risk of skeletal compromise or internal hemorrhage.',
        'Patient requires immediate advanced trauma bay with diagnostic imaging (CT) and orthopedic surgical cover.',
      ],
      recommendedAction: 'Immobilize affected area, start fluid resuscitation if indicated, and route to designated Trauma center.',
      isEmergencyAlert: true,
    };
  }

  // 3. RESPIRATORY COMPROMISE / ASTHMA EXACERBATION
  if (hasBreathingDifficulty && (spo2 !== undefined && spo2 < 94 || hasSeverePain || text.includes('wheez'))) {
    return {
      urgencyLevel: 'URGENT',
      careRequirement: 'Pulmonary / Acute Respiratory Stabilization & Continuous O2 Monitoring',
      requiredCapabilities: ['EMERGENCY_24_7', 'ICU', 'GENERAL_MEDICINE'],
      aiReasoning: [
        `Documented respiratory distress${spo2 ? ` with decreased SpO2 (${spo2}%)` : ''}.`,
        'Needs immediate nebulization, supplemental oxygen, and clinical supervision.',
      ],
      recommendedAction: 'Administer bronchodilators / oxygen at primary center and arrange urgent transfer if uncorrected.',
      isEmergencyAlert: false,
    };
  }

  // 4. SUBACUTE / CHEST DISCOMFORT (Exertional without instability)
  if (hasChestPain) {
    return {
      urgencyLevel: 'URGENT',
      careRequirement: 'Cardiology Specialist Evaluation & 12-Lead ECG Investigation',
      requiredCapabilities: ['CARDIOLOGY', 'ECG', 'GENERAL_MEDICINE'],
      aiReasoning: [
        'Atypical or exertional chest symptoms require formal cardiologist assessment to rule out ischemia.',
        'Recommended diagnostic workup includes resting ECG and cardiac enzyme profiling.',
      ],
      recommendedAction: 'Refer to secondary or tertiary center with cardiology OPD within 24-48 hours.',
      isEmergencyAlert: false,
    };
  }

  // 5. ROUTINE CARE / GENERAL MEDICAL
  return {
    urgencyLevel: 'ROUTINE',
    careRequirement: 'Outpatient General Clinical Consultation & Routine Diagnostics',
    requiredCapabilities: ['GENERAL_MEDICINE'],
    aiReasoning: [
      'No critical hemodynamic red flags or life-threatening organ system symptoms identified.',
      'Symptoms are suitable for primary healthcare evaluation or scheduled outpatient appointment.',
    ],
    recommendedAction: 'Advise patient to consult a primary care physician or visit local PHC during OPD hours.',
    isEmergencyAlert: false,
  };
}
