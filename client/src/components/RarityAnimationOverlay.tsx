import { motion } from "framer-motion";
import type { RarityTier } from "@shared/schema";
import { RARITY_TIERS } from "@shared/schema";
import { useEffect, useState } from "react";

interface RarityAnimationOverlayProps {
  rarity: RarityTier;
  isActive: boolean;
  onComplete?: () => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const rarityConfig = {
  COMMON: {
    duration: 0,
    tintColor: "transparent",
    shakeIntensity: 0,
    particles: 0,
    glow: false,
    rainbow: false,
  },
  UNCOMMON: {
    duration: 1.5,
    tintColor: hexToRgba(RARITY_TIERS.UNCOMMON.color, 0.2),
    shakeIntensity: 5,
    particles: 5,
    glow: false,
    rainbow: false,
  },
  RARE: {
    duration: 2.0,
    tintColor: hexToRgba(RARITY_TIERS.RARE.color, 0.25),
    shakeIntensity: 8,
    particles: 10,
    glow: true,
    rainbow: false,
  },
  ULTRA_RARE: {
    duration: 4.0,
    tintColor: hexToRgba(RARITY_TIERS.ULTRA_RARE.color, 0.45),
    shakeIntensity: 25,
    particles: 60,
    glow: true,
    rainbow: false,
  },
  EPIC: {
    duration: 2.5,
    tintColor: hexToRgba(RARITY_TIERS.EPIC.color, 0.3),
    shakeIntensity: 12,
    particles: 15,
    glow: true,
    rainbow: false,
  },
  ULTRA_EPIC: {
    duration: 3.0,
    tintColor: hexToRgba(RARITY_TIERS.ULTRA_EPIC.color, 0.35),
    shakeIntensity: 15,
    particles: 25,
    glow: true,
    rainbow: false,
  },
  MYTHIC: {
    duration: 3.5,
    tintColor: hexToRgba(RARITY_TIERS.MYTHIC.color, 0.4),
    shakeIntensity: 20,
    particles: 40,
    glow: true,
    rainbow: false,
  },
  INSANE: {
    duration: 5.0,
    tintColor: "transparent",
    shakeIntensity: 30,
    particles: 100,
    glow: true,
    rainbow: true,
  },
};

export function RarityAnimationOverlay({ rarity, isActive, onComplete }: RarityAnimationOverlayProps) {
  if (rarity === "COMMON") {
    if (isActive && onComplete) {
      onComplete();
    }
    return null;
  }

  const config = rarityConfig[rarity];
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; size: number; delay: number }>>([]);

  useEffect(() => {
    if (isActive && config.particles > 0) {
      const newParticles = Array.from({ length: config.particles }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 20 + 10,
        delay: Math.random() * 0.5,
      }));
      setParticles(newParticles);
    }

