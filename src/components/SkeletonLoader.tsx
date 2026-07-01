import React from "react";
import { motion } from "motion/react";

interface SkeletonLoaderProps {
  key?: React.Key;
  size?: "small" | "large";
}

export default function SkeletonLoader({ size = "large" }: SkeletonLoaderProps) {
  if (size === "small") {
    return (
      <div className="w-full p-3 bg-brand-secondary border border-brand-border rounded-xl shadow-xs animate-pulse flex items-center gap-3">
        <div className="w-12 h-4 bg-neutral-200 dark:bg-neutral-800 rounded-md"></div>
        <div className="flex-1 h-4 bg-neutral-100 dark:bg-neutral-900 rounded-md"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="w-full p-5 bg-brand-secondary border border-brand-border rounded-2xl shadow-xs animate-pulse"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex justify-between items-start gap-4 flex-wrap sm:flex-nowrap">
        <div className="flex-1 min-w-0 flex items-start gap-3">
          <div className="w-4 h-4 mt-1 rounded-sm bg-neutral-200 dark:bg-neutral-800 shrink-0"></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-16 h-4 bg-neutral-200 dark:bg-neutral-800 rounded-full"></div>
              <div className="w-24 h-4 bg-neutral-100 dark:bg-neutral-900 rounded-md"></div>
            </div>
            <div className="w-3/4 h-6 bg-neutral-200 dark:bg-neutral-800 rounded-md mb-2"></div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-16 h-8 bg-neutral-100 dark:bg-neutral-900 rounded-xl"></div>
          <div className="w-16 h-8 bg-neutral-100 dark:bg-neutral-900 rounded-xl"></div>
        </div>
      </div>
      <div className="space-y-2 mt-4">
        <div className="w-full h-3 bg-neutral-100 dark:bg-neutral-900 rounded-md"></div>
        <div className="w-5/6 h-3 bg-neutral-100 dark:bg-neutral-900 rounded-md"></div>
        <div className="w-4/6 h-3 bg-neutral-100 dark:bg-neutral-900 rounded-md"></div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-brand-border/40 pt-4">
        <div className="w-24 h-8 bg-neutral-100 dark:bg-neutral-900 rounded-lg"></div>
        <div className="w-24 h-8 bg-neutral-100 dark:bg-neutral-900 rounded-lg"></div>
      </div>
    </motion.div>
  );
}
