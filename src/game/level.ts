import type { Vec } from './geom';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Piece {
    id: string;
    points: Vec[];
}

export interface LevelData {
    id: number;
    pieces: Piece[];
    difficulty: Difficulty;
}

let total = 500;

export function totalLevels(): number {
    return total;
}

export function difficultyForId(id: number): Difficulty {
    const slot = (id - 1) % 10;
    if (slot < 3) return 'easy';
    if (slot < 6) return 'normal';
    return 'hard';
}

export function difficultyLabel(difficulty: Difficulty): string {
    if (difficulty === 'easy') return 'Easy';
    if (difficulty === 'hard') return 'Hard';
    return 'Normal';
}

export function asset(path: string): string {
    const base = import.meta.env.BASE_URL || './';
    const prefix = base.endsWith('/') ? base : `${base}/`;
    return `${prefix}${path.replace(/^\//, '')}`;
}

interface RawCell {
    row: number;
    col: number;
}

interface RawPiece {
    id: string;
    points?: { x: number; y: number }[];
    cells?: RawCell[];
    exitDirection?: string;
}

function directionStep(name: string): Vec {
    switch (name) {
        case 'up':
            return { x: 0, y: -1 };
        case 'down':
            return { x: 0, y: 1 };
        case 'left':
            return { x: -1, y: 0 };
        case 'right':
            return { x: 1, y: 0 };
        default:
            throw new Error(`Unknown direction: ${name}`);
    }
}

function pieceFromJson(json: RawPiece): Piece {
    if (json.points && json.points.length > 0) {
        return {
            id: json.id,
            points: json.points.map((point) => ({ x: point.x, y: point.y })),
        };
    }
    const cells = json.cells ?? [];
    let points = cells.map((cell) => ({ x: cell.col + 0.5, y: cell.row + 0.5 }));
    if (points.length === 1 && json.exitDirection) {
        const dir = directionStep(json.exitDirection);
        const first = points[0];
        points = [
            { x: first.x - dir.x * 0.5, y: first.y - dir.y * 0.5 },
            first,
        ];
    }
    return { id: json.id, points };
}

export function parseLevel(json: {
    id: number;
    pieces: RawPiece[];
}): LevelData {
    return {
        id: json.id,
        pieces: json.pieces.map(pieceFromJson),
        difficulty: difficultyForId(json.id),
    };
}

export function allPoints(level: LevelData): Vec[] {
    return level.pieces.flatMap((piece) => piece.points);
}

export async function loadCatalog(): Promise<void> {
    try {
        const response = await fetch(asset('levels/difficulty_index.txt'));
        if (!response.ok) return;
        const text = (await response.text()).trim();
        if (text.length > 0) total = text.length;
    } catch {
        total = 500;
    }
}

export async function fetchLevel(id: number): Promise<LevelData> {
    if (id < 1 || id > total) {
        throw new Error(`Level ${id} is out of range (1–${total}).`);
    }
    const padded = String(id).padStart(4, '0');
    const response = await fetch(asset(`levels/level_${padded}.json`));
    if (!response.ok) {
        throw new Error(`Missing level file for level ${id}.`);
    }
    const json = await response.json() as { id: number; pieces: RawPiece[] };
    return parseLevel(json);
}
