import { Scene, type GameObjects, type Input } from 'phaser';
import { playSfx } from '../audio';
import { BLUE, EASY, FONT, HARD, LOCKED, SHELL, SHELL_INK, SHELL_MUTED, WHITE, css } from '../feel';
import { difficultyForId, totalLevels } from '../level';
import { progress } from '../progress';
import { dp, layoutFrame, safeTop } from '../screen';
import { navBar, navHeight } from '../widgets';

interface Spot {
    id: number;
    x: number;
    y: number;
    r: number;
}

export class LevelsScene extends Scene {
    private ui!: GameObjects.Container;
    private scrollRoot!: GameObjects.Container;
    private spots: Spot[] = [];
    private scroll = 0;
    private maxScroll = 0;
    private drag: { y: number; scroll: number; moved: boolean } | null = null;
    private listTop = 0;
    private navH = 0;
    private maskGfx?: GameObjects.Graphics;
    private notice?: GameObjects.Container;
    private noticeTimer?: Phaser.Time.TimerEvent;
    private noticeBox?: { x: number; y: number; w: number; h: number };

    constructor() {
        super('Levels');
    }

    create(): void {
        this.cameras.main.setBackgroundColor(css(SHELL));
        this.ui = this.add.container(0, 0).setDepth(2);
        this.scrollRoot = this.add.container(0, 0).setDepth(0);
        this.scale.on('resize', this.draw, this);
        this.events.once('shutdown', () => {
            this.scale.off('resize', this.draw, this);
            this.input.off('pointerdown', this.onDown, this);
            this.input.off('pointermove', this.onMove, this);
            this.input.off('pointerup', this.onUp, this);
            this.input.off('wheel', this.onWheel, this);
            this.noticeTimer?.remove();
            this.notice?.destroy();
            this.input.setDefaultCursor('default');
        });
        this.input.on('pointerdown', this.onDown, this);
        this.input.on('pointermove', this.onMove, this);
        this.input.on('pointerup', this.onUp, this);
        this.input.on('wheel', this.onWheel, this);
        this.draw();
    }

