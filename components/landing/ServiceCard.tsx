import styles from './services-grid.module.css';
import type { ServiceCardContent } from '@/lib/landing/services-content';

const ICONS: Record<string, JSX.Element> = {
  headset: (
    <>
      <path d="M3 13v-1a9 9 0 0 1 18 0v1" />
      <path d="M5 13h2v6H6a3 3 0 0 1-3-3v-1a2 2 0 0 1 2-2Zm14 0h-2v6h1a3 3 0 0 0 3-3v-1a2 2 0 0 0-2-2Z" />
      <path d="M17 19a4 4 0 0 1-4 3h-2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </>
  ),
  message: (
    <>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
      <path d="M8 12h8M8 9h5M8 15h6" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
    </>
  ),
  scan: (
    <>
      <path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" />
      <path d="M8 12h8M12 8v8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" />
      <path d="M4 7h14a2 2 0 0 1 2 2v2h-5a2 2 0 0 0 0 4h5v2M15 13h.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
      <path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14ZM5 2l.8 2.2L8 5l-2.2.8L5 8l-.8-2.2L2 5l2.2-.8L5 2Z" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18M8 15l4-4 4 3 5-7" />
      <path d="M17 7h4v4" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
};

type ServiceCardProps = ServiceCardContent & { index: number; onSelect: () => void };

export default function ServiceCard({ title, description, category, icon, image_url, index, onSelect }: ServiceCardProps) {
  return (
    <article
      className={styles.card}
      style={{ '--i': index } as React.CSSProperties}
    >
      {image_url ? (
        <img className={styles.cardImage} src={image_url} alt={title} loading="lazy" />
      ) : (
        <span className={styles.iconChip} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[icon] ?? ICONS.sparkles}
          </svg>
        </span>
      )}
      <span className={styles.category}>{category}</span>
      <span className={styles.title}>{title}</span>
      <span className={styles.description}>{description}</span>
      <button type="button" className={`${styles.linkText} ${styles.moreButton}`} onClick={onSelect}>
        اكتشف المزيد
        <svg className={styles.arrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </article>
  );
}
