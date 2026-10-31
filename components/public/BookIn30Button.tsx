'use client';

import { useState } from 'react';
import { Zap, ArrowLeft } from 'lucide-react';
import BookIn30Modal from './BookIn30Modal';
import type { ActivityPublicSpace } from '@/lib/services/activityPublicSpace';

interface Props {
  clinicId: string;
  serviceId: string;
  serviceName: string;
  activityType: ActivityPublicSpace['activityType'];
}

export default function BookIn30Button({ clinicId, serviceId, serviceName, activityType }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="mx-auto mt-8 inline-flex items-center gap-3 rounded-2xl bg-gradient-to-l from-cyan-500 via-cyan-400 to-emerald-500 px-6 py-3 text-base font-black text-slate-950 shadow-xl transition hover:brightness-110 active:scale-[0.98]"
      >
        <Zap className="h-6 w-6" />
        احجز الآن
        <ArrowLeft className="h-5 w-5" />
      </button>
      <BookIn30Modal
        clinicId={clinicId}
        serviceId={serviceId}
        serviceName={serviceName}
        activityType={activityType}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
