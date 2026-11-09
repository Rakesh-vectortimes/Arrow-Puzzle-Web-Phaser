import { Geom, type GameObjects, type Scene } from 'phaser';
import { playSfx } from './audio';
import { BLUE, FONT, INK, SHELL_MUTED, WHITE, css } from './feel';
import { dp, safeBottom, safeLeft, safeRight } from './screen';

export function navHeight(): number {
    return dp(64) + safeBottom();
}

export function button(
    scene: Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
    options: {
        fill?: number;
        text?: string;
        border?: number;
        subtitle?: string;
        fontSize?: number;
        quiet?: boolean;
    } = {},
): GameObjects.Container {
    const fill = options.fill ?? BLUE;
    const text = options.text ?? '#ffffff';
    const c = scene.add.container(x, y);
    const g = scene.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    if (options.border !== undefined) {
        g.lineStyle(2, options.border, 1);
        g.strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, h / 2);
    }
    const title = scene.add.text(0, options.subtitle ? dp(-9) : 0, label, {
        fontFamily: FONT,
        fontSize: `${dp(options.fontSize ?? 18)}px`,
        color: text,
        fontStyle: 'bold',
    }).setOrigin(0.5);
    c.add([g, title]);
    if (options.subtitle) {
        const subtitle = scene.add.text(0, dp(14), options.subtitle, {
            fontFamily: FONT,
            fontSize: `${dp(13)}px`,
            color: text,
        }).setOrigin(0.5).setAlpha(0.9);
        c.add(subtitle);
    }
    // Containers report origin 0.5, so the hit rectangle must start at 0,0.
    // A rectangle centered on 0 only receives clicks on the top-left of the pill.
    c.setSize(w, h);
    c.setInteractive();
    if (c.input) c.input.cursor = 'pointer';
    c.on('pointerup', () => {
        if (!options.quiet) playSfx('button');
        onClick();
    });
    return c;
}

export function iconButton(
    scene: Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    size = 44,
): GameObjects.Container {
    const c = scene.add.container(x, y);
    const g = scene.add.graphics();
    g.fillStyle(WHITE, 1);
    g.fillCircle(0, 0, size / 2);
    g.lineStyle(2, 0xe6e8f0, 1);
    g.strokeCircle(0, 0, size / 2 - 1);
    const text = scene.add.text(0, 0, label, {
        fontFamily: FONT,
        fontSize: `${dp(18)}px`,
        color: css(INK),
        fontStyle: 'bold',
    }).setOrigin(0.5);
    c.add([g, text]);
    c.setSize(size, size);
    c.setInteractive(new Geom.Circle(size / 2, size / 2, size / 2), Geom.Circle.Contains);
    if (c.input) c.input.cursor = 'pointer';
    c.on('pointerup', () => {
        playSfx('button');
        onClick();
    });
    return c;
}

export function navBar(
    scene: Scene,
    parent: GameObjects.Container,
    tab: 'home' | 'levels',
    width: number,
    height: number,
): void {
    const inset = safeBottom();
    const insetL = safeLeft();
    const insetR = safeRight();
    const barH = navHeight();
    const bar = scene.add.graphics();
    bar.fillStyle(WHITE, 1);
    bar.fillRect(0, height - barH, width, barH);
    bar.lineStyle(Math.max(1, dp(1)), 0xe6eaf0, 1);
    bar.beginPath();
    bar.moveTo(0, height - barH);
    bar.lineTo(width, height - barH);
    bar.strokePath();
    parent.add(bar);

    const items: { id: 'home' | 'levels'; label: string; glyph: string }[] = [
        { id: 'home', label: 'Main', glyph: '⌂' },
        { id: 'levels', label: 'Levels', glyph: '▦' },
    ];
    items.forEach((item, index) => {
        const selected = item.id === tab;
        const color = selected ? css(BLUE) : css(SHELL_MUTED);
        const innerW = Math.max(dp(80), width - insetL - insetR);
        const x = insetL + (index + 0.5) * (innerW / 2);
        const y = height - inset - dp(32);
        const glyph = scene.add.text(x, y - dp(10), item.glyph, {
            fontFamily: FONT,
            fontSize: `${dp(18)}px`,
            color,
        }).setOrigin(0.5);
        const label = scene.add.text(x, y + dp(12), item.label, {
            fontFamily: FONT,
            fontSize: `${dp(12)}px`,
            color,
            fontStyle: selected ? 'bold' : 'normal',
        }).setOrigin(0.5);
        parent.add([glyph, label]);
        const hit = scene.add.zone(x, y, innerW / 2, dp(64)).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => {
            if (selected) return;
            playSfx('button');
            scene.scene.start(item.id === 'home' ? 'Home' : 'Levels');
        });
        parent.add(hit);
    });
}
