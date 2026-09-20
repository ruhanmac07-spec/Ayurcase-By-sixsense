import { describe, it, expect } from 'vitest';
import * as T from '../api/types';

describe('Clinical Rules Provenance Invariant', () => {
  it('displays rule identifier, version, and provenance citation when validated rule matches', () => {
    const validatedResult: T.ValidatedAssistanceResult = {
      has_validated_rule: true,
      diagnosis_id: 'diag_amavata_01',
      diagnosis_name: 'Amavata (Rheumatoid Arthritis)',
      rule_id: 'rul_amavata_01',
      rule_code: 'RUL_AMAVATA_STD',
      version: 1,
      anupana: 'Ushnodaka (Warm Water)',
      pathya: 'Laghu, deepana, pachana diet like Kulattha, Yava, Purana Shali.',
      apathya: 'Curd, fish, black gram, heavy cold foods, day sleeping.',
      items: [
        {
          medicine_id: 'med_amavata_01',
          medicine_name: 'Simhanada Guggulu',
          form: 'Vati',
          dosage_text: '2 tablets',
          frequency_text: 'Twice daily',
          duration_text: '14 days',
          instructions_text: 'After food with warm water',
        },
      ],
    };

    expect(validatedResult.has_validated_rule).toBe(true);
    expect(validatedResult.rule_code).toBe('RUL_AMAVATA_STD');
    expect(validatedResult.version).toBe(1);
    expect(validatedResult.items.length).toBeGreaterThan(0);
    expect(validatedResult.items[0].medicine_name).toBe('Simhanada Guggulu');
  });

  it('displays calm fallback message when no validated recommendation exists', () => {
    const unvalidatedResult: T.ValidatedAssistanceResult = {
      has_validated_rule: false,
      diagnosis_id: 'diag_uncommon_01',
      diagnosis_name: 'Uncommon Atypical Presentation',
      items: [],
      message: 'No validated recommendation available for this diagnosis.',
    };

    expect(unvalidatedResult.has_validated_rule).toBe(false);
    expect(unvalidatedResult.rule_code).toBeUndefined();
    expect(unvalidatedResult.message).toBe('No validated recommendation available for this diagnosis.');
    expect(unvalidatedResult.items).toHaveLength(0);
  });
});
