import type { Game } from 'phaser';

const MAX_RATIO = 2;

/** Backing-store scale. Capped so large phones do not allocate a huge canvas. */
export function pixelRatio(): number {
    const raw = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    return Math.min(MAX_RATIO, Math.max(1, Math.round(raw * 4) / 4));
}

/** Convert a CSS pixel size into game pixels. */
export function dp(cssPixels: number): number {
    return Math.round(cssPixels * pixelRatio());
}

function viewportCss(): { cssW: number; cssH: number } {
    const box = document.getElementById('game-container')?.getBoundingClientRect();
    const view = window.visualViewport;
    const cssW = box && box.width > 1 ? box.width : (view?.width ?? window.innerWidth);
    const cssH = box && box.height > 1 ? box.height : (view?.height ?? window.innerHeight);
    return {
        cssW: Math.max(1, Math.round(cssW)),
        cssH: Math.max(1, Math.round(cssH)),
    };
}

function viewportSize(): { width: number; height: number } {
    const { cssW, cssH } = viewportCss();
    const ratio = pixelRatio();
    return {
        width: Math.max(1, Math.round(cssW * ratio)),
        height: Math.max(1, Math.round(cssH * ratio)),
    };
}

const insets = { top: 0, right: 0, bottom: 0, left: 0 };

function readInset(side: 'top' | 'right' | 'bottom' | 'left'): number {
    if (typeof document === 'undefined') return 0;
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;padding-${side}:env(safe-area-inset-${side})`;
    document.body.appendChild(probe);
    const css = parseFloat(getComputedStyle(probe).getPropertyValue(`padding-${side}`)) || 0;
    probe.remove();
    return css;
}

/** Refresh notch and home-indicator insets. Called whenever the screen is fitted. */
export function refreshInsets(): void {
    insets.top = readInset('top');
    insets.right = readInset('right');
    insets.bottom = readInset('bottom');
    insets.left = readInset('left');
}

export function safeTop(): number {
    return dp(insets.top);
}

export function safeBottom(): number {
    return dp(insets.bottom);
}

export function safeLeft(): number {
    return dp(insets.left);
}

export function safeRight(): number {
    return dp(insets.right);
}

export interface LayoutFrame {
    cssW: number;
    cssH: number;
    /** Short screens, including landscape phones. */
    short: boolean;
    phone: boolean;
    tablet: boolean;
    desktop: boolean;
    landscape: boolean;
}

/** Classify the current game size so each scene can pick a layout. */
export function layoutFrame(width: number, height: number): LayoutFrame {
    const cssW = width / pixelRatio();
    const cssH = height / pixelRatio();
    return {
        cssW,
        cssH,
        short: cssH < 500,
        phone: cssW < 560,
        tablet: cssW >= 560 && cssW < 1100,
        desktop: cssW >= 1100,
        landscape: cssW > cssH + 40,
    };
}

let fitting = false;

/** Size the canvas for the current screen and keep pointer coordinates aligned. */
export function fitGame(game: Game): void {
    if (fitting) return;
    fitting = true;
    try {
        refreshInsets();
        const { cssW, cssH } = viewportCss();
        const size = viewportSize();
        game.scale.resize(size.width, size.height);
        const canvas = game.canvas;
        // Integer CSS pixels keep the backing store at an exact device-pixel multiple.
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        game.scale.updateBounds();
        const bounds = canvas.getBoundingClientRect();
        game.scale.displayScale.set(
            bounds.width > 0 ? size.width / bounds.width : 1,
            bounds.height > 0 ? size.height / bounds.height : 1,
        );
    } finally {
        fitting = false;
    }
}
