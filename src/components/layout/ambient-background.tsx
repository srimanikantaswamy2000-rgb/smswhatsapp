"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Ambient dashboard backdrop: three soft radial blobs in the brand's
 * palette (temple gold, marigold, paddy green) drifting very slowly
 * behind the content, plus a faint dot grid for texture. Sits fixed
 * behind everything (`z-0` + content at `z-10`), never intercepts
 * pointer events, and freezes for users who prefer reduced motion.
 *
 * Opacities are deliberately low — cards stay perfectly readable in
 * both light and dark themes; the blobs only tint the empty canvas.
 */
export function AmbientBackground() {
  const reduceMotion = useReducedMotion();

  const drift = (dx: number, dy: number, duration: number) =>
    reduceMotion
      ? {}
      : {
          animate: { x: [0, dx, 0], y: [0, dy, 0] },
          transition: {
            duration,
            repeat: Infinity,
            ease: "easeInOut" as const,
          },
        };

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Temple gold — upper left, the dominant tone. */}
      <motion.div
        {...drift(60, 40, 26)}
        className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-amber-400/15 blur-3xl dark:bg-amber-500/10"
      />
      {/* Marigold / saffron — right edge. */}
      <motion.div
        {...drift(-50, 60, 32)}
        className="absolute -right-48 top-1/4 h-[30rem] w-[30rem] rounded-full bg-orange-400/10 blur-3xl dark:bg-orange-500/8"
      />
      {/* Paddy green — bottom, grounding the agri theme. */}
      <motion.div
        {...drift(40, -50, 38)}
        className="absolute -bottom-48 left-1/4 h-[32rem] w-[32rem] rounded-full bg-emerald-400/10 blur-3xl dark:bg-emerald-500/8"
      />
      {/* Faint dot grid so large empty areas don't feel flat. */}
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.25]"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in oklab, var(--foreground) 7%, transparent) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
    </div>
  );
}
