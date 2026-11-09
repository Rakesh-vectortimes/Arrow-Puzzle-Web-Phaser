import {
    BODY_RADIUS,
    easeIn,
    easeOut,
    elasticOut,
    escapeDuration,
    EXIT_MARGIN,
    HEAD_RADIUS,
    REBOUND_OVERSHOOT,
} from './feel';
import {
    circleHitsPolyline,
    normalize,
    polylineLength,
    sub,
    trimPolylineFromStart,
    type Vec,
} from './geom';
import type { Piece } from './level';

export type LineMotion = 'idle' | 'escaping' | 'striking' | 'rebounding' | 'completed';

type Curve = (t: number) => number;

export interface PathHit {
    blockerId: string;
    distance: number;
}

/**
 * One arrow. Movement is a single distance, `consumed`: the arrow occupies
 * the window [consumed, consumed + length] of the path that runs
 * tail → head → straight off the board.
 */
export class ArrowLine {
    readonly id: string;
    readonly originPoints: Vec[];
    readonly travelDirection: Vec;

    motion: LineMotion = 'idle';
    consumed = 0;
    edgeDistance = 0;
    blocked = false;
    flashSeconds = 0;
    struckThisTick = false;
    clearedThisTick = false;
    leftBoardThisTick = false;
    blockerId: string | null = null;

    private from = 0;
    private to = 0;
    private elapsed = 0;
    private duration = 0;
    private curve: Curve = (t) => t;
    private impactAt = 0;
    private edgeReportAt = Number.POSITIVE_INFINITY;
    private edgeReported = false;

    private constructor(id: string, origin: Vec[], travelDirection: Vec) {
        this.id = id;
        this.originPoints = origin;
        this.travelDirection = travelDirection;
    }

    static fromPiece(piece: Piece): ArrowLine {
        const origin = pointsFromPiece(piece);
        const travel = origin.length >= 2
            ? normalize(sub(origin[origin.length - 1], origin[origin.length - 2]), { x: 1, y: 0 })
            : { x: 1, y: 0 };
        return new ArrowLine(piece.id, origin, travel);
    }

    get originLength(): number {
        return polylineLength(this.originPoints);
    }

    private get bodyOffset(): number {
        return Math.max(0, Math.min(this.originLength, this.consumed));
    }

    get head(): Vec {
        if (this.originPoints.length === 0) return { x: 0, y: 0 };
        const last = this.originPoints[this.originPoints.length - 1];
        return {
            x: last.x + this.travelDirection.x * this.bodyOffset,
            y: last.y + this.travelDirection.y * this.bodyOffset,
        };
    }

    get isGone(): boolean {
        if (this.motion === 'completed') return true;
        const length = this.originLength;
        return length > 1e-9 && this.consumed >= length - 1e-9;
    }

    get points(): Vec[] {
        if (this.isGone || this.originPoints.length === 0) return [];
        const body = trimPolylineFromStart(this.originPoints, this.bodyOffset);
        if (body.length === 0) return [this.head];
        if (body.length === 1) return [body[0], this.head];
        return [...body.slice(0, -1), this.head];
    }

    get escapeTarget(): number {
        return this.motion === 'escaping' ? this.to : 0;
    }

    get isCompleted(): boolean {
        return this.motion === 'completed';
    }

    get isAnimating(): boolean {
        return this.motion === 'escaping' || this.motion === 'striking' || this.motion === 'rebounding';
    }

    get isClickable(): boolean {
        return this.motion === 'idle' && !this.isGone;
    }

    beginEscape(travel: number, edgeAt: number): void {
        if (!this.isClickable) return;
        this.edgeReported = false;
        this.edgeReportAt = edgeAt;
        this.startTween(this.consumed, Math.max(travel, this.originLength), escapeDuration(travel), easeIn);
        this.motion = 'escaping';
    }

    beginStrike(impactAt: number, blocker: string): void {
        if (!this.isClickable) return;
        this.blockerId = blocker;
        this.impactAt = Math.max(0, impactAt);
        this.startTween(this.consumed, this.impactAt, 0.15, easeOut);
        this.motion = 'striking';
    }

