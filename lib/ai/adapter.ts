import { z } from 'zod';
import { runClinicalTriage, TriageInput, TriageAssessment } from '@/lib/services/triage';

const AiTriageResponseSchema = z.object({
  urgencyLevel: z.enum(['EMERGENCY', 'URGENT', 'ROUTINE']),
  careRequirement: z.string(),
  requiredCapabilities: z.array(z.string()),
  aiReasoning: z.array(z.string()),
  recommendedAction: z.string(),
  isEmergencyAlert: z.boolean(),
});

export async function generateTriageAssistance(input: TriageInput): Promise<TriageAssessment> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // 1. If API key exists, attempt structured LLM inference
  if (apiKey) {
    try {
      const prompt = `You are a clinical decision support system for a primary care access and referral platform.
Analyze the following patient encounter information:
- Chief Complaint: ${input.chiefComplaint}
- Duration: ${input.duration || 'Not specified'}
- Severity (1-10): ${input.severity || 'Not specified'}
- Vitals: ${JSON.stringify(input.vitals || {})}
- History: ${input.patientHistory?.join(', ') || 'None reported'}
- Allergies: ${input.allergies?.join(', ') || 'None reported'}
- Clinical Notes: ${input.additionalNotes || 'None'}

Strict Rules:
1. Do NOT make an autonomous diagnosis (e.g. do not say "You have a heart attack"). State care requirements instead (e.g. "Urgent emergency cardiology evaluation").
2. Do NOT prescribe medications.
3. Map urgency to EMERGENCY, URGENT, or ROUTINE.
4. Choose required capabilities from: CARDIOLOGY, CATH_LAB, ECG, EMERGENCY_24_7, ICU, TRAUMA_CARE, NEUROLOGY, ORTHOPEDICS, PEDIATRICS, DIAGNOSTIC_CT_MRI, GENERAL_MEDICINE.
5. Return strictly valid JSON conforming to:
{
  "urgencyLevel": "EMERGENCY" | "URGENT" | "ROUTINE",
  "careRequirement": string,
  "requiredCapabilities": string[],
  "aiReasoning": string[],
  "recommendedAction": string,
  "isEmergencyAlert": boolean
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        }
      );

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          const validated = AiTriageResponseSchema.safeParse(parsed);
          if (validated.success) {
            return validated.data as TriageAssessment;
          }
        }
      }
    } catch {
      // Fall through to deterministic rules on any API / parsing failure
    }
  }

  // 2. Deterministic Fallback: Safety-critical codified clinical rules engine
  return runClinicalTriage(input);
}
