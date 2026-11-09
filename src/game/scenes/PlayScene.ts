import { Input, Scene, type GameObjects } from 'phaser';
import { playSfx, playTap } from '../audio';
import { sendMessage, showInterstitial } from '../bridge';
import { BoardController, type SessionSnapshot } from '../board';
import { paintBoard } from '../draw';
import {
    ARROW_BLOCKED,
    BLUE,
    BOARD,
    CONFETTI,
    FONT,
    HEART,
    HEART_GONE,
    HIT_SLOP,
    INK,
    MUTED,
    STAR,
    WHITE,
    css,
    easeOutBack,
} from '../feel';
import { allPoints, difficultyLabel, fetchLevel, totalLevels, type LevelData } from '../level';
import { fitLayout, toCanvas, toWorld, type WorldLayout } from '../layout';
import { progress } from '../progress';
import { dp, layoutFrame, safeBottom, safeLeft, safeRight, safeTop } from '../screen';
import { button, iconButton } from '../widgets';

interface PlayData {
    levelId?: number;
    from?: 'home' | 'levels';
}

interface ConfettiBit {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: number;
    life: number;
    spin: number;
    w: number;
}

export class PlayScene extends Scene {
    private levelId = 1;
    private from: 'home' | 'levels' = 'home';
    private level: LevelData | null = null;
    private controller: BoardController | null = null;
    private boardG!: GameObjects.Graphics;
    private vignetteG!: GameObjects.Graphics;
    private confettiG!: GameObjects.Graphics;
    private maskG!: GameObjects.Graphics;
    private toastText!: GameObjects.Text;
    private chrome?: GameObjects.Container;
    private countText?: GameObjects.Text;
    private heartTexts: GameObjects.Text[] = [];
    private hintLabel?: GameObjects.Text;
    private guidesLabel?: GameObjects.Text;
    private hintBtn?: GameObjects.Container;
    private guidesBtn?: GameObjects.Container;
    private boardX = 0;
    private boardY = 100;
    private boardW = 100;
    private boardH = 100;
    private layout: WorldLayout = fitLayout([], 1, 1);
    private viewScale = 1;
    private panX = 0;
    private panY = 0;
    private dirty = true;
    private pressedId: string | null = null;
    private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    private pinchDist = 0;
    private dragging = false;
    private longFired = false;
    private longTimer: number | null = null;
    private dialog: 'win' | 'fail' | null = null;
    private winDelay = 0;
    private stars = 1;
    private card: GameObjects.Container | null = null;
    private cardAge = 1;
    private shakeAge = 1;
    private vignetteAge = 1;
    private vignetteOn = false;
    private lastImpact = 0;
    private toastAge = 0;
    private loadToken = 0;
    private zoomOut?: GameObjects.Container;
    private confetti: ConfettiBit[] = [];
    private ended = false;
    private outcomeSent = false;
    private leaving = false;
    private hudReady = false;
    private countCompact = false;
    private cardPop?: GameObjects.Container;

    constructor() {
        super('Play');
    }

    init(data: PlayData): void {
        this.levelId = data.levelId ?? 1;
        this.from = data.from ?? 'home';
        this.level = null;
        this.controller = null;
        this.dialog = null;
        this.ended = false;
        this.winDelay = 0;
        this.viewScale = 1;
        this.panX = 0;
        this.panY = 0;
        this.confetti = [];
        this.pointers.clear();
        this.pressedId = null;
        this.dragging = false;
        this.longFired = false;
        this.vignetteOn = false;
        this.toastAge = 0;
        this.outcomeSent = false;
        this.leaving = false;
        this.hudReady = false;
        this.cardPop = undefined;
        this.card = null;
        this.chrome = undefined;
        this.countText = undefined;
        this.heartTexts = [];
        this.hintLabel = undefined;
        this.guidesLabel = undefined;
        this.hintBtn = undefined;
        this.guidesBtn = undefined;
        this.zoomOut = undefined;
        this.layout = fitLayout([], 1, 1);
        this.dirty = true;
        this.lastImpact = 0;
    }

