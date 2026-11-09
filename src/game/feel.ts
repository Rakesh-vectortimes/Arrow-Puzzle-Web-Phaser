/** Timings and colours copied from the Flutter GameFeel class. */

export const BOARD = 0xfafafc;
export const DOT = 0xdde0e9;
export const ARROW = 0x1b1f3b;
export const ARROW_MOVING = 0x4a90e2;
export const ARROW_BLOCKED = 0xe53935;
export const ARROW_HINTED = 0xffb300;
export const GUIDE = 0x90caf9;
export const INK = 0x1b1f3b;
export const MUTED = 0x7a8099;
export const STAR = 0xffc107;
export const HEART = 0xe53935;
export const HEART_GONE = 0xc9cdda;
export const SHELL = 0xf4f7fb;
export const SHELL_INK = 0x24344d;
export const SHELL_MUTED = 0x8e99a8;
export const BLUE = 0x2f89f5;
export const EASY = 0x2fcb6b;
export const HARD = 0xff8a3d;
export const LOCKED = 0xd5dbe3;
export const WHITE = 0xffffff;
export const CHIP_BORDER = 0xe6e8f0;

export const FONT = 'Segoe UI, system-ui, sans-serif';

export const HEAD_RADIUS = 0.2;
export const BODY_RADIUS = 0.1;
export const HIT_SLOP = 0.42;
export const WORLD_MARGIN = 1.4;
export const EXIT_MARGIN = 1.5;
export const REBOUND_OVERSHOOT = 0.55;
export const IMPACT_OVERLAP = 0.14;
export const STROKE_FACTOR = 0.12;
export const MIN_STROKE = 2.6;
export const MAX_STROKE = 9;
export const HEAD_LENGTH_FACTOR = 0.42;
export const HEAD_WIDTH_FACTOR = 0.4;
export const PRESS_STROKE_SCALE = 1.1;
export const ESCAPE_FADE_FRACTION = 0.15;
export const BLOCKER_FLASH = 0.3;
export const MAX_HEARTS = 3;
export const MAX_HINTS = 2;

export const CONFETTI = [0x4a90e2, 0x1b1f3b, 0xffc107, 0x46c08a, 0xe857a0];

export function escapeDuration(cells: number): number {
    const ms = Math.round(cells * 45);
    return Math.min(700, Math.max(250, ms)) / 1000;
}

function sampleCubic(a: number, b: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return 3 * a * (t - 2 * t2 + t3) + 3 * b * (t2 - t3) + t3;
}

function cubic(x1: number, y1: number, x2: number, y2: number, t: number): number {
    let start = 0;
    let end = 1;
    for (let i = 0; i < 18; i++) {
        const mid = (start + end) / 2;
        const estimate = sampleCubic(x1, x2, mid);
        if (Math.abs(t - estimate) < 1e-5) return sampleCubic(y1, y2, mid);
        if (estimate < t) start = mid;
        else end = mid;
    }
    return sampleCubic(y1, y2, (start + end) / 2);
}

export function easeIn(t: number): number {
    return cubic(0.42, 0, 1, 1, t);
}

export function easeOut(t: number): number {
    return cubic(0, 0, 0.58, 1, t);
}

export function linear(t: number): number {
    return t;
}

/** Flutter Curves.elasticOut with the default period of 0.4. */
export function elasticOut(t: number): number {
    const period = 0.4;
    const s = period / 4;
    return 2 ** (-10 * t) * Math.sin(((t - s) * (Math.PI * 2)) / period) + 1;
}

export function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

export function lerpColor(a: number, b: number, t: number): number {
    const amount = Math.max(0, Math.min(1, t));
    const channel = (shift: number) => {
        const from = (a >> shift) & 255;
        const to = (b >> shift) & 255;
        return Math.round(from + (to - from) * amount);
    };
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

export function css(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
}
