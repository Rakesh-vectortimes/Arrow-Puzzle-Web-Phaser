import { setPlatformMuted, setPlatformPaused } from './audio';
import { useRemoteStore } from './progress';

const SAVE_KEY = 'arrow-puzzle-web-v1';

interface PlaygamaBridge {
    initialize: () => Promise<void> | void;
    EVENT_NAME?: {
        PAUSE_STATE_CHANGED?: string;
        AUDIO_STATE_CHANGED?: string;
    };
    platform?: {
        sendMessage: (name: string, data?: object) => Promise<unknown> | void;
        isAudioEnabled?: boolean;
        isPaused?: boolean;
        language?: string;
        on: (event: string, cb: (value: boolean) => void) => void;
    };
    storage?: {
        get: (keys: string[]) => Promise<unknown[] | null>;
        set: (keys: string[], values: unknown[]) => Promise<void>;
    };
    advertisement?: {
        showInterstitial?: (placement?: string) => Promise<unknown> | void;
    };
}

declare global {
    interface Window {
        bridge?: PlaygamaBridge;
    }
}

let ready = false;
let announced = false;

/** Platform language. The game stays English; this is read so the host can see we asked. */
export let platformLanguage = 'en';

function bridge(): PlaygamaBridge | undefined {
    return window.bridge;
}

function settle<T>(value: T | Promise<T> | void): void {
    if (value && typeof (value as Promise<T>).then === 'function') {
        void (value as Promise<T>).catch(() => {
            /* A rejected host call should not break the puzzle. */
        });
    }
}

function wire(api: PlaygamaBridge): void {
    const platform = api.platform;
    if (platform) {
        platformLanguage = platform.language || 'en';
        if (platform.isAudioEnabled === false) setPlatformMuted(true);
        if (platform.isPaused) setPlatformPaused(true);
        const pauseEvent = api.EVENT_NAME?.PAUSE_STATE_CHANGED ?? 'pause_state_changed';
        const audioEvent = api.EVENT_NAME?.AUDIO_STATE_CHANGED ?? 'audio_state_changed';
        platform.on(pauseEvent, (isPaused) => setPlatformPaused(Boolean(isPaused)));
        platform.on(audioEvent, (isEnabled) => setPlatformMuted(!isEnabled));
    }
    if (api.storage) {
        const storage = api.storage;
        useRemoteStore({
            async get() {
                const data = await storage.get([SAVE_KEY]);
                return data?.[0] ?? null;
            },
            async set(value) {
                await storage.set([SAVE_KEY], [JSON.stringify(value)]);
            },
        });
    }
}

/** Start the host bridge before Phaser. A missing or slow CDN still lets the game run. */
export function initPlatform(): Promise<void> {
    const api = bridge();
    if (!api?.initialize) return Promise.resolve();
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        const timer = window.setTimeout(finish, 4000);
        Promise.resolve(api.initialize())
            .then(() => {
                if (settled) return;
                ready = true;
                wire(api);
                window.clearTimeout(timer);
                finish();
            })
            .catch(() => {
                window.clearTimeout(timer);
                finish();
            });
    });
}

export function sendMessage(name: string, data?: Record<string, string>): void {
    const platform = bridge()?.platform;
    if (!ready || !platform) return;
    try {
        settle(platform.sendMessage(name, data));
    } catch {
        /* The host may reject unknown messages. */
    }
}

export function announceReady(): void {
    document.getElementById('boot')?.remove();
    if (announced) return;
    announced = true;
    sendMessage('game_ready');
}

export function showInterstitial(placement: string): void {
    const show = bridge()?.advertisement?.showInterstitial;
    if (!ready || !show) return;
    try {
        settle(show(placement));
    } catch {
        /* Ads are optional. The result card still shows. */
    }
}