    create(): void {
        this.cameras.main.setBackgroundColor(css(BOARD));
        this.input.addPointer(2);
        this.input.mouse?.disableContextMenu();
        this.boardG = this.add.graphics().setDepth(0);
        this.vignetteG = this.add.graphics().setDepth(3);
        this.confettiG = this.add.graphics().setDepth(12);
        this.maskG = this.make.graphics({ x: 0, y: 0 });
        this.boardG.setMask(this.maskG.createGeometryMask());
        this.toastText = this.add.text(0, 0, '', {
            fontFamily: FONT,
            fontSize: `${dp(15)}px`,
            color: '#ffffff',
            backgroundColor: '#1b1f3be6',
            padding: { left: dp(12), right: dp(12), top: dp(8), bottom: dp(8) },
        }).setOrigin(0.5).setDepth(8).setVisible(false);

        const token = ++this.loadToken;
        const loading = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Loading level…', {
            fontFamily: FONT,
            fontSize: `${dp(18)}px`,
            color: css(INK),
        }).setOrigin(0.5);

        this.input.on('pointerdown', this.onDown, this);
        this.input.on('pointermove', this.onMove, this);
        this.input.on('pointerup', this.onUp, this);
        this.input.on('wheel', this.onWheel, this);
        this.input.keyboard?.on('keydown-ESC', this.leave, this);
        this.scale.on('resize', this.layoutChrome, this);
        this.events.once('shutdown', () => this.teardown());

        void fetchLevel(this.levelId).then((level) => {
            if (token !== this.loadToken || !this.scene.isActive()) return;
            try {
                loading.destroy();
            } catch (error) {
                console.error('loading.destroy', error);
            }
            this.level = level;
            this.controller = new BoardController();
            this.controller.feedback = {
                tap: () => playTap(),
                escape: () => playSfx('escape'),
                wrong: () => playSfx('wrong'),
                lose: () => playSfx('lose'),
                win: () => undefined,
                hint: () => playSfx('hint'),
            };
            this.controller.onProgress = () => this.persist();
            this.controller.onChange = () => this.onBoardChange();
            this.controller.loadLevel(level, progress.sessionFor(level.id));
            sendMessage('level_started', { level: String(level.id) });
            this.lastImpact = this.controller.impactCount;
            try {
                progress.rememberLevel(level.id);
            } catch (error) {
                console.error(error);
            }
            try {
                this.layoutChrome();
            } catch (error) {
                console.error(error);
                this.time.delayedCall(0, () => {
                    if (token !== this.loadToken || !this.scene.isActive() || !this.controller) return;
                    try {
                        this.layoutChrome();
                    } catch (again) {
                        console.error(again);
                    }
                });
            }
        }).catch((error: unknown) => {
            console.error(error);
            try {
                loading.destroy();
            } catch (destroyError) {
                console.error(destroyError);
            }
            if (token !== this.loadToken || !this.scene.isActive()) return;
            const message = error instanceof Error ? error.message : 'Could not load this level.';
            this.add.text(this.scale.width / 2, this.scale.height / 2 - dp(24), message, {
                fontFamily: FONT,
                fontSize: `${dp(16)}px`,
                color: css(HEART),
                align: 'center',
                wordWrap: { width: this.scale.width - dp(48) },
            }).setOrigin(0.5);
            button(this, this.scale.width / 2, this.scale.height / 2 + dp(36), dp(140), dp(48), 'Back', () => this.leave(), {
                fill: BLUE,
                text: '#ffffff',
            });
        });
    }

    private teardown(): void {
        this.hudReady = false;
        try {
            this.persist();
        } catch (error) {
            console.error(error);
        }
        try {
            this.boardG?.clearMask(true);
        } catch (error) {
            console.error(error);
        }
        try {
            this.maskG?.destroy();
        } catch (error) {
            console.error(error);
        }
        this.cancelLong();
        this.scale.off('resize', this.layoutChrome, this);
        this.input.off('pointerdown', this.onDown, this);
        this.input.off('pointermove', this.onMove, this);
        this.input.off('pointerup', this.onUp, this);
        this.input.off('wheel', this.onWheel, this);
        this.input.keyboard?.off('keydown-ESC', this.leave, this);
    }

    private persist(): void {
        const controller = this.controller;
        if (!controller || controller.state !== 'playing') return;
        const session: SessionSnapshot | null = controller.session;
        if (!session) return;
        progress.saveSession(session);
    }

    private onBoardChange(): void {
        const controller = this.controller;
        if (!controller || !this.hudReady) return;
        this.dirty = true;
        if (controller.impactCount !== this.lastImpact) {
            this.lastImpact = controller.impactCount;
            this.shakeAge = 0;
            this.vignetteAge = 0;
            this.vignetteOn = true;
        }
        this.refreshHud();
        if (this.dialog) return;
        if (controller.state === 'won') this.beginWin();
        else if (controller.state === 'failed') this.beginFail();
    }

    private beginWin(): void {
        const controller = this.controller;
        if (!controller || this.ended) return;
        this.ended = true;
        this.dialog = 'win';
        this.stars = controller.starsEarned;
        progress.markCompleted(this.levelId, this.stars);
        this.winDelay = 0.3;
    }

    private beginFail(): void {
        if (this.ended) return;
        this.ended = true;
        this.dialog = 'fail';
        progress.clearSession();
        this.showCard();
    }

    private layoutChrome(): void {
        if (!this.controller || !this.level) return;
        this.hudReady = false;
        this.countText = undefined;
        this.heartTexts = [];
        this.hintLabel = undefined;
        this.guidesLabel = undefined;
        this.chrome?.destroy();
        const width = this.scale.width;
        const height = this.scale.height;
        const chrome = this.add.container(0, 0).setDepth(5);
        this.chrome = chrome;
        const frame = layoutFrame(width, height);
        const insetL = safeLeft();
        const insetR = safeRight();
        const edge = dp(frame.phone ? 10 : 16);
        const icon = dp(frame.short ? 36 : frame.phone ? 40 : 44);
        const topY = safeTop() + edge + icon / 2;
        const back = iconButton(this, insetL + edge + icon / 2, topY, '←', () => this.leave(), icon);
        back.setData('ui', true);
        const sound = iconButton(this, width - insetR - edge - icon / 2, topY, progress.soundEnabled ? '♪' : '×', () => {
            progress.soundEnabled = !progress.soundEnabled;
            this.layoutChrome();
        }, icon);
        sound.setData('ui', true);

        const chipH = dp(frame.short ? 30 : 34);
        const heartGap = dp(frame.phone ? 20 : 24);
        const heartSize = dp(frame.short ? 18 : 22);
        const gutter = dp(8);
        const chipY = safeTop() + edge + icon + dp(frame.short ? 6 : 10) + chipH / 2;
        const headerBottom = chipY + chipH / 2 + dp(frame.short ? 4 : 8);
        const heartLeft = width / 2 - heartGap - heartSize;
        const heartRight = width / 2 + heartGap + heartSize;
        const countRoom = heartLeft - gutter - (insetL + edge);
        const diffRoom = width - insetR - edge - gutter - heartRight;
        const chipW = Math.max(dp(44), Math.min(dp(96), countRoom));
        const diffW = Math.max(dp(52), Math.min(dp(88), diffRoom));
        this.countCompact = chipW < dp(78);
        const countX = insetL + edge;
        const diffX = width - insetR - edge - diffW;
        const showDiff = diffRoom >= dp(56);

        const countG = this.add.graphics();
        countG.fillStyle(WHITE, 1);
        countG.lineStyle(Math.max(1, dp(1)), 0xe6e8f0, 1);
        countG.fillRoundedRect(countX, chipY - chipH / 2, chipW, chipH, chipH / 2);
        countG.strokeRoundedRect(countX, chipY - chipH / 2, chipW, chipH, chipH / 2);
        this.countText = this.add.text(countX + chipW / 2, chipY, '', {
            fontFamily: FONT,
            fontSize: `${dp(this.countCompact ? 13 : 14)}px`,
            color: css(INK),
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.heartTexts = [0, 1, 2].map((index) => this.add.text(width / 2 + (index - 1) * heartGap, chipY, '♥', {
            fontFamily: FONT,
            fontSize: `${heartSize}px`,
            color: css(HEART),
        }).setOrigin(0.5));

        const diff = difficultyLabel(this.level.difficulty);
        const diffG = this.add.graphics();
        const diffText = this.add.text(0, 0, '', {
            fontFamily: FONT,
            fontSize: `${dp(diffW < dp(70) ? 12 : 14)}px`,
            color: css(INK),
            fontStyle: 'bold',
        }).setOrigin(0.5);
        if (showDiff) {
            diffG.fillStyle(WHITE, 1);
            diffG.lineStyle(Math.max(1, dp(1)), 0xe6e8f0, 1);
            diffG.fillRoundedRect(diffX, chipY - chipH / 2, diffW, chipH, chipH / 2);
            diffG.strokeRoundedRect(diffX, chipY - chipH / 2, diffW, chipH, chipH / 2);
            diffText.setText(diff).setPosition(diffX + diffW / 2, chipY);
        }

        const title = this.add.text(width / 2, topY, `Level ${this.levelId}`, {
            fontFamily: FONT,
            fontSize: `${dp(frame.short ? 16 : frame.phone ? 18 : 22)}px`,
            color: css(INK),
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const footerBtnH = dp(frame.short ? 42 : 48);
        const footerH = footerBtnH + dp(frame.short ? 14 : 24) + safeBottom();
        const maxBoard = Math.min(width - insetL - insetR - edge * 2, dp(frame.desktop ? 920 : 1040));
        this.boardX = Math.round((width - maxBoard) / 2);
        this.boardY = headerBottom;
        this.boardW = maxBoard;
        this.boardH = Math.max(dp(96), height - headerBottom - footerH);
        this.boardG.setPosition(this.boardX, this.boardY);
        this.maskG.clear();
        this.maskG.fillStyle(0xffffff, 1);
        this.maskG.fillRect(this.boardX, this.boardY, this.boardW, this.boardH);
        this.layout = this.makeLayout();

        const footerY = height - safeBottom() - dp(frame.short ? 8 : 12) - footerBtnH / 2;
        const buttonW = Math.min(dp(frame.desktop ? 180 : 160), (width - insetL - insetR - dp(36)) / 2);
        this.hintBtn = button(this, width / 2 - buttonW / 2 - dp(8), footerY, buttonW, footerBtnH, 'Hint', () => {
            if (!this.controller?.showHint()) {
                playSfx('button');
                this.showToast(this.controller && this.controller.hints <= 0
                    ? 'No clues left on this level'
                    : 'No clear move to hint');
            }
        }, { fill: WHITE, text: css(INK), border: 0xe6e8f0, fontSize: 16, quiet: true });
        this.hintBtn.setData('ui', true);
        this.hintLabel = this.hintBtn.getAt(1) as GameObjects.Text;
        this.guidesBtn = button(this, width / 2 + buttonW / 2 + dp(8), footerY, buttonW, footerBtnH, 'Paths', () => {
            this.controller?.toggleGuides();
        }, { fill: WHITE, text: css(INK), border: 0xe6e8f0, fontSize: 16 });
        this.guidesBtn.setData('ui', true);
        this.guidesLabel = this.guidesBtn.getAt(1) as GameObjects.Text;

        const zoomSize = dp(frame.short ? 36 : 42);
        const zoomX = this.boardX + this.boardW - dp(8) - zoomSize / 2;
        const zoomGap = zoomSize + dp(8);
        const zoomOutY = this.boardY + this.boardH - dp(8) - zoomSize / 2;
        const zoomIn = iconButton(this, zoomX, zoomOutY - zoomGap, '+', () => {
            this.zoomAt(this.boardCenter(), 1.35);
        }, zoomSize);
        this.zoomOut = iconButton(this, zoomX, zoomOutY, '−', () => {
            if (this.viewScale <= 1.01) return;
            this.zoomAt(this.boardCenter(), 1 / 1.35);
        }, zoomSize);
        zoomIn.setData('ui', true);
        this.zoomOut.setData('ui', true);
        this.zoomOut.setAlpha(this.viewScale > 1.01 ? 1 : 0.4);

        chrome.add([
            back, title, sound, countG, this.countText, ...this.heartTexts,
            diffG, diffText, this.hintBtn, this.guidesBtn, zoomIn, this.zoomOut,
        ]);
        this.toastText.setPosition(width / 2, this.boardY + this.boardH - dp(18));
        this.toastText.setFontSize(dp(15));
        this.hudReady = true;
        this.refreshHud();
        this.dirty = true;
        this.paint();
        if (this.dialog === 'win' && this.winDelay <= 0) this.showCard();
        if (this.dialog === 'fail') this.showCard();
    }

    private makeLayout(): WorldLayout {
        const points = this.level ? allPoints(this.level) : [];
        const padding = this.boardW < dp(420) ? dp(16) : dp(28);
        return fitLayout(points, this.boardW, this.boardH, this.viewScale, this.panX, this.panY, padding);
    }

    private refreshHud(): void {
        const controller = this.controller;
        if (!controller || !this.countText?.active) return;
        this.countText.setText(this.countCompact ? String(controller.remainingLines) : `${controller.remainingLines} left`);
        this.heartTexts.forEach((text, index) => {
            text.setColor(css(index < controller.hearts ? HEART : HEART_GONE));
        });
        this.hintLabel?.setText(`Hint · ${controller.hints}`);
        const playing = controller.state === 'playing' && !this.dialog;
        this.hintBtn?.setAlpha(playing && controller.hints > 0 ? 1 : 0.45);
        this.guidesBtn?.setAlpha(playing ? 1 : 0.45);
        this.guidesLabel?.setColor(controller.guidesVisible ? css(BLUE) : css(INK));
    }

    private slop(): number {
        return Math.max(HIT_SLOP, dp(22) / Math.max(1, this.layout.unit));
    }

    private localPoint(pointer: Input.Pointer): { x: number; y: number } {
        return { x: pointer.x - this.boardX, y: pointer.y - this.boardY };
    }

    private inBoard(pointer: Input.Pointer): boolean {
        return pointer.x >= this.boardX
            && pointer.x <= this.boardX + this.boardW
            && pointer.y >= this.boardY
            && pointer.y <= this.boardY + this.boardH;
    }

    private overUi(pointer: Input.Pointer): boolean {
        return this.input.hitTestPointer(pointer).some((obj) => Boolean(obj.getData('ui')));
    }

    private boardCenter(): { x: number; y: number } {
        return { x: this.boardX + this.boardW / 2, y: this.boardY + this.boardH / 2 };
    }

    private zoomAt(screen: { x: number; y: number }, factor: number): void {
        const local = { x: screen.x - this.boardX, y: screen.y - this.boardY };
        const before = toWorld(this.layout, local);
        this.viewScale = Math.max(1, Math.min(4.5, this.viewScale * factor));
        if (this.viewScale <= 1.01) {
            this.viewScale = 1;
            this.panX = 0;
            this.panY = 0;
        } else {
            this.layout = this.makeLayout();
            const after = toCanvas(this.layout, before);
            this.panX += local.x - after.x;
            this.panY += local.y - after.y;
            this.clampPan();
        }
        this.layout = this.makeLayout();
        this.dirty = true;
        this.zoomOut?.setAlpha(this.viewScale > 1.01 ? 1 : 0.4);
    }

    private clampPan(): void {
        const draft = this.makeLayout();
        const drawnW = draft.worldW * draft.unit;
        const drawnH = draft.worldH * draft.unit;
        const originX = (this.boardW - drawnW) / 2 + this.panX;
        const margin = dp(48);
        const nextX = Math.max(margin - drawnW, Math.min(this.boardW - margin, originX));
        this.panX += nextX - originX;
        const originY = (this.boardH - drawnH) / 2 + this.panY;
        const nextY = Math.max(margin - drawnH, Math.min(this.boardH - margin, originY));
        this.panY += nextY - originY;
    }

    private onDown(pointer: Input.Pointer): void {
        if (!this.controller || this.dialog || this.overUi(pointer) || !this.inBoard(pointer)) return;
        this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y, sx: pointer.x, sy: pointer.y });
        if (this.pointers.size >= 2) {
            this.cancelLong();
            this.pinchDist = this.pointerSpan();
            this.pressedId = null;
            return;
        }
        this.dragging = false;
        this.longFired = false;
        const world = toWorld(this.layout, this.localPoint(pointer));
        this.pressedId = this.controller.hitTest(world, this.slop());
        this.dirty = true;
        this.cancelLong();
        this.longTimer = window.setTimeout(() => {
            this.longFired = true;
            if (this.pressedId && this.controller) {
                this.controller.setGuideLine(this.pressedId);
                playSfx('button', 0.6);
            }
        }, 450);
    }

    private onMove(pointer: Input.Pointer): void {
        const rec = this.pointers.get(pointer.id);
        if (!rec) return;
        const dx = pointer.x - rec.x;
        const dy = pointer.y - rec.y;
        rec.x = pointer.x;
        rec.y = pointer.y;
        if (this.pointers.size >= 2 && this.pinchDist > 0) {
            const span = this.pointerSpan();
            if (span > 0) {
                const center = this.pointerCenter();
                this.zoomAt(center, span / this.pinchDist);
                this.pinchDist = span;
            }
            return;
        }
        const moved = Math.hypot(pointer.x - rec.sx, pointer.y - rec.sy);
        if (moved > dp(12)) {
            this.cancelLong();
            if (this.viewScale > 1.02) {
                this.dragging = true;
                this.pressedId = null;
                this.controller?.setGuideLine(null);
                this.panX += dx;
                this.panY += dy;
                this.clampPan();
                this.layout = this.makeLayout();
                this.dirty = true;
            }
        }
    }

    private onUp(pointer: Input.Pointer): void {
        if (!this.pointers.has(pointer.id)) return;
        this.pointers.delete(pointer.id);
        if (this.pointers.size < 2) this.pinchDist = 0;
        if (this.pointers.size > 0) return;
        this.cancelLong();
        const id = this.pressedId;
        const tapped = !this.dragging && !this.longFired;
        this.pressedId = null;
        this.dragging = false;
        this.controller?.setGuideLine(null);
        if (tapped && id && this.controller && !this.dialog) this.controller.onTapLine(id);
        this.dirty = true;
    }

    private onWheel(pointer: Input.Pointer, _go: unknown, _dx: number, dy: number): void {
        if (!this.inBoard(pointer) || this.dialog) return;
        this.zoomAt({ x: pointer.x, y: pointer.y }, dy > 0 ? 0.9 : 1.11);
    }

    private pointerSpan(): number {
        const pts = [...this.pointers.values()];
        if (pts.length < 2) return 0;
        return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }

    private pointerCenter(): { x: number; y: number } {
        const pts = [...this.pointers.values()];
        return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }

    private cancelLong(): void {
        if (this.longTimer !== null) {
            window.clearTimeout(this.longTimer);
            this.longTimer = null;
        }
    }

    private showToast(message: string): void {
        this.toastAge = 1.4;
        this.toastText.setText(message).setVisible(true).setAlpha(1);
    }

    private paint(): void {
        const controller = this.controller;
        if (!controller) return;
        const shake = this.shakeAge < 0.42
            ? Math.sin((this.shakeAge / 0.42) * Math.PI * 10) * 8 * (1 - this.shakeAge / 0.42)
            : 0;
        this.boardG.x = this.boardX + shake;
        paintBoard(this.boardG, controller, this.layout, this.boardW, this.boardH, this.pressedId);
        this.vignetteG.clear();
        if (this.vignetteOn) {
            const alpha = this.vignetteAge < 0.08
                ? 0.35
                : 0.35 * Math.max(0, 1 - (this.vignetteAge - 0.08) / 0.4);
            if (alpha > 0.01) {
                this.vignetteG.fillStyle(ARROW_BLOCKED, alpha);
                const w = this.scale.width;
                const h = this.scale.height;
                const band = dp(8);
                this.vignetteG.fillRect(0, 0, w, band);
                this.vignetteG.fillRect(0, h - band, w, band);
                this.vignetteG.fillRect(0, 0, band, h);
                this.vignetteG.fillRect(w - band, 0, band, h);
            }
        }
        this.dirty = false;
    }

    update(_time: number, delta: number): void {
        if (!this.hudReady) return;
        const dt = delta / 1000;
        const controller = this.controller;
        if (controller) {
            controller.updateTimers(dt);
            if (controller.state === 'playing' && controller.isBusy) controller.tick(dt);
        }
        if (this.shakeAge < 0.42) this.shakeAge += dt;
        if (this.vignetteOn) {
            this.vignetteAge += dt;
            if (this.vignetteAge > 0.5) this.vignetteOn = false;
        }
        if (this.toastAge > 0) {
            this.toastAge -= dt;
            this.toastText.setAlpha(Math.max(0, Math.min(1, this.toastAge / 0.3)));
            if (this.toastAge <= 0) this.toastText.setVisible(false);
        }
        if (this.dialog === 'win' && this.winDelay > 0) {
            this.winDelay -= dt;
            if (this.winDelay <= 0) {
                playSfx('level_complete');
                this.burst();
                this.showCard();
            }
        }
        if (this.cardPop && this.cardAge < 0.28) {
            this.cardAge += dt;
            this.cardPop.setScale(easeOutBack(Math.min(1, this.cardAge / 0.28)));
        }
        if (this.confetti.length > 0) {
            this.confettiG.clear();
            this.confetti = this.confetti.filter((bit) => bit.life > 0);
            for (const bit of this.confetti) {
                bit.life -= dt;
                bit.vy += 420 * dt;
                bit.x += bit.vx * dt;
                bit.y += bit.vy * dt;
                bit.spin += dt * 4;
                this.confettiG.fillStyle(bit.color, Math.max(0, bit.life));
                this.confettiG.fillRect(bit.x, bit.y, bit.w, bit.w * 0.6);
            }
        }
        const moving = this.shakeAge < 0.42 || this.vignetteOn || (controller?.isBusy ?? false);
        if (this.dirty || moving) this.paint();
    }

    private burst(): void {
        const origin = this.boardCenter();
        this.confetti = Array.from({ length: 48 }, () => {
            const angle = Math.random() * Math.PI * 2;
            const speed = 80 + Math.random() * 220;
            return {
                x: origin.x,
                y: origin.y - 40,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 160,
                color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
                life: 0.8 + Math.random() * 0.5,
                spin: 0,
                w: 6 + Math.random() * 6,
            };
        });
    }

    private reportOutcome(): void {
        if (this.outcomeSent || !this.dialog) return;
        this.outcomeSent = true;
        const level = String(this.levelId);
        if (this.dialog === 'win') {
            sendMessage('level_completed', { level });
            showInterstitial('level_completed');
        } else {
            sendMessage('level_failed', { level });
            showInterstitial('level_failed');
        }
    }

    private showCard(): void {
        this.reportOutcome();
        this.chrome?.setVisible(false);
        this.card?.destroy();
        const width = this.scale.width;
        const height = this.scale.height;
        const root = this.add.container(width / 2, height / 2).setDepth(20);
        this.card = root;
        this.cardAge = 0;
        const dim = this.add.graphics();
        dim.fillStyle(0x1b2433, 0.55);
        dim.fillRect(-width / 2, -height / 2, width, height);
        root.add(dim);
        const side = Math.max(safeLeft(), safeRight());
        const availW = width - side * 2 - dp(16);
        const availH = height - safeTop() - safeBottom() - dp(16);
        const cardW = Math.min(dp(380), availW);
        const idealH = dp(this.dialog === 'win' ? 300 : 270);
        const cardH = Math.max(dp(180), Math.min(idealH, availH));
        const s = cardH / idealH;
        const u = (cssPx: number) => Math.max(1, Math.round(dp(cssPx) * s));
        const pop = this.add.container(0, 0);
        this.cardPop = pop;
        pop.setScale(0.92);
        const panel = this.add.graphics();
        panel.fillStyle(0x1b2433, 0.12);
        panel.fillRoundedRect(-cardW / 2, -cardH / 2 + dp(8), cardW, cardH, dp(28));
        panel.fillStyle(WHITE, 1);
        panel.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, dp(28));
        pop.add(panel);
        const buttonW = cardW - u(48);
        if (this.dialog === 'win') {
            pop.add(this.add.text(0, -cardH / 2 + u(40), `LEVEL ${this.levelId}`, {
                fontFamily: FONT,
                fontSize: `${u(13)}px`,
                color: css(MUTED),
                fontStyle: 'bold',
            }).setOrigin(0.5));
            pop.add(this.add.text(0, -cardH / 2 + u(76), 'Level Complete', {
                fontFamily: FONT,
                fontSize: `${u(28)}px`,
                color: css(INK),
                fontStyle: 'bold',
            }).setOrigin(0.5));
            pop.add(this.add.text(0, -cardH / 2 + u(128), [0, 1, 2].map((i) => (i < this.stars ? '★' : '☆')).join('   '), {
                fontFamily: FONT,
                fontSize: `${u(34)}px`,
                color: css(STAR),
            }).setOrigin(0.5));
            const last = this.levelId >= totalLevels();
            const next = button(this, 0, cardH / 2 - u(92), buttonW, u(52), last ? 'Done' : 'Next', () => this.goNext(), {
                fill: BLUE,
                text: '#ffffff',
                fontSize: Math.max(14, Math.round(18 * s)),
            });
            next.setData('ui', true);
            const levels = button(this, 0, cardH / 2 - u(32), buttonW, u(40), 'Levels', () => {
                this.switchTo('Levels');
            }, { fill: WHITE, text: css(BLUE), fontSize: Math.max(13, Math.round(16 * s)) });
            levels.setData('ui', true);
            root.add([pop, next, levels]);
        } else {
            pop.add(this.add.text(0, -cardH / 2 + u(52), 'Out of lives', {
                fontFamily: FONT,
                fontSize: `${u(28)}px`,
                color: css(INK),
                fontStyle: 'bold',
            }).setOrigin(0.5));
            pop.add(this.add.text(0, -cardH / 2 + u(112), 'A moving arrow hit another line.\nTry a different order — you get\n3 lives each attempt.', {
                fontFamily: FONT,
                fontSize: `${u(15)}px`,
                color: css(MUTED),
                align: 'center',
                wordWrap: { width: cardW - u(36) },
            }).setOrigin(0.5));
            const retry = button(this, 0, cardH / 2 - u(92), buttonW, u(52), 'Retry', () => this.retry(), {
                fill: BLUE,
                text: '#ffffff',
                fontSize: Math.max(14, Math.round(18 * s)),
            });
            retry.setData('ui', true);
            const levels = button(this, 0, cardH / 2 - u(32), buttonW, u(40), 'Levels', () => {
                this.switchTo('Levels');
            }, { fill: WHITE, text: css(BLUE), fontSize: Math.max(13, Math.round(16 * s)) });
            levels.setData('ui', true);
            root.add([pop, retry, levels]);
        }
    }

    private switchTo(key: string, data?: object): void {
        if (this.leaving) return;
        this.leaving = true;
        this.hudReady = false;
        this.input.enabled = false;
        this.persist();
        this.time.delayedCall(0, () => {
            this.scene.start(key, data);
        });
    }

    private goNext(): void {
        const next = this.levelId + 1;
        if (next > totalLevels()) {
            this.switchTo('Home');
            return;
        }
        this.switchTo('Play', { levelId: next, from: this.from });
    }

    private retry(): void {
        progress.clearSession();
        this.switchTo('Play', { levelId: this.levelId, from: this.from });
    }

    private leave(): void {
        this.switchTo(this.from === 'levels' ? 'Levels' : 'Home');
    }
}