    private draw(): void {
        this.ui.removeAll(true);
        this.scrollRoot.removeAll(true);
        const width = this.scale.width;
        const height = this.scale.height;
        const frame = layoutFrame(width, height);
        const cssW = frame.cssW;
        const total = totalLevels();
        const frontier = Math.min(progress.highest, total);
        this.navH = navHeight();
        const headerY = safeTop() + dp(frame.short ? 16 : 28);
        this.ui.add(this.add.text(width / 2, headerY, 'Levels', {
            fontFamily: FONT,
            fontSize: `${dp(frame.short ? 20 : cssW < 700 ? 22 : 26)}px`,
            color: css(SHELL_INK),
            fontStyle: 'bold',
        }).setOrigin(0.5));
        this.ui.add(this.add.text(width / 2, headerY + dp(frame.short ? 22 : 26), `${progress.totalStars} stars · level ${frontier} unlocked`, {
            fontFamily: FONT,
            fontSize: `${dp(13)}px`,
            color: css(SHELL_MUTED),
        }).setOrigin(0.5));

        const top = headerY + dp(frame.short ? 40 : 48);
        this.listTop = top;
        const viewH = Math.max(dp(80), height - top - this.navH);
        const columns = cssW < 420 ? 4 : cssW < 700 ? 5 : cssW < 1000 ? 6 : cssW < 1400 ? 8 : 10;
        const side = dp(cssW < 420 ? 12 : 18);
        const gap = dp(12);
        const inner = width - side * 2;
        const cell = Math.min(dp(78), (inner - gap * (columns - 1)) / columns);
        const stride = cell + gap;
        const radius = cell * 0.38;
        this.spots = [];
        let y = 8;
        const gfx = this.add.graphics();
        this.scrollRoot.add(gfx);
        for (let start = 1; start <= total; start += 10) {
            const end = Math.min(start + 9, total);
            this.scrollRoot.add(this.add.text(side, y, `${start}–${end}`, {
                fontFamily: FONT,
                fontSize: `${dp(14)}px`,
                color: css(SHELL_MUTED),
                fontStyle: 'bold',
            }));
            y += dp(28);
            const ids: number[] = [];
            for (let id = start; id <= end; id++) ids.push(id);
            const rows = Math.ceil(ids.length / columns);
            ids.forEach((id, index) => {
                const col = index % columns;
                const row = Math.floor(index / columns);
                const rowCount = Math.min(columns, ids.length - row * columns);
                const rowWidth = rowCount * stride - gap;
                const offset = side + (inner - rowWidth) / 2;
                const cx = offset + col * stride + cell / 2;
                const cy = y + row * stride + cell / 2;
                const unlocked = progress.isUnlocked(id);
                const code = difficultyForId(id);
                const fill = !unlocked ? LOCKED : code === 'easy' ? EASY : code === 'hard' ? HARD : BLUE;
                gfx.fillStyle(fill, 1);
                gfx.fillCircle(cx, cy, radius);
                gfx.lineStyle(Math.max(1, dp(unlocked ? 0 : 2)), unlocked ? fill : 0xffffff, unlocked ? 0 : 0.9);
                if (!unlocked) gfx.strokeCircle(cx, cy, radius - dp(1));
                if (id === frontier) {
                    gfx.lineStyle(dp(3), WHITE, 1);
                    gfx.strokeCircle(cx, cy, radius + dp(3));
                }
                if (!unlocked) drawLock(gfx, cx, cy - radius * 0.22, radius * 0.92);
                const number = this.add.text(cx, cy + (unlocked ? (progress.starsFor(id) > 0 ? -dp(6) : 0) : radius * 0.42), String(id), {
                    fontFamily: FONT,
                    fontSize: `${dp(id >= 100 ? 13 : unlocked ? 16 : 12)}px`,
                    color: unlocked ? '#ffffff' : css(SHELL_INK),
                    fontStyle: 'bold',
                }).setOrigin(0.5);
                this.scrollRoot.add(number);
                const stars = progress.starsFor(id);
                if (stars > 0) {
                    this.scrollRoot.add(this.add.text(cx, cy + dp(12), '★'.repeat(stars), {
                        fontFamily: FONT,
                        fontSize: `${dp(10)}px`,
                        color: '#ffe082',
                    }).setOrigin(0.5));
                }
                this.spots.push({ id, x: cx, y: cy, r: radius + 4 });
            });
            y += rows * stride + dp(18);
        }
        this.maxScroll = Math.max(0, y - viewH);
        this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll));
        const current = this.spots.find((spot) => spot.id === frontier);
        if (current && this.scroll === 0 && frontier > columns) {
            this.scroll = Math.max(0, Math.min(this.maxScroll, current.y - viewH * 0.35));
        }
        this.scrollRoot.setPosition(0, top - this.scroll);
        this.maskGfx?.destroy();
        const mask = this.make.graphics({ x: 0, y: 0 });
        this.maskGfx = mask;
        mask.fillStyle(0xffffff);
        mask.fillRect(0, top, width, viewH);
        this.scrollRoot.setMask(mask.createGeometryMask());
        navBar(this, this.ui, 'levels', width, height);
    }

    private contentY(pointerY: number): number {
        return pointerY - this.listTop + this.scroll;
    }

    private onDown(pointer: Input.Pointer): void {
        if (pointer.y > this.scale.height - this.navH || pointer.y < this.listTop) return;
        this.drag = { y: pointer.y, scroll: this.scroll, moved: false };
    }

    private onMove(pointer: Input.Pointer): void {
        this.updateCursor(pointer);
        if (!this.drag || !pointer.isDown) return;
        const dy = pointer.y - this.drag.y;
        if (Math.abs(dy) > dp(8)) this.drag.moved = true;
        this.scroll = Math.max(0, Math.min(this.maxScroll, this.drag.scroll - dy));
        this.scrollRoot.y = this.listTop - this.scroll;
    }

    private onUp(pointer: Input.Pointer): void {
        const drag = this.drag;
        this.drag = null;
        if (!drag || drag.moved) return;
        if (pointer.y > this.scale.height - this.navH || pointer.y < this.listTop) return;
        if (this.overNotice(pointer)) {
            this.hideNotice();
            return;
        }
        const y = this.contentY(pointer.y);
        const spot = this.spots.find((item) => Math.hypot(item.x - pointer.x, item.y - y) <= item.r);
        if (!spot) return;
        if (!progress.isUnlocked(spot.id)) {
            this.showLocked(spot.id);
            return;
        }
        this.scene.start('Play', { levelId: spot.id, from: 'levels' });
    }

    private updateCursor(pointer: Input.Pointer): void {
        if (pointer.y > this.scale.height - this.navH || pointer.y < this.listTop) {
            this.input.setDefaultCursor('default');
            return;
        }
        const y = this.contentY(pointer.y);
        const over = this.spots.some((item) => Math.hypot(item.x - pointer.x, item.y - y) <= item.r);
        this.input.setDefaultCursor(over ? 'pointer' : 'default');
    }

    private showLocked(id: number): void {
        playSfx('button', 0.45);
        const from = progress.highest;
        const to = Math.max(from, id - 1);
        const message = from === to
            ? `You need to clear level ${from} to unlock this.`
            : `You need to clear levels ${from}–${to} to unlock this.`;
        this.notice?.destroy();
        this.noticeTimer?.remove();
        const width = this.scale.width;
        const height = this.scale.height;
        const cardW = Math.min(dp(460), width - dp(28));
        const cardH = dp(64);
        const y = height - this.navH - dp(16) - cardH / 2;
        this.noticeBox = { x: width / 2 - cardW / 2, y: y - cardH / 2, w: cardW, h: cardH };
        const root = this.add.container(width / 2, y).setDepth(6);
        const panel = this.add.graphics();
        panel.fillStyle(0x1b2433, 1);
        panel.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, dp(18));
        const label = this.add.text(0, 0, message, {
            fontFamily: FONT,
            fontSize: `${dp(15)}px`,
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: cardW - dp(28) },
        }).setOrigin(0.5);
        root.add([panel, label]);
        this.notice = root;
        this.noticeTimer = this.time.delayedCall(2800, () => this.hideNotice());
    }

    private hideNotice(): void {
        this.noticeTimer?.remove();
        this.noticeTimer = undefined;
        this.notice?.destroy();
        this.notice = undefined;
        this.noticeBox = undefined;
    }

    private overNotice(pointer: Input.Pointer): boolean {
        const box = this.noticeBox;
        if (!this.notice || !box) return false;
        return pointer.x >= box.x && pointer.x <= box.x + box.w
            && pointer.y >= box.y && pointer.y <= box.y + box.h;
    }

    private onWheel(
        pointer: Input.Pointer,
        _objects: unknown,
        _dx: number,
        dy: number,
    ): void {
        if (pointer.y > this.scale.height - this.navH) return;
        this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + dy));
        this.scrollRoot.y = this.listTop - this.scroll;
    }
}

function drawLock(g: GameObjects.Graphics, x: number, y: number, size: number): void {
    const color = 0x3d4c5c;
    const bodyW = size * 0.62;
    const bodyH = size * 0.44;
    const bodyTop = y - bodyH * 0.08;
    g.fillStyle(color, 1);
    g.fillRoundedRect(x - bodyW / 2, bodyTop, bodyW, bodyH, Math.max(2, size * 0.12));
    g.lineStyle(Math.max(2.5, size * 0.13), color, 1);
    g.beginPath();
    g.arc(x, bodyTop, bodyW * 0.34, Math.PI, Math.PI * 2, false, 0.04);
    g.strokePath();
    g.fillStyle(LOCKED, 1);
    g.fillCircle(x, bodyTop + bodyH * 0.5, Math.max(1.6, size * 0.07));
}
