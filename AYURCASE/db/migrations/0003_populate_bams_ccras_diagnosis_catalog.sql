-- =========================================================
-- AYURCASE Phase 2 — Migration 0003
-- Populate Diagnosis Catalog with 28 BAMS Conditions (NAMC Codes)
-- & CCRAS Clinical Roga Names, Link Clinical References & Rules
-- =========================================================

PRAGMA foreign_keys = ON;

-- 1. Populate the 28 Standard BAMS Diagnoses with Authoritative NAMC Codes
INSERT INTO diagnosis_catalog (id, code, name, description, status, created_at, updated_at)
VALUES
    ('diag_namc_amp_01', 'AMP-01', 'Amlapitta', 'Retrosternal burning (Hritkantha Daha), acid eructations (Amlodgara), nausea, loss of taste', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_agm_02', 'AGM-02', 'Agnimandya / Ajeerna', 'Loss of appetite (Aruchi), postprandial abdominal heaviness (Udara Gourava), sluggish digestion', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_grh_03', 'GRH-03', 'Grahani Roga (IBS pattern)', 'Alternating loose and hard stool, mucus in stool, chronic abdominal cramp relieved by defecation', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_ats_04', 'ATS-04', 'Atisara (Acute Diarrhea)', 'Frequent watery stools, griping umbilical pain (Udara Shula), dehydration, exhaustion', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_vib_05', 'VIB-05', 'Vibandha (Constipation)', 'Hard, dry stools (Baddha Vit), straining, incomplete evacuation sensation, flatulence', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_ars_06', 'ARS-06', 'Arshas (Hemorrhoids)', 'Bleeding per rectum with defecation, painful anorectal mass, constipation (Arshas)', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_prm_07', 'PRM-07', 'Prameha / Madhumeha', 'Polyuria (Prabhuta Mutrata), turbid urine (Avila Mutrata), fatigue, dry throat, excessive thirst', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_sth_08', 'STH-08', 'Sthaulya / Medoroga', 'Unintentional weight gain, lethargy, dyspnea on mild exertion (Kshudra Shwasa), ravenous hunger', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_sgv_09', 'SGV-09', 'Sandhigata Vata (Osteoarthritis)', 'Bilateral or unilateral knee pain on weight-bearing, morning stiffness (<30 mins), crepitus (Sandhisphutana)', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_amv_10', 'AMV-10', 'Amavata (Rheumatoid pattern)', 'Symmetrical joint pain starting in small joints, morning stiffness >1 hr, severe swelling, feeling feverish', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_vtr_11', 'VTR-11', 'Vatarakta (Gouty Arthritis)', 'Acute, severe, burning pain in first metatarsophalangeal joint (great toe), redness, local heat', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_grd_12', 'GRD-12', 'Gridhrasi (Sciatica)', 'Radiating pain from lumbar region to buttocks, posterior thigh, calf, and foot (Toda/Stambha)', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_kts_13', 'KTS-13', 'Kati Shula (Lumbar Spondylosis)', 'Dull aching low back pain aggravated by sitting, stiffness on waking, radiating hip ache', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_grs_14', 'GRS-14', 'Greeva Stambha (Cervical Spondylosis)', 'Stiffness in neck muscles (Manya Stambha), pain radiating to shoulder and arm, tingling in fingers', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_vks_15', 'VKS-15', 'Vataja Kasa (Dry Cough)', 'Dry, irritating paroxysmal cough, chest tightness, throat tickling without sputum', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_kks_16', 'KKS-16', 'Kaphaja Kasa (Productive Cough)', 'Productive cough with copious white/thick sputum, heaviness in chest, sweet taste in mouth', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_tms_17', 'TMS-17', 'Tamaka Shwasa (Bronchial Asthma)', 'Paroxysmal wheezing, breathlessness (Shwasa Kashtata), worse at midnight/early morning and in cloudy weather', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_prt_18', 'PRT-18', 'Vata-Kaphaja Pratishyaya (Allergic Rhinitis)', 'Sneezing bursts on waking (Kshavathu), watery nasal discharge, nasal congestion, frontal headache', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_vch_19', 'VCH-19', 'Vicharchika (Eczema)', 'Itching skin lesions with weeping/oozing (Srava), redness, papules, dry scales', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_ktb_20', 'KTB-20', 'Kitibha Kushtha (Psoriasis pattern)', 'Erythematous plaques covered with silver-white scales, severe scaling, dry pruritus', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_mkd_21', 'MKD-21', 'Mukhadushika (Acne Vulgaris)', 'Inflammatory papules and pustules on face, oily facial skin, pain on palpation', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_shp_22', 'SHP-22', 'Sheetapitta (Urticaria)', 'Sudden onset of red, raised, intensely itchy wheals over the whole body, exacerbated by cold breeze', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_ash_23', 'ASH-23', 'Mutrashmari (Urolithiasis / Kidney Stones)', 'Acute colicky flank pain radiating to groin, dysuria, hematuria, gravel in urine', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_mtk_24', 'MTK-24', 'Mutrakrichhra (UTI / Dysuria)', 'Burning micturition (Daha), increased frequency with scanty output, lower pelvic heaviness', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_and_25', 'AND-25', 'Anidra (Insomnia)', 'Difficulty falling asleep, disturbed sleep pattern, mental fatigue, irritability, body ache', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_ard_26', 'ARD-26', 'Ardhavabhedaka (Migraine)', 'Unilateral throbbing headache, photo/phonophobia, visual aura, nausea, morning onset', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_ctd_27', 'CTD-27', 'Chittodvega (Generalized Anxiety)', 'Constant excessive worry, palpitation, poor concentration, restlessness, trembling', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_namc_jwr_28', 'JWR-28', 'Sannipataja / Vata-Pitta Jwara (Acute Fever)', 'Pyrexia, chills, bitter taste in mouth, thirst, generalized malaise (Angamarda)', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    status = 'ACTIVE',
    updated_at = CURRENT_TIMESTAMP;

-- 2. Populate CCRAS Conditions that have no NAMC code in original source with stable, transparent catalog codes
INSERT INTO diagnosis_catalog (id, code, name, description, status, created_at, updated_at)
VALUES
    ('diag_ccras_pnd', 'CCRAS-PND', 'Pandu (Iron Deficiency Anaemia)', 'Pallor, fatigue, weakness, breathlessness on exertion', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_ccras_hrd', 'CCRAS-HRD', 'Hridroga (Cardiovascular / Anginal discomfort)', 'Chest pain, heaviness, dyslipidaemia, cardiovascular risk', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_ccras_prm', 'CCRAS-PRM', 'Parinamashula (Peptic / Duodenal Ulcer)', 'Epigastric pain, gripping abdominal pain, sour eructation', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_ccras_aps', 'CCRAS-APS', 'Apasmara (Seizure Disorder)', 'Recurrent seizures, transient loss of consciousness, neurological symptoms', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_ccras_shl', 'CCRAS-SHL', 'Shlipada (Filariasis)', 'Leg/foot swelling with fever, lymphadenopathy, chronic elephantiasis', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_ccras_pks', 'CCRAS-PKS', 'Pakshaghata (Hemiplegia / Stroke)', 'Paralysis, unilateral limb weakness, facial deviation, numbness', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_ccras_vyn', 'CCRAS-VYN', 'Vyana Bala Vaishamya (Essential Hypertension)', 'Headache, fatigue, giddiness, insomnia with elevated blood pressure', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('diag_ccras_png', 'CCRAS-PNG', 'Pangu (Paraplegia)', 'Lower limb motor/sensory weakness with bladder/rectal dysfunction', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    status = 'ACTIVE',
    updated_at = CURRENT_TIMESTAMP;

-- 3. Link clinical_references to the authoritative diagnosis_catalog records by NAMC code or exact/partial name match
UPDATE clinical_references
SET diagnosis_id = (
    SELECT d.id FROM diagnosis_catalog d
    WHERE UPPER(d.code) = UPPER(clinical_references.namc_code)
    LIMIT 1
)
WHERE namc_code IS NOT NULL AND diagnosis_id IS NULL;

UPDATE clinical_references
SET diagnosis_id = (
    SELECT d.id FROM diagnosis_catalog d
    WHERE LOWER(d.name) = LOWER(clinical_references.roga_name)
       OR LOWER(d.name) LIKE '%' || LOWER(clinical_references.roga_name) || '%'
       OR LOWER(clinical_references.roga_name) LIKE '%' || LOWER(d.name) || '%'
    LIMIT 1
)
WHERE diagnosis_id IS NULL;

-- 4. Create Indexes for High-Speed Case-Insensitive Diagnosis Catalog Search
CREATE INDEX IF NOT EXISTS idx_diagnosis_catalog_code_upper
    ON diagnosis_catalog(code COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_diagnosis_catalog_name_lower
    ON diagnosis_catalog(name COLLATE NOCASE);
