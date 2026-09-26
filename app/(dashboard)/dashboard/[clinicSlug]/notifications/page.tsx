import DashboardSection from '@/components/dashboard/DashboardSection';
import NotificationsTabs from '@/components/notifications/NotificationsTabs';

export const metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  return (
    <DashboardSection title="الإشعارات" subtitle="تابع الإشعارات الواردة وأدر قوالب الرسائل.">
      <NotificationsTabs />
    </DashboardSection>
  );
}