    if (isActive && onComplete) {
      const timer = setTimeout(() => {
        onComplete();
      }, config.duration * 1000);
      return () => clearTimeout(timer);
    }
  }, [isActive, config.duration, config.particles, onComplete]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Screen shake container */}
      <motion.div
        className="absolute inset-0"
        animate={{
          x: isActive ? [0, -config.shakeIntensity, config.shakeIntensity, -config.shakeIntensity, config.shakeIntensity, 0] : 0,
          y: isActive ? [0, config.shakeIntensity, -config.shakeIntensity, config.shakeIntensity, -config.shakeIntensity, 0] : 0,
        }}
        transition={{
          duration: 0.5,
          repeat: Math.floor(config.duration * 2),
          ease: "easeInOut",
        }}
      >
        {/* Color tint overlay */}
        {!config.rainbow && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: config.duration, times: [0, 0.1, 0.7, 1] }}
            style={{ backgroundColor: config.tintColor }}
          />
        )}

        {/* Rainbow gradient for INSANE */}
        {config.rainbow && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: [0, 0.6, 0.6, 0],
              background: [
                "linear-gradient(45deg, rgba(255,0,0,0.4) 0%, rgba(255,154,0,0.4) 10%, rgba(208,222,33,0.4) 20%, rgba(79,220,74,0.4) 30%, rgba(63,218,216,0.4) 40%, rgba(47,201,226,0.4) 50%, rgba(28,127,238,0.4) 60%, rgba(95,21,242,0.4) 70%, rgba(186,12,248,0.4) 80%, rgba(251,7,217,0.4) 90%, rgba(255,0,0,0.4) 100%)",
                "linear-gradient(135deg, rgba(255,0,0,0.4) 0%, rgba(255,154,0,0.4) 10%, rgba(208,222,33,0.4) 20%, rgba(79,220,74,0.4) 30%, rgba(63,218,216,0.4) 40%, rgba(47,201,226,0.4) 50%, rgba(28,127,238,0.4) 60%, rgba(95,21,242,0.4) 70%, rgba(186,12,248,0.4) 80%, rgba(251,7,217,0.4) 90%, rgba(255,0,0,0.4) 100%)",
                "linear-gradient(225deg, rgba(255,0,0,0.4) 0%, rgba(255,154,0,0.4) 10%, rgba(208,222,33,0.4) 20%, rgba(79,220,74,0.4) 30%, rgba(63,218,216,0.4) 40%, rgba(47,201,226,0.4) 50%, rgba(28,127,238,0.4) 60%, rgba(95,21,242,0.4) 70%, rgba(186,12,248,0.4) 80%, rgba(251,7,217,0.4) 90%, rgba(255,0,0,0.4) 100%)",
                "linear-gradient(315deg, rgba(255,0,0,0.4) 0%, rgba(255,154,0,0.4) 10%, rgba(208,222,33,0.4) 20%, rgba(79,220,74,0.4) 30%, rgba(63,218,216,0.4) 40%, rgba(47,201,226,0.4) 50%, rgba(28,127,238,0.4) 60%, rgba(95,21,242,0.4) 70%, rgba(186,12,248,0.4) 80%, rgba(251,7,217,0.4) 90%, rgba(255,0,0,0.4) 100%)",
              ]
            }}
            transition={{ duration: config.duration, times: [0, 0.1, 0.7, 1] }}
          />
        )}

        {/* Glow pulse for higher rarities */}
        {config.glow && (
          <motion.div
            className="absolute inset-0"
            animate={{
              boxShadow: [
                "inset 0 0 0px rgba(255, 255, 255, 0)",
                `inset 0 0 ${config.shakeIntensity * 3}px rgba(255, 255, 255, 0.3)`,
                "inset 0 0 0px rgba(255, 255, 255, 0)",
              ],
            }}
            transition={{ duration: 0.5, repeat: Math.floor(config.duration * 2) }}
          />
        )}
      </motion.div>

      {/* Particle effects */}
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            background: config.rainbow
              ? `radial-gradient(circle, rgba(255, ${Math.random() * 255}, ${Math.random() * 255}, 0.8) 0%, transparent 70%)`
              : `radial-gradient(circle, ${config.tintColor.replace("0.15", "0.8").replace("0.2", "0.8").replace("0.25", "0.8").replace("0.3", "0.8").replace("0.35", "0.8").replace("0.4", "0.8").replace("0.45", "0.8")} 0%, transparent 70%)`,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1.5, 0],
            opacity: [0, 1, 0],
            y: [0, -100],
          }}
          transition={{
            duration: config.duration * 0.6,
            delay: particle.delay,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Radial burst for high rarities */}
      {(rarity === "ULTRA_RARE" || rarity === "INSANE") && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: config.duration * 0.3, times: [0, 0.5, 1] }}
        >
          <motion.div
            className="rounded-full"
            style={{
              background: config.rainbow
                ? "conic-gradient(from 0deg, #ff0000, #ff9a00, #d0de21, #4fdc4a, #3fdad8, #2fc9e2, #1c7fee, #5f15f2, #ba0cf8, #fb07d9, #ff0000)"
                : config.tintColor,
            }}
            initial={{ width: 0, height: 0, opacity: 0.8 }}
            animate={{
              width: ["0px", "200vmax", "200vmax"],
              height: ["0px", "200vmax", "200vmax"],
              opacity: [0.8, 0.3, 0],
            }}
            transition={{ duration: config.duration, times: [0, 0.5, 1] }}
          />
        </motion.div>
      )}

      {/* Extra rotation effect for INSANE */}
      {rarity === "INSANE" && (
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: [0, 5, -5, 5, -5, 0] }}
          transition={{ duration: 0.4, repeat: Math.floor(config.duration * 2.5) }}
        />
      )}
    </div>
  );
}
