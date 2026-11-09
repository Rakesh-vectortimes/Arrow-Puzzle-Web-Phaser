import {
    ArrowLine,
    canClearWithoutCollision,
    escapeTravelFor,
    firstBlockAlongPath,
} from './arrowLine';
import {
    BLOCKER_FLASH,
    HIT_SLOP,
    IMPACT_OVERLAP,
    MAX_HEARTS,
    MAX_HINTS,
    WORLD_MARGIN,
} from './feel';
import { boundsOfPoints, minDistanceToPolyline, rayDistanceToRectEdge, type Rect, type Vec } from './geom';
import { allPoints, type LevelData } from './level';

export type PlayState = 'playing' | 'won' | 'failed';

export interface SessionSnapshot {
    levelId: number;
    clearedIds: string[];
    blockedIds: string[];
    hearts: number;
    hints: number;
    heartsLost: number;
}

export interface BoardFeedback {
    tap?: () => void;
    escape?: () => void;
    wrong?: () => void;
    lose?: () => void;
    win?: () => void;
    hint?: () => void;
}

export function sessionIsFresh(session: SessionSnapshot): boolean {
    return session.clearedIds.length === 0
        && session.blockedIds.length === 0
        && session.heartsLost === 0
        && session.hints >= MAX_HINTS;
}

/**
 * Rules ported from the Flutter BoardController: a tap either slides an
 * arrow off the board or bumps it into the one blocking its head.
 */
export class BoardController {
    lines: ArrowLine[] = [];
    state: PlayState = 'playing';
    hintedId: string | null = null;
    guidesVisible = false;
    guideLineId: string | null = null;
    hearts = MAX_HEARTS;
    hints = MAX_HINTS;
    heartsLost = 0;
    impactCount = 0;
    level: LevelData | null = null;
    worldBounds: Rect = { left: 0, top: 0, right: 0, bottom: 0 };

    feedback: BoardFeedback | null = null;
    onProgress: (() => void) | null = null;
    onChange: (() => void) | null = null;

    private hintLeft = 0;

    get hasMovingLines(): boolean {
        return this.lines.some((line) => line.isAnimating);
    }

    get isBusy(): boolean {
        return this.lines.some((line) => line.isAnimating || line.flashSeconds > 0) || this.hintLeft > 0;
    }

    get remainingLines(): number {
        return this.lines.filter((line) => !line.isGone).length;
    }

    get starsEarned(): number {
        if (this.heartsLost <= 0) return 3;
        if (this.heartsLost === 1) return 2;
        return 1;
    }

    get linesThatCanClear(): ArrowLine[] {
        return this.lines.filter((line) => line.isClickable && canClearWithoutCollision(line, this.lines));
    }

    lineById(id: string): ArrowLine | undefined {
        return this.lines.find((line) => line.id === id);
    }

    hitTest(gridPos: Vec, slop = HIT_SLOP): string | null {
        let bestId: string | null = null;
        let bestDist = slop;
        for (const line of this.lines) {
            if (line.isGone || line.points.length < 2) continue;
            if (line.motion === 'rebounding') continue;
            const body = minDistanceToPolyline(gridPos, line.points);
            const head = Math.hypot(gridPos.x - line.head.x, gridPos.y - line.head.y);
            const dist = body < head ? body : head;
            if (dist < bestDist) {
                bestDist = dist;
                bestId = line.id;
            }
        }
        return bestId;
    }

    get session(): SessionSnapshot | null {
        const level = this.level;
        if (!level) return null;
        return {
            levelId: level.id,
            clearedIds: this.lines
                .filter((line) => line.isGone || line.motion === 'escaping')
                .map((line) => line.id),
            blockedIds: this.lines
                .filter((line) => line.blocked && !line.isGone)
                .map((line) => line.id),
            hearts: this.hearts,
            hints: this.hints,
            heartsLost: this.heartsLost,
        };
    }

    loadLevel(level: LevelData, resume?: SessionSnapshot | null): void {
        this.level = level;
        this.lines = level.pieces.map((piece) => ArrowLine.fromPiece(piece));
        this.worldBounds = boundsOfPoints(allPoints(level), WORLD_MARGIN);
        for (const line of this.lines) {
            const head = line.originPoints[line.originPoints.length - 1];
            line.edgeDistance = rayDistanceToRectEdge(head, line.travelDirection, this.worldBounds);
        }
        this.state = 'playing';
        this.hintedId = null;
        this.hintLeft = 0;
        this.guidesVisible = false;
        this.guideLineId = null;
        this.impactCount = 0;
        if (resume && this.restore(level, resume)) {
            this.heartsLost = resume.heartsLost;
            this.hearts = Math.max(0, Math.min(MAX_HEARTS, resume.hearts));
            this.hints = Math.max(0, Math.min(MAX_HINTS, resume.hints));
        } else {
            this.heartsLost = 0;
            this.hearts = MAX_HEARTS;
            this.hints = MAX_HINTS;
        }
        this.emit();
    }

