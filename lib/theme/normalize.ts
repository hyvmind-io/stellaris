/**
 * Color normalization for the theme compiler (PRD-02 §5, Risk: hex⇄HSL rounding).
 *
 * The repo's CSS tokens consume colors in two distinct formats:
 *   1. HSL-channel tokens (e.g. `--background`, `--primary`, sidebar, charts)
 *      are wrapped at use-site as `hsl(var(--token))`, so the stored value must
 *      be bare HSL channels: `"H S% L%"` (e.g. `"248 51% 54%"`).
 *   2. Raw-hex tokens (accent palette, brand) are consumed verbatim, so the
 *      stored value must be a hex string: `"#rrggbb"`.
 *
 * Authors may supply EITHER format for any color (PRD 02-104). These functions
 * convert to the target format, accepting hex or HSL on input and passing
 * through values already in the desired shape.
 *
 * Invalid input throws — the compiler catches per-theme and skips+warns
 * (02-106 / 02-301), never emitting broken CSS.
 */

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
// "H S% L%" — H 0-360, S/L 0-100 with required % signs. Tolerant of extra
// internal whitespace; rejects anything else.
const HSL_RE = /^\s*(\d{1,3}(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%\s*$/;

export interface HslChannels {
  h: number;
  s: number;
  l: number;
}

/** True if the string is a `#rgb` or `#rrggbb` hex color. */
export function isHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

/** True if the string is bare HSL channels (`"H S% L%"`). */
export function isHslChannels(value: string): boolean {
  return HSL_RE.test(value);
}

/** Expand `#rgb` → `#rrggbb`; return `#rrggbb` unchanged (lowercased). */
function expandHex(hex: string): string {
  const h = hex.trim().toLowerCase();
  if (!HEX_RE.test(h)) {
    throw new Error(`invalid hex color: "${hex}"`);
  }
  if (h.length === 4) {
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return h;
}

/** Parse a hex color into 0-255 RGB components. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = expandHex(hex);
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

/** Parse `"H S% L%"` into numeric channels. */
function parseHslChannels(value: string): HslChannels {
  const m = HSL_RE.exec(value);
  if (!m) {
    throw new Error(`invalid HSL channels: "${value}"`);
  }
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/**
 * Convert a hex color to bare HSL channels, rounding to integer H and integer %
 * S/L to match the existing globals.css token style (Risk mitigation).
 */
export function hexToHslChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Convert HSL channels to a `#rrggbb` hex string. */
export function hslChannelsToHex(value: string): string {
  const { h, s, l } = parseHslChannels(value);
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = ln - c / 2;
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Normalize a color to bare HSL channels (`"H S% L%"`), accepting hex OR HSL.
 * Used for core/sidebar/chart tokens consumed as `hsl(var(--token))`.
 */
export function toHslChannels(value: string): string {
  const v = value.trim();
  if (isHslChannels(v)) return parseAndRestringifyHsl(v);
  if (isHex(v)) return hexToHslChannels(v);
  throw new Error(`unrecognized color value (expected hex or HSL): "${value}"`);
}

/**
 * Normalize a color to a hex string (`"#rrggbb"`), accepting hex OR HSL.
 * Used for raw-hex tokens (accent palette, brand) consumed verbatim.
 */
export function toHex(value: string): string {
  const v = value.trim();
  if (isHex(v)) return expandHex(v);
  if (isHslChannels(v)) return hslChannelsToHex(v);
  throw new Error(`unrecognized color value (expected hex or HSL): "${value}"`);
}

/** Re-stringify HSL channels into the canonical integer-rounded form. */
function parseAndRestringifyHsl(value: string): string {
  const { h, s, l } = parseHslChannels(value);
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/**
 * Convert a color (hex OR HSL channels) to a `"r, g, b"` triplet (0-255) for
 * use inside `rgba(...)`. Used to derive theme-matched glow shadows from a
 * theme's `primary` color when the theme omits its own `shadows` group.
 */
export function toRgbTriplet(value: string): string {
  const { r, g, b } = hexToRgb(toHex(value));
  return `${r}, ${g}, ${b}`;
}
