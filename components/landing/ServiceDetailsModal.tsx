'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { ServiceCardContent } from '@/lib/landing/services-content';
import styles from './service-details-modal.module.css';

type Props = {
  service: ServiceCardContent;
  onClose: () => void;
};

export default function ServiceDetailsModal({ service, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-details-title"
      aria-describedby="service-details-description"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.dialog} dir="rtl">
        <button ref={closeButtonRef} type="button" className={styles.closeButton} onClick={onClose} aria-label="إغلاق تفاصيل الخدمة">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m18 6-12 12M6 6l12 12" />
          </svg>
        </button>

        <p className={styles.category}>{service.category}</p>
        <h2 id="service-details-title" className={styles.title}>{service.title}</h2>
        <p id="service-details-description" className={styles.description}>{service.description}</p>
        {service.image_url && <img className={styles.image} src={service.image_url} alt={service.title} />}
        <p className={styles.details}>{service.details}</p>

        <div className={styles.actions}>
          <Link href="/register" className={styles.startButton}>ابدأ الآن</Link>
          <button type="button" className={styles.continueButton} onClick={onClose}>متابعة التصفح</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
