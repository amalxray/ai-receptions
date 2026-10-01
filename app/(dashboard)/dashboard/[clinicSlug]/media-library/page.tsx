import DashboardSection from '@/components/dashboard/DashboardSection';
import ClinicMediaLibrary from '@/components/dashboard/clinic/ClinicMediaLibrary';

export default function MediaLibraryPage() {
  return (
    <DashboardSection
      title="مكتبة الصور"
      subtitle="إدارة الصور العامة للعيادة، مع البحث، الرفع، والاختيار الفوري في الإعلانات."
    >
      <ClinicMediaLibrary mode="manage" />
    </DashboardSection>
  );
}
