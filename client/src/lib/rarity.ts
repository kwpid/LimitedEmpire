import { RARITY_TIERS, type RarityTier } from "@shared/schema";

export function getRarityColor(rarity: RarityTier): string {
  const tier = RARITY_TIERS[rarity];
  return tier.color;
}

export function getRarityClass(rarity: RarityTier): string {
  const map: Record<RarityTier, string> = {
    COMMON: "border-rarity-common",
    UNCOMMON: "border-rarity-uncommon",
    RARE: "border-rarity-rare",
    ULTRA_RARE: "border-rarity-ultra-rare",
    EPIC: "border-rarity-epic",
    ULTRA_EPIC: "border-rarity-ultra-epic",
    MYTHIC: "border-rarity-mythic",
    INSANE: "border-transparent animate-rainbow",
  };
  return map[rarity];
}

export function getRarityGlow(rarity: RarityTier): string {
  if (rarity === "INSANE") {
    return "shadow-[0_0_20px_rgba(255,0,0,0.5)]";
  }
  
  const color = getRarityColor(rarity);
  const rgb = hexToRgb(color);
  if (!rgb) return "";
  
  return `shadow-[0_0_15px_rgba(${rgb.r},${rgb.g},${rgb.b},0.5)]`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export function formatValue(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}
