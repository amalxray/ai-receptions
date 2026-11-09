'use client';

import { motion } from 'framer-motion';
import { Facebook, MessageCircle, Share2, Twitter } from 'lucide-react';

const itemVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.25, ease: 'easeOut' as const },
  },
};

const buttonClass =
  'group relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/90 backdrop-blur-md transition-colors hover:border-amber-300/50 hover:bg-white/20 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';

function Tooltip({ children }: { children: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950/90 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

export default function SocialShareBar() {
  const getPageDetails = () => ({
    url: window.location.href,
    title: document.title,
  });

  const sharePage = async () => {
    const { url, title } = getPageDetails();
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Unable to share or copy the current page URL.', error);
    }
  };

  const openShareWindow = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div
      role="group"
      aria-label="مشاركة صفحة المركز"
      className="mx-auto mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 p-2 backdrop-blur-md"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
    >
      <motion.button
        type="button"
        aria-label="مشاركة"
        title="مشاركة"
        className={buttonClass}
        variants={itemVariants}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => void sharePage()}
      >
        <Share2 aria-hidden="true" className="h-[18px] w-[18px]" />
        <Tooltip>مشاركة</Tooltip>
      </motion.button>
      <motion.button
        type="button"
        aria-label="واتساب"
        title="واتساب"
        className={buttonClass}
        variants={itemVariants}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          const { url } = getPageDetails();
          openShareWindow(`https://wa.me/?text=${encodeURIComponent(url)}`);
        }}
      >
        <MessageCircle aria-hidden="true" className="h-[18px] w-[18px]" />
        <Tooltip>واتساب</Tooltip>
      </motion.button>
      <motion.button
        type="button"
        aria-label="فيسبوك"
        title="فيسبوك"
        className={buttonClass}
        variants={itemVariants}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          const { url } = getPageDetails();
          openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
        }}
      >
        <Facebook aria-hidden="true" className="h-[18px] w-[18px]" />
        <Tooltip>فيسبوك</Tooltip>
      </motion.button>
      <motion.button
        type="button"
        aria-label="X"
        title="X"
        className={buttonClass}
        variants={itemVariants}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          const { url, title } = getPageDetails();
          openShareWindow(
            `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`
          );
        }}
      >
        <Twitter aria-hidden="true" className="h-[18px] w-[18px]" />
        <Tooltip>X</Tooltip>
      </motion.button>
    </motion.div>
  );
}
