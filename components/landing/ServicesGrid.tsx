'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SERVICES, type ServiceCardContent } from '@/lib/landing/services-content';
import ServiceCard from './ServiceCard';
import ServiceDetailsModal from './ServiceDetailsModal';
import styles from './services-grid.module.css';

type Props = { initialServices?: ServiceCardContent[] };

export default function ServicesGrid({ initialServices = DEFAULT_SERVICES }: Props) {
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [displayedCategory, setDisplayedCategory] = useState('الكل');
  const [isFiltering, setIsFiltering] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceCardContent | null>(null);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeModal = useCallback(() => setSelectedService(null), []);

  useEffect(() => () => {
    if (filterTimer.current) clearTimeout(filterTimer.current);
  }, []);

  const selectCategory = (category: string) => {
    if (category === selectedCategory) return;
    setSelectedCategory(category);

    if (filterTimer.current) clearTimeout(filterTimer.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayedCategory(category);
      setIsFiltering(false);
      return;
    }

    setIsFiltering(true);
    filterTimer.current = setTimeout(() => {
      setDisplayedCategory(category);
      setIsFiltering(false);
    }, 250);
  };

  const categories = ['الكل', ...Array.from(new Set(initialServices.map((service) => service.category)))];
  const visibleServices = initialServices.filter((service) => displayedCategory === 'الكل' || service.category === displayedCategory);

  return (
    <section className={styles.section} dir="rtl" aria-labelledby="services-title">
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>حلول متكاملة لعيادتك</p>
          <h2 id="services-title" className={styles.heading}>خدمات تجعل إدارة العيادة أسهل</h2>
          <p className={styles.intro}>من استقبال المرضى إلى متابعة الأداء، كل ما تحتاجه عيادتك في مكان واحد.</p>
        </header>

        <div className={styles.filters} role="group" aria-label="فلترة الخدمات حسب التصنيف">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`${styles.filterButton} ${selectedCategory === category ? styles.filterButtonActive : ''}`}
              aria-pressed={selectedCategory === category}
              onClick={() => selectCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        <div className={`${styles.grid} ${isFiltering ? styles.gridFiltering : ''}`} aria-live="polite">
          {visibleServices.map((service, index) => (
            <ServiceCard
              key={`${displayedCategory}-${service.title}`}
              title={service.title}
              description={service.description}
              category={service.category}
              icon={service.icon}
              image_url={service.image_url}
              details={service.details}
              index={index}
              onSelect={() => setSelectedService(service)}
            />
          ))}
        </div>
      </div>
      {selectedService && <ServiceDetailsModal service={selectedService} onClose={closeModal} />}
    </section>
  );
}
