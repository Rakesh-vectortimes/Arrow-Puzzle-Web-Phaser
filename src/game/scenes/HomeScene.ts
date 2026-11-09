import { Scene, type GameObjects } from 'phaser';
import { playSfx } from '../audio';
import { announceReady } from '../bridge';
import { BLUE, FONT, SHELL, SHELL_INK, SHELL_MUTED, WHITE, css } from '../feel';
import { progress } from '../progress';
import { dp, layoutFrame, safeBottom, safeLeft, safeRight, safeTop } from '../screen';
import { button, navBar } from '../widgets';

export class HomeScene extends Scene {
    private ui!: GameObjects.Container;
    private confirming = false;

    constructor() {
        super('Home');
    }

    create(): void {
        this.cameras.main.setBackgroundColor(css(SHELL));
        this.ui = this.add.container(0, 0);
        this.scale.on('resize', this.draw, this);
        this.events.once('shutdown', () => this.scale.off('resize', this.draw, this));
        this.draw();
        announceReady();
    }

    private draw(): void {
        this.ui.removeAll(true);
        const width = this.scale.width;
        const height = this.scale.height;
        const frame = layoutFrame(width, height);
        const ink = css(SHELL_INK);
        const nav = dp(64) + safeBottom();
        const side = Math.max(safeLeft(), safeRight());
        const titleSize = frame.short ? 28 : frame.phone ? 34 : frame.desktop ? 52 : 42;
        const soundH = dp(frame.short ? 34 : 40);
        const soundY = safeTop() + dp(frame.short ? 8 : 18) + soundH / 2;
        const titleY = soundY + soundH / 2 + dp(frame.short ? 32 : frame.phone ? 56 : 72);
        const showTag = frame.cssH >= 460;
        this.ui.add(this.add.text(width / 2, titleY, 'Arrow Escape', {
            fontFamily: FONT,
            fontSize: `${dp(titleSize)}px`,
            color: ink,
            fontStyle: 'bold',
        }).setOrigin(0.5));
        if (showTag) {
            this.ui.add(this.add.text(width / 2, titleY + dp(frame.phone ? 36 : 46), 'Puzzles that find their way out.', {
                fontFamily: FONT,
                fontSize: `${dp(frame.phone ? 14 : 16)}px`,
                color: css(SHELL_MUTED),
            }).setOrigin(0.5));
        }

        const level = progress.continueLevelId();
        const inProgress = progress.continueIsInProgress();
        const started = inProgress || progress.highest > 1;
        const subtitle = inProgress ? `Level ${level} · in progress` : `Level ${level}`;
        const buttonW = Math.min(dp(frame.desktop ? 460 : 420), width - side * 2 - dp(32));
        const playH = dp(frame.short ? 52 : 64);
        const restartH = dp(frame.short ? 46 : 56);
        const gap = dp(frame.short ? 10 : 16);
        const block = playH + gap + restartH;
        const minPlayY = (showTag ? titleY + dp(frame.phone ? 36 : 46) : titleY) + dp(frame.short ? 36 : 56) + playH / 2;
        const maxPlayY = height - nav - dp(16) - block + playH / 2;
        const playY = maxPlayY < minPlayY
            ? maxPlayY
            : Math.max(minPlayY, Math.min(height * (frame.short ? 0.48 : 0.56), maxPlayY));
        this.ui.add(button(
            this,
            width / 2,
            playY,
            buttonW,
            playH,
            started ? 'Continue' : 'Play',
            () => this.scene.start('Play', { levelId: level, from: 'home' }),
            { fill: BLUE, text: '#ffffff', subtitle, fontSize: frame.short ? 16 : 18 },
        ));
        this.ui.add(button(
            this,
            width / 2,
            playY + playH / 2 + gap + restartH / 2,
            buttonW,
            restartH,
            'Restart Game',
            () => {
                this.confirming = true;
                this.draw();
            },
            { fill: WHITE, text: css(BLUE), border: 0xe6eaf0, fontSize: frame.short ? 15 : 18 },
        ));

        const soundLabel = progress.soundEnabled ? 'Sound on' : 'Sound off';
        this.ui.add(button(
            this,
            width / 2,
            soundY,
            dp(frame.short ? 128 : 148),
            soundH,
            soundLabel,
            () => {
                progress.soundEnabled = !progress.soundEnabled;
                playSfx('button');
                this.draw();
            },
            { fill: WHITE, text: css(SHELL_INK), border: 0xe6eaf0, fontSize: 15, quiet: true },
        ));

        navBar(this, this.ui, 'home', width, height);
        if (this.confirming) this.drawConfirm(width, height);
    }

    private drawConfirm(width: number, height: number): void {
        const dim = this.add.graphics();
        dim.fillStyle(0x1b1f3b, 0.35);
        dim.fillRect(0, 0, width, height);
        this.ui.add(dim);
        const side = Math.max(safeLeft(), safeRight());
        const cardW = Math.min(dp(360), width - side * 2 - dp(28));
        const cardH = Math.min(dp(230), height - safeTop() - safeBottom() - dp(24));
        const card = this.add.graphics();
        card.fillStyle(WHITE, 1);
        card.fillRoundedRect(width / 2 - cardW / 2, height / 2 - cardH / 2, cardW, cardH, dp(24));
        this.ui.add(card);
        this.ui.add(this.add.text(width / 2, height / 2 - cardH * 0.3, 'Restart Game', {
            fontFamily: FONT,
            fontSize: `${dp(22)}px`,
            color: css(SHELL_INK),
            fontStyle: 'bold',
        }).setOrigin(0.5));
        this.ui.add(this.add.text(width / 2, height / 2 - cardH * 0.08, 'Start over from level 1?\nCleared levels and stars on\nthis device will be reset.', {
            fontFamily: FONT,
            fontSize: `${dp(15)}px`,
            color: css(SHELL_MUTED),
            align: 'center',
            wordWrap: { width: cardW - dp(36) },
        }).setOrigin(0.5));
        const btnW = Math.min(dp(130), (cardW - dp(36)) / 2);
        const btnH = Math.min(dp(46), cardH * 0.22);
        const pair = btnW * 2 + dp(12);
        const btnY = height / 2 + cardH * 0.3;
        this.ui.add(button(this, width / 2 - pair / 2 + btnW / 2, btnY, btnW, btnH, 'Cancel', () => {
            this.confirming = false;
            this.draw();
        }, { fill: WHITE, text: css(BLUE), border: 0xe6eaf0, fontSize: 16 }));
        this.ui.add(button(this, width / 2 + pair / 2 - btnW / 2, btnY, btnW, btnH, 'Restart', () => {
            progress.resetAll();
            this.confirming = false;
            this.draw();
        }, { fill: 0xe53935, text: '#ffffff', fontSize: 16 }));
    }
}
