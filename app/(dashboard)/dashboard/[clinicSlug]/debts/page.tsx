'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { useClinicContext } from '@/lib/useClinicContext';

type AgingRow = {
  patient_id: string;
  invoice_id: string;
  invoice_number: string | null;
  balance_amount: number;
  age_days: number;
  bucket: string;
};

type PatientRow = { id: string; name: string };

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('ar-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(amount);

export default function DebtsPage() {
  const { clinicId, clinicSlug, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();
  const [agingRows, setAgingRows] = useState<AgingRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clinicLoading) return;
    if (!clinicId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const headers = await authHeaders();
        const [agingResponse, patientsResponse] = await Promise.all([
          fetch(`/api/clinic/accounting/aging?clinic_id=${encodeURIComponent(clinicId)}`, { headers }),
          fetch(`/api/patients?clinic_id=${encodeURIComponent(clinicId)}&limit=500`, { headers }),
        ]);
        if (!agingResponse.ok) throw new Error('تعذر تحميل المديونيات المتأخرة');
        const [agingPayload, patientPayload] = await Promise.all([
          agingResponse.json(),
          patientsResponse.ok ? patientsResponse.json() : Promise.resolve([]),
        ]);
        if (cancelled) return;

        const rows = Array.isArray(agingPayload?.data?.rows) ? agingPayload.data.rows : [];
        setAgingRows(rows.filter((row: AgingRow) => Number(row.age_days) > 0 && Number(row.balance_amount) > 0));
        setPatients(Array.isArray(patientPayload) ? patientPayload : []);
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : 'حدث خطأ أثناء تحميل المديونيات');
          setAgingRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authHeaders, clinicId, clinicLoading]);

  const patientNames = useMemo(() => new Map(patients.map((patient) => [patient.id, patient.name])), [patients]);
  const totalOutstanding = agingRows.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);

  return (
    <DashboardSection
      title="المديونيات المتأخرة"
      subtitle="الفواتير ذات الرصيد المستحق بعد تاريخ الاستحقاق، مع رابط مباشر إلى ملف المريض."
    >
      {clinicError || error ? (
        <EmptyState title="تعذر تحميل قائمة المديونيات" description={clinicError ?? error} />
      ) : loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((row) => <Skeleton key={row} className="h-14" />)}
        </div>
      ) : agingRows.length === 0 ? (
        <EmptyState title="لا توجد مديونيات متأخرة" description="لا توجد فواتير متأخرة ذات رصيد مستحق حاليًا." />
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-300">
            إجمالي المتأخرات: <strong className="text-rose-200">{formatMoney(totalOutstanding)}</strong>
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[680px] text-right text-sm">
              <thead className="bg-slate-950/70 text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-3">المريض</th>
                  <th className="px-4 py-3">الفاتورة</th>
                  <th className="px-4 py-3">الرصيد المستحق</th>
                  <th className="px-4 py-3">مدة التأخير</th>
                  <th className="px-4 py-3">سبب التنبيه</th>
                </tr>
              </thead>
              <tbody>
                {agingRows.map((row) => (
                  <tr key={row.invoice_id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/${encodeURIComponent(clinicSlug || 'clinic')}/patients/${encodeURIComponent(row.patient_id)}`}
                        className="font-semibold text-cyan-200 hover:underline"
                      >
                        {patientNames.get(row.patient_id) ?? 'عرض ملف المريض'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.invoice_number || row.invoice_id}</td>
                    <td className="px-4 py-3 font-semibold text-rose-200">{formatMoney(Number(row.balance_amount || 0))}</td>
                    <td className="px-4 py-3">{Number(row.age_days)} يوم</td>
                    <td className="px-4 py-3">الفاتورة تجاوزت تاريخ الاستحقاق وما زال عليها رصيد</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DashboardSection>
  );
}
