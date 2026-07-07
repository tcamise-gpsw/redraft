/**
 * Best-effort vertical placement of comment threads next to their document
 * highlights (issue #8).
 *
 * Each thread wants to sit at `target` (the vertical offset of its highlight,
 * measured relative to the positioning container). Cards have real, variable
 * heights, so naive placement overlaps. This greedy algorithm places cards in
 * ascending target order and pushes each one down just enough to clear the
 * previous card plus a fixed gap — the same label-placement approach used by
 * inline-comment UIs. Output preserves the input order so callers can map
 * placements back to their threads 1:1.
 */

export interface ThreadPlacementInput {
  id: string;
  /** Desired top offset in px, relative to the positioning container. */
  target: number;
  /** Measured card height in px. */
  height: number;
}

export interface ThreadPlacement {
  id: string;
  top: number;
}

export interface PositionOptions {
  /** Minimum vertical gap between stacked cards. Default 12px. */
  gap?: number;
  /** Floor for the first card's top. Default 0. */
  minTop?: number;
}

export interface PositionResult {
  placements: ThreadPlacement[];
  /** Total height the container must reserve to fit every card. */
  height: number;
}

export function positionThreads(
  inputs: ThreadPlacementInput[],
  options: PositionOptions = {},
): PositionResult {
  const gap = options.gap ?? 12;
  const minTop = options.minTop ?? 0;

  if (inputs.length === 0) {
    return { placements: [], height: minTop };
  }

  // Place by ascending target, but remember each item's original index so the
  // returned placements line up with the caller's input order.
  const byTarget = inputs
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.target - b.item.target || a.index - b.index);

  const tops = new Array<number>(inputs.length);
  let cursor = minTop;
  let maxBottom = minTop;

  for (const { item, index } of byTarget) {
    const top = Math.max(item.target, cursor);
    tops[index] = top;
    const bottom = top + Math.max(0, item.height);
    cursor = bottom + gap;
    if (bottom > maxBottom) {
      maxBottom = bottom;
    }
  }

  return {
    placements: inputs.map((item, index) => ({
      id: item.id,
      top: tops[index],
    })),
    height: maxBottom,
  };
}
