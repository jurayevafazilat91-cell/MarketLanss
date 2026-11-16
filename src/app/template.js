"use client";

import { motion } from "motion/react";

// Remounts on every route change, so each page's content eases in instead of snapping.
export default function Template({ children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
      {children}
    </motion.div>
  );
}
