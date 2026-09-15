'use client';

/**
 * MORPHING DIALOG — trigger-based expanding viewer (motion-primitives style).
 * Built on framer-motion shared-layout: the trigger container and the open
 * dialog share a layoutId, so the dialog visually grows out of the trigger
 * and shrinks back into it on close.
 *
 * Composable subcomponents (one dialog per trigger):
 *   <MorphingDialog>              — state + transition scope
 *     <MorphingDialogTrigger>     — clickable thumbnail (stays mounted)
 *     <MorphingDialogContainer>   — fixed overlay (AnimatePresence)
 *       <MorphingDialogContent>   — morphing card
 *         <MorphingDialogImage/>  — morphing <img>
 *         <MorphingDialogTitle/Subtitle/Body/Footer/>
 *         <MorphingDialogClose/>  — close button (defaults to ×)
 *
 * Accessibility: trigger is keyboard operable (Enter/Space), overlay closes
 * on backdrop click, close button is labelled. RTL-neutral.
 */

import {
  createContext,
  useContext,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  type Transition,
} from 'framer-motion';

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 26,
  mass: 0.9,
};

type MorphingDialogContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  uniqueId: string;
  transition: Transition;
};

const MorphingDialogContext = createContext<MorphingDialogContextValue | null>(null);

function useMorphingDialog(): MorphingDialogContextValue {
  const ctx = useContext(MorphingDialogContext);
  if (!ctx) {
    throw new Error('MorphingDialog subcomponents must be used inside <MorphingDialog>');
  }
  return ctx;
}

export function MorphingDialog({
  children,
  transition,
}: {
  children: ReactNode;
  transition?: Transition;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // useId contains ':' which breaks framer-motion layoutId targets.
  const uniqueId = useId().replace(/:/g, '');
  return (
    <MorphingDialogContext.Provider
      value={{ isOpen, setIsOpen, uniqueId, transition: transition ?? DEFAULT_TRANSITION }}
    >
      <MotionConfig transition={transition ?? DEFAULT_TRANSITION}>{children}</MotionConfig>
    </MorphingDialogContext.Provider>
  );
}

export function MorphingDialogTrigger({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { setIsOpen, uniqueId, transition } = useMorphingDialog();
  return (
    <motion.div
      layoutId={`morphing-dialog-${uniqueId}`}
      transition={transition}
      role="button"
      tabIndex={0}
      aria-label="فتح العارض"
      onClick={() => setIsOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsOpen(true);
        }
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

export function MorphingDialogContainer({ children }: { children: ReactNode }) {
  const { isOpen, setIsOpen } = useMorphingDialog();
  return (
    <AnimatePresence initial={false} mode="sync">
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOpen(false)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MorphingDialogContent({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { uniqueId, transition } = useMorphingDialog();
  return (
    <motion.div
      layoutId={`morphing-dialog-${uniqueId}`}
      transition={transition}
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

export function MorphingDialogImage({
  src,
  alt,
  className,
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { uniqueId, transition } = useMorphingDialog();
  return (
    <motion.img
      layoutId={`morphing-dialog-image-${uniqueId}`}
      transition={transition}
      src={src}
      alt={alt}
      className={className}
      style={style}
    />
  );
}

export function MorphingDialogTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { uniqueId, transition } = useMorphingDialog();
  return (
    <motion.h3 layoutId={`morphing-dialog-title-${uniqueId}`} transition={transition} className={className}>
      {children}
    </motion.h3>
  );
}

export function MorphingDialogSubtitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { uniqueId, transition } = useMorphingDialog();
  return (
    <motion.p layoutId={`morphing-dialog-subtitle-${uniqueId}`} transition={transition} className={className}>
      {children}
    </motion.p>
  );
}

export function MorphingDialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-y-auto ${className ?? ''}`}>{children}</div>;
}

export function MorphingDialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-3 ${className ?? ''}`}>{children}</div>;
}

export function MorphingDialogClose({ children, className }: { children?: ReactNode; className?: string }) {
  const { setIsOpen } = useMorphingDialog();
  return (
    <motion.button
      type="button"
      aria-label="إغلاق"
      onClick={() => setIsOpen(false)}
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {children ?? '×'}
    </motion.button>
  );
}