    private restore(level: LevelData, resume: SessionSnapshot): boolean {
        if (resume.levelId !== level.id) return false;
        if (resume.hearts <= 0) return false;
        const cleared = new Set(resume.clearedIds);
        const blocked = new Set(resume.blockedIds);
        const playable = this.lines.filter((line) => !cleared.has(line.id));
        if (playable.length === 0) return false;
        for (const line of this.lines) {
            if (cleared.has(line.id)) {
                line.consumed = line.originLength;
                line.motion = 'completed';
            } else if (blocked.has(line.id)) {
                line.blocked = true;
            }
        }
        return true;
    }

    resetLevel(): void {
        if (this.level) this.loadLevel(this.level);
    }

    onTapLine(lineId: string): 'ignored' | 'started' {
        if (this.state !== 'playing') return 'ignored';
        const line = this.lineById(lineId);
        if (!line || !line.isClickable) return 'ignored';
        const hit = firstBlockAlongPath(line, this.lines);
        if (!hit) {
            const travel = escapeTravelFor(line, this.lines);
            line.beginEscape(travel, Math.min(line.edgeDistance, travel * 0.9));
            this.feedback?.tap?.();
        } else {
            line.beginStrike(hit.distance + IMPACT_OVERLAP, hit.blockerId);
            this.feedback?.tap?.();
        }
        this.emit();
        return 'started';
    }

    tick(dt: number): void {
        if (this.state !== 'playing') return;
        let left = Math.max(0, Math.min(0.05, dt));
        if (left <= 0) return;
        const step = 1 / 120;
        let moved = false;
        while (left > 0) {
            const slice = left > step ? step : left;
            if (this.advance(slice)) moved = true;
            left -= slice;
            if (this.state !== 'playing') {
                this.emit();
                return;
            }
        }
        if (moved) this.emit();
    }

    /** Hint highlight countdown. Runs even while the board is still. */
    updateTimers(dt: number): void {
        if (this.hintLeft <= 0) return;
        this.hintLeft -= dt;
        if (this.hintLeft <= 0) {
            this.hintLeft = 0;
            this.hintedId = null;
            this.emit();
        }
    }

    private advance(dt: number): boolean {
        const busy = this.lines.some((line) => line.isAnimating || line.flashSeconds > 0);
        if (!busy) return false;
        for (const line of this.lines) {
            if (!line.isAnimating && line.flashSeconds <= 0) continue;
            line.tick(dt);
            if (line.leftBoardThisTick) this.feedback?.escape?.();
            if (line.clearedThisTick) this.onProgress?.();
            if (line.struckThisTick) this.onImpact(line);
        }
        if (this.state === 'playing' && this.lines.every((line) => line.isCompleted)) {
            this.state = 'won';
            this.feedback?.win?.();
        }
        return true;
    }

    showHint(): boolean {
        if (this.state !== 'playing') return false;
        if (this.hints <= 0) return false;
        const options = this.linesThatCanClear.slice();
        if (options.length === 0) return false;
        this.hints -= 1;
        options.sort((a, b) => a.originLength - b.originLength);
        this.hintedId = options[0].id;
        this.hintLeft = 3;
        this.feedback?.hint?.();
        this.onProgress?.();
        this.emit();
        return true;
    }

    toggleGuides(): boolean {
        if (this.state !== 'playing') return false;
        this.guidesVisible = !this.guidesVisible;
        this.emit();
        return true;
    }

    setGuideLine(lineId: string | null): void {
        if (this.guideLineId === lineId) return;
        this.guideLineId = lineId;
        this.emit();
    }

    private onImpact(line: ArrowLine): void {
        line.blocked = true;
        const blocker = line.blockerId ? this.lineById(line.blockerId) : undefined;
        if (blocker) blocker.flashSeconds = BLOCKER_FLASH;
        this.impactCount += 1;
        this.heartsLost += 1;
        if (this.hearts > 0) this.hearts -= 1;
        if (this.hearts <= 0) {
            this.state = 'failed';
            this.feedback?.lose?.();
        } else {
            this.feedback?.wrong?.();
        }
        this.onProgress?.();
    }

    private emit(): void {
        this.onChange?.();
    }
}
