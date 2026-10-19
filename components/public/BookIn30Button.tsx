'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, ArrowLeft } from 'lucide-react';
import BookIn30Modal from './BookIn30Modal';

interface Props {
  clinicId: string;
}

export default function BookIn30Button({ clinicId }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
        animate={{ boxShadow: [
          '0 0 20px rgba(34,211,238,0.4)',
          '0 0 40px rgba(34,211,238,0.7)',
          '0 0 20px rgba(34,211,238,0.4)',
        ]}}
        transition={{ boxShadow: { duration: 2, repeat: Infinity } }}
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-l from-cyan-500 via-cyan-400 to-emerald-500 px-10 py-5 text-lg font-black text-slate-950 shadow-2xl mx-auto mt-8"
      >
        <Zap className="h-6 w-6" />
        احجز في 30 ثانية
        <ArrowLeft className="h-5 w-5" />
      </motion.button>
      <BookIn30Modal
        clinicId={clinicId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
