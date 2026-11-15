const basePanoramaClassTranslations: Record<string, string> = {
  caries: 'تسوس',
  crown: 'تاج',
  filling: 'حشوة',
  implant: 'زرعة',
  root_canal_treatment: 'علاج عصب',
  bone_loss: 'فقدان عظم',
  root_piece: 'شظية جذر',
  impacted_tooth: 'سن مطمور',
  periapical_lesion: 'آفة حول القمة',
  cyst: 'كيس',
  fracture_teeth: 'كسر أسنان',
  malaligned: 'سوء إطباق',
  maxillary_sinus: 'جيب الفك العلوي',
  retained_root: 'جذر متبقي',
  root_resorption: 'امتصاص الجذر',
  supra_eruption: 'بزوغ فوقي',
  tad: 'جهاز تثبيت',
  abutment: 'دعامة زرعة',
  attrition: 'تآكل الأسنان',
  bone_defect: 'عيب عظمي',
  gingival_former: 'مشكل لثة',
  metal_band: 'شريط معدني',
  orthodontic_brackets: 'تقويم أسنان',
  permanent_retainer: 'مثبت دائم',
  plating: 'صفيحة معدنية',
  post_core: 'وتد ولب',
  wire: 'سلك',
  permanent_teeth: 'أسنان دائمة',
  primary_teeth: 'أسنان لبنية',
  missing_teeth: 'أسنان مفقودة',
  mandibular_canal: 'قناة الفك السفلي',
  inferior_alveolar_nerve: 'العصب السنخي السفلي',
  mental_foramen: 'الثقبة الذقنية',
  proximal_dental_caries: 'تسوس سطحي',
  pulp_canal_obliteration: 'انسداد قناة اللب',
  pulpectomy_chamber: 'استئصال لب الغرفة',
  root_caries: 'تسوس الجذر',
  space_maintainer: 'حافظ مسافة',
  taurodontism: 'أسنان طويلة الجذور',
  temporary_restoration: 'حشوة مؤقتة',
};

// Keep the legacy model names addressable as direct dictionary keys as well as
// through normalization in getClassLabel().
export const panoramaClassTranslations: Record<string, string> = {
  ...basePanoramaClassTranslations,
  ...Object.fromEntries(
    Object.entries(basePanoramaClassTranslations).map(([name, label]) => [
      `dental_disease_${name}`,
      label,
    ]),
  ),
};

/** The 83 model labels from the combined YOLO data.yaml, including legacy aliases. */
export const panoramaClassNames = [
  'bone_loss', 'caries', 'crown', 'cyst', 'filling', 'fracture_teeth', 'implant',
  'malaligned', 'mandibular_canal', 'missing_teeth', 'periapical_lesion',
  'permanent_teeth', 'primary_teeth', 'retained_root', 'root_canal_treatment',
  'root_piece', 'root_resorption', 'supra_eruption', 'tad', 'abutment', 'attrition',
  'bone_defect', 'gingival_former', 'impacted_tooth', 'maxillary_sinus', 'metal_band',
  'orthodontic_brackets', 'permanent_retainer', 'plating', 'post_core', 'wire',
  'amalgam_restoration', 'composite_restoration', 'dental_caries', 'dental_crown',
  'dental_implant', 'endodontic_post', 'endodontic_treatment', 'fractured_tooth',
  'inferior_alveolar_nerve', 'interdental_bone_loss', 'mental_foramen',
  'orthodontic_retainer_wire', 'permenant_tooth_bud', 'primary_tooth',
  'proximal_dental_caries', 'pulp_canal_obliteration', 'pulpectomy_chamber',
  'root_caries', 'space_maintainer', 'taurodontism', 'temporary_restoration',
  'dental_disease_caries', 'dental_disease_crown', 'dental_disease_filling',
  'dental_disease_implant', 'dental_disease_malaligned',
  'dental_disease_mandibular_canal', 'dental_disease_missing_teeth',
  'dental_disease_periapical_lesion', 'dental_disease_retained_root',
  'dental_disease_root_canal_treatment', 'dental_disease_root_piece',
  'dental_disease_impacted_tooth', 'dental_disease_maxillary_sinus',
  'dental_disease_bone_loss', 'dental_disease_fracture_teeth',
  'dental_disease_permanent_teeth', 'dental_disease_supra_eruption',
  'dental_disease_tad', 'dental_disease_abutment', 'dental_disease_attrition',
  'dental_disease_bone_defect', 'dental_disease_gingival_former',
  'dental_disease_metal_band', 'dental_disease_orthodontic_brackets',
  'dental_disease_permanent_retainer', 'dental_disease_post_core',
  'dental_disease_plating', 'dental_disease_wire', 'dental_disease_cyst',
  'dental_disease_root_resorption', 'dental_disease_primary_teeth',
] as const;

function normalizeClassName(className: string): string {
  return className
    .trim()
    .replace(/^dental_disease_/i, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function getClassLabel(className: string): string {
  const rawName = className.trim();
  return panoramaClassTranslations[rawName] ??
    panoramaClassTranslations[normalizeClassName(rawName)] ??
    className;
}