    private startTween(from: number, to: number, duration: number, curve: Curve): void {
        this.from = from;
        this.to = to;
        this.duration = duration;
        this.curve = curve;
        this.elapsed = 0;
    }

    private advanceTween(dt: number): boolean {
        this.elapsed += dt;
        const t = this.duration <= 0 ? 1 : Math.min(1, this.elapsed / this.duration);
        this.consumed = this.from + (this.to - this.from) * this.curve(t);
        return t >= 1;
    }

    tick(dt: number): void {
        this.struckThisTick = false;
        this.clearedThisTick = false;
        this.leftBoardThisTick = false;
        if (this.flashSeconds > 0) this.flashSeconds = Math.max(0, this.flashSeconds - dt);
        if (this.motion === 'escaping') this.tickEscape(dt);
        else if (this.motion === 'striking') {
            if (this.advanceTween(dt)) {
                this.consumed = this.impactAt;
                this.struckThisTick = true;
                this.startTween(this.impactAt, 0, 0.25, elasticOut);
                this.motion = 'rebounding';
            }
        } else if (this.motion === 'rebounding') {
            const done = this.advanceTween(dt);
            if (this.consumed < -REBOUND_OVERSHOOT) this.consumed = -REBOUND_OVERSHOOT;
            if (done) {
                this.consumed = 0;
                this.motion = 'idle';
            }
        }
    }

    private tickEscape(dt: number): void {
        const wasGone = this.isGone;
        const done = this.advanceTween(dt);
        if (!wasGone && this.isGone) this.clearedThisTick = true;
        if (!this.edgeReported && this.consumed >= this.edgeReportAt) {
            this.edgeReported = true;
            this.leftBoardThisTick = true;
        }
        if (done) {
            this.consumed = this.to;
            this.motion = 'completed';
            if (!this.edgeReported) {
                this.edgeReported = true;
                this.leftBoardThisTick = true;
            }
        }
    }
}

export function pointsFromPiece(piece: Piece): Vec[] {
    if (piece.points.length >= 2) return piece.points.map((point) => ({ ...point }));
    if (piece.points.length === 1) {
        return [
            { x: piece.points[0].x - 0.5, y: piece.points[0].y },
            { ...piece.points[0] },
        ];
    }
    return [{ x: 0.5, y: 0.5 }, { x: 1.5, y: 0.5 }];
}

const COLLISION_RADIUS = HEAD_RADIUS + BODY_RADIUS;
const SAMPLE_STEP = 0.04;

export function firstBlockAlongPath(
    line: ArrowLine,
    others: ArrowLine[],
    maxDistance?: number,
): PathHit | null {
    if (line.originPoints.length < 2) return null;
    const limit = maxDistance ?? line.originLength;
    if (limit < 1e-6) return null;
    const start = line.head;
    const direction = line.travelDirection;
    const blockers = others.filter((other) => other.id !== line.id && !other.isGone && other.points.length >= 2);
    const resting = new Set<string>();
    for (const other of blockers) {
        if (circleHitsPolyline(start, COLLISION_RADIUS, other.points)) resting.add(other.id);
    }

    let traveled = 0;
    while (traveled < limit - 1e-6) {
        const remaining = limit - traveled;
        traveled += remaining < SAMPLE_STEP ? remaining : SAMPLE_STEP;
        const center = {
            x: start.x + direction.x * traveled,
            y: start.y + direction.y * traveled,
        };
        for (const other of blockers) {
            const hitting = circleHitsPolyline(center, COLLISION_RADIUS, other.points);
            if (hitting) {
                if (!resting.has(other.id)) return { blockerId: other.id, distance: traveled };
            } else {
                resting.delete(other.id);
            }
        }
    }
    return null;
}

export function canClearWithoutCollision(line: ArrowLine, others: ArrowLine[]): boolean {
    if (line.originPoints.length < 2) return false;
    if (line.originLength < 1e-6) return true;
    return firstBlockAlongPath(line, others) === null;
}

export function escapeTravelFor(line: ArrowLine, others: ArrowLine[]): number {
    const full = line.originLength + line.edgeDistance + EXIT_MARGIN;
    const conflict = firstBlockAlongPath(line, others, full);
    if (!conflict) return full;
    return Math.max(line.originLength, conflict.distance);
}
