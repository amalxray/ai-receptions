'use client';

import { motion } from 'framer-motion';
import type { PublicReviewItem } from '@/lib/services/reviewsService';
import PatientReviewCard from './PatientReviewCard';

export default function PatientReviewList({ reviews }: { reviews: PublicReviewItem[] }) {
  return (
    <motion.ul
      className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      aria-label="آخر التقييمات"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
    >
      {reviews.map((review) => (
        <PatientReviewCard key={review.id} review={review} />
      ))}
    </motion.ul>
  );
}
