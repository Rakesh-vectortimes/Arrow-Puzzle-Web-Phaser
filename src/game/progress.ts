import { totalLevels } from './level';
import { sessionIsFresh, type SessionSnapshot } from './board';

interface SaveData {
    highest: number;
    completed: number[];
    stars: Record<string, number>;
    session: SessionSnapshot | null;
    lastLevel: number | null;
    sound: boolean;
}

const STORAGE_KEY = 'arrow-puzzle-web-v1';

function emptySave(): SaveData {
    return {
        highest: 1,
        completed: [],
        stars: {},
        session: null,
        lastLevel: null,
        sound: true,
    };
}

type Store = {
    get(key: string): string | null;
    set(key: string, value: string): void;
};

const memoryStore = new Map<string, string>();

const localStore: Store = {
    get(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return memoryStore.get(key) ?? null;
        }
    },
    set(key, value) {
        memoryStore.set(key, value);
        try {
            localStorage.setItem(key, value);
        } catch {
            /* private mode or a full disk */
        }
    },
};

let save = emptySave();

interface RemoteStore {
    get(): Promise<unknown>;
    set(value: unknown): Promise<void>;
}

let remote: RemoteStore | null = null;

/** Playgama storage. When this is set, localStorage is only a fallback. */
export function useRemoteStore(next: RemoteStore): void {
    remote = next;
}

function normalize(parsed: Partial<SaveData>): SaveData {
    return {
        highest: parsed.highest && parsed.highest > 0 ? parsed.highest : 1,
        completed: Array.isArray(parsed.completed) ? parsed.completed.filter((id) => typeof id === 'number') : [],
        stars: parsed.stars && typeof parsed.stars === 'object' ? parsed.stars : {},
        session: parsed.session ?? null,
        lastLevel: parsed.lastLevel ?? null,
        sound: parsed.sound !== false,
    };
}

function fromRaw(raw: unknown): SaveData {
    if (raw == null || raw === '') return emptySave();
    try {
        const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<SaveData>;
        if (!parsed || typeof parsed !== 'object') return emptySave();
        return normalize(parsed);
    } catch {
        return emptySave();
    }
}

function readLocal(): SaveData {
    const raw = localStore.get(STORAGE_KEY);
    if (!raw) return emptySave();
    return fromRaw(raw);
}

function write(): void {
    const payload = JSON.stringify(save);
    if (remote) {
        try {
            void remote.set(save).catch(() => {
                localStore.set(STORAGE_KEY, payload);
            });
        } catch {
            localStore.set(STORAGE_KEY, payload);
        }
        return;
    }
    localStore.set(STORAGE_KEY, payload);
}

/**
 * Load the save before the first scene. Platform storage wins.
 * A local save is copied across once when the platform key is empty.
 */
export async function hydrateProgress(): Promise<void> {
    if (remote) {
        try {
            const raw = await remote.get();
            if (raw != null && raw !== '') {
                save = fromRaw(raw);
                return;
            }
        } catch {
            remote = null;
        }
    }
    save = readLocal();
    if (remote && localStore.get(STORAGE_KEY)) {
        try {
            await remote.set(save);
        } catch {
            /* The in-memory copy still drives this session. */
        }
    }
}

export const progress = {
    get highest(): number {
        return save.highest;
    },
    get soundEnabled(): boolean {
        return save.sound;
    },
    set soundEnabled(value: boolean) {
        save.sound = value;
        write();
    },
    isUnlocked(id: number): boolean {
        return id <= save.highest;
    },
    isCompleted(id: number): boolean {
        return save.completed.includes(id);
    },
    starsFor(id: number): number {
        return save.stars[String(id)] ?? 0;
    },
    get totalStars(): number {
        return Object.values(save.stars).reduce((sum, stars) => sum + stars, 0);
    },
    continueLevelId(): number {
        const total = Math.max(1, totalLevels());
        const session = save.session;
        if (session && !sessionIsFresh(session)) {
            return Math.max(1, Math.min(total, session.levelId));
        }
        return Math.max(1, Math.min(total, save.highest));
    },
    continueIsInProgress(): boolean {
        const id = this.continueLevelId();
        const session = save.session;
        if (!session || session.levelId !== id) return false;
        return !sessionIsFresh(session);
    },
    sessionFor(levelId: number): SessionSnapshot | null {
        const session = save.session;
        if (!session || session.levelId !== levelId) return null;
        if (sessionIsFresh(session)) return null;
        return session;
    },
    rememberLevel(levelId: number): void {
        if (save.lastLevel === levelId) return;
        save.lastLevel = levelId;
        write();
    },
    saveSession(session: SessionSnapshot): void {
        if (sessionIsFresh(session)) return;
        save.session = session;
        save.lastLevel = session.levelId;
        write();
    },
    clearSession(): void {
        save.session = null;
        write();
    },
    markCompleted(id: number, stars: number): void {
        if (!save.completed.includes(id)) save.completed.push(id);
        const clamped = Math.max(1, Math.min(3, stars));
        const key = String(id);
        if (clamped > (save.stars[key] ?? 0)) save.stars[key] = clamped;
        if (id >= save.highest) save.highest = id + 1;
        save.session = null;
        save.lastLevel = id + 1;
        write();
    },
    resetAll(): void {
        save = emptySave();
        write();
    },
};
