"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  /** Diameter in px. Defaults to the sidebar size. */
  size?: number;
  className?: string;
}

/**
 * The firm's logo — Sri Manikanta Swamy — in a golden ring, with a
 * soft glow and a gentle entrance. Falls back to an "SMS" monogram on
 * the same golden disc until `public/logo.jpg` exists (or if it ever
 * fails to load), so the sidebar never shows a broken image.
 */
export function BrandLogo({ size = 36, className }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      whileHover={{ scale: 1.08 }}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full",
        // Golden ring + warm glow — matches the deity image's palette.
        "ring-2 ring-amber-400/70 shadow-[0_0_14px_rgba(245,158,11,0.35)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <div
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-300 via-amber-500 to-orange-700 font-bold text-white"
          style={{ fontSize: size * 0.34 }}
        >
          SMS
        </div>
      ) : (
        <Image
          src="/logo.jpg"
          alt="Sri Manikanta Swamy Agri Farm"
          fill
          sizes={`${size}px`}
          className="object-cover object-top"
          onError={() => setFailed(true)}
          priority
        />
      )}
    </motion.div>
  );
}
