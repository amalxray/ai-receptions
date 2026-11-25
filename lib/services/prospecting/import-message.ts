type ProspectImportCounts = {
  inserted: number;
  skippedDuplicates: number;
  skippedInvalid: number;
};

export function createProspectImportMessage({
  inserted,
  skippedDuplicates,
  skippedInvalid,
}: ProspectImportCounts): string {
  if (inserted > 0) return `أُضيفت ${inserted} عيادة جديدة`;
  if (skippedDuplicates > 0 && skippedInvalid > 0) {
    return `جميع العيادات المؤهلة (${skippedDuplicates}) موجودة مسبقاً؛ واستُبعدت ${skippedInvalid} نتيجة لا تطابق معايير الجودة.`;
  }
  if (skippedDuplicates > 0) return `جميع العيادات (${skippedDuplicates}) موجودة مسبقاً`;
  if (skippedInvalid > 0) return `تم استبعاد ${skippedInvalid} (لا تطابق معايير الجودة)`;
  return 'لم يتم العثور على عيادات مطابقة لمعايير الجودة.';
}
