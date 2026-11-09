import type { Game, Scene } from 'phaser';
import { progress } from './progress';

let manager: Scene['sound'] | null = null;
let game: Game | null = null;
let platformMuted = false;
let platformPaused = false;

let visibilityBound = false;

function applyHostAudio(): void {
    const silent = platformMuted || document.hidden;
    const paused = platformPaused || document.hidden;
    if (manager) manager.mute = silent;
    if (!game) return;
    if (paused) game.loop.sleep();
    else game.loop.wake();
}

export function bindAudio(scene: Scene): void {
    manager = scene.sound;
    game = scene.game;
    if (!visibilityBound) {
        visibilityBound = true;
        document.addEventListener('visibilitychange', applyHostAudio);
    }
    applyHostAudio();
}

/** Host mute (Playgama audio). Separate from the player's Sound toggle. */
export function setPlatformMuted(muted: boolean): void {
    platformMuted = muted;
    applyHostAudio();
}

/** Host pause. The loop stays asleep until the platform resumes. */
export function setPlatformPaused(paused: boolean): void {
    platformPaused = paused;
    applyHostAudio();
}

export function playSfx(key: string, volume = 1, rate?: number): void {
    if (!progress.soundEnabled || platformMuted || !manager) return;
    try {
        manager.play(key, { volume, rate });
    } catch {
        /* A missing clip should not stop the puzzle. */
    }
}

export function playTap(): void {
    const rate = 0.95 + Math.random() * (1.08 - 0.95);
    playSfx('tap', 1, rate);
}

