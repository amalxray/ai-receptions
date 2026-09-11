/**
 * Activity-aware copy (AR) — single source of dashboard terminology.
 *
 * A dental clinic, an imaging center and a dental lab are different
 * businesses; fixed Dental wording (or generic "clinic") confuses users.
 * Every text that varies by activity goes through `getActivityLabels`.
 */

export type ActivityLabels = {
  /** Long dashboard brand title. */
  dashboardTitle: string;
  /** One-line dashboard description. */
  dashboardSubtitle: string;
  /** Overview section heading. */
  overviewTitle: string;
  /** Overview section subtitle line. */
  overviewSubtitle: string;
  /** Card: items today. */
  appointmentsToday: string;
  /** Card: upcoming items. */
  appointmentsUpcoming: string;
  /** Provider role plural (docs/lab techs/radiology techs). */
  providers: string;
  /** Service catalog label. */
  services: string;
  /** Short entity name (registration labels, switch labels). */
  entityName: string;
};

const CLINIC_LABELS: ActivityLabels = {
  dashboardTitle: 'موظفة استقبال الأسنان الذكية',
  dashboardSubtitle: 'إدارة المواعيد والمرضى والعلاجات والذكاء المالي',
  overviewTitle: 'نظرة مباشرة على عمليات العيادة',
  overviewSubtitle: 'أبرز مؤشرات العيادة من البيانات الفعلية.',
  appointmentsToday: 'مواعيد اليوم',
  appointmentsUpcoming: 'المواعيد القادمة',
  providers: 'الأطباء',
  services: 'الخدمات',
  entityName: 'العيادة',
};

const IMAGING_LABELS: ActivityLabels = {
  dashboardTitle: 'موظفة استقبال مركز التصوير الذكية',
  dashboardSubtitle: 'إدارة طلبات الأشعة والمواعيد والمرضى والذكاء المالي',
  overviewTitle: 'نظرة مباشرة على عمليات مركز التصوير',
  overviewSubtitle: 'أبرز مؤشرات مركز التصوير من البيانات الفعلية.',
  appointmentsToday: 'تصوير اليوم',
  appointmentsUpcoming: 'التصوير القادم',
  providers: 'الفنيون',
  services: 'خدمات التصوير',
  entityName: 'مركز التصوير',
};

const DENTAL_LAB_LABELS: ActivityLabels = {
  dashboardTitle: 'موظفة استقبال المختبر الذكية',
  dashboardSubtitle: 'إدارة حالات المختبر والمواعيد والمرضى والذكاء المالي',
  overviewTitle: 'نظرة مباشرة على عمليات المختبر',
  overviewSubtitle: 'أبرز مؤشرات المختبر من البيانات الفعلية.',
  appointmentsToday: 'حالات اليوم',
  appointmentsUpcoming: 'الحالات القادمة',
  providers: 'الفنيون',
  services: 'خدمات المختبر',
  entityName: 'المختبر',
};

export function getActivityLabels(activityType?: string | null): ActivityLabels {
  switch (activityType) {
    case 'imaging_center':
      return IMAGING_LABELS;
    case 'dental_lab':
      return DENTAL_LAB_LABELS;
    case 'clinic':
    default:
      return CLINIC_LABELS;
  }
}