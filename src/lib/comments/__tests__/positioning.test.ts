import { describe, expect, it } from 'vitest';

import { positionThreads } from '../positioning';

describe('positionThreads', () => {
  it('returns empty placements and zero height for empty input by default', () => {
    expect(positionThreads([])).toEqual({ placements: [], height: 0 });
  });

  it('returns minTop as the height for empty input when provided', () => {
    expect(positionThreads([], { minTop: 48 })).toEqual({
      placements: [],
      height: 48,
    });
  });

  it('places a single item at max(target, minTop) and reports its bottom edge', () => {
    expect(
      positionThreads([{ id: 'thread-1', target: 24, height: 36 }], {
        minTop: 50,
      }),
    ).toEqual({
      placements: [{ id: 'thread-1', top: 50 }],
      height: 86,
    });
  });

  it('keeps far-apart items exactly at their targets', () => {
    expect(
      positionThreads([
        { id: 'thread-1', target: 100, height: 40 },
        { id: 'thread-2', target: 300, height: 20 },
      ]),
    ).toEqual({
      placements: [
        { id: 'thread-1', top: 100 },
        { id: 'thread-2', top: 300 },
      ],
      height: 320,
    });
  });

  it('pushes overlapping items down by the prior bottom plus the gap', () => {
    expect(
      positionThreads(
        [
          { id: 'thread-1', target: 100, height: 50 },
          { id: 'thread-2', target: 140, height: 30 },
        ],
        { gap: 12 },
      ),
    ).toEqual({
      placements: [
        { id: 'thread-1', top: 100 },
        { id: 'thread-2', top: 162 },
      ],
      height: 192,
    });
  });

  it('respects a custom gap when pushing overlapping items', () => {
    expect(
      positionThreads(
        [
          { id: 'thread-1', target: 100, height: 50 },
          { id: 'thread-2', target: 140, height: 30 },
        ],
        { gap: 20 },
      ),
    ).toEqual({
      placements: [
        { id: 'thread-1', top: 100 },
        { id: 'thread-2', top: 170 },
      ],
      height: 200,
    });
  });

  it('computes placement in target order but returns placements in input order', () => {
    const inputs = [
      { id: 'later-thread', target: 500, height: 40 },
      { id: 'earlier-thread', target: 100, height: 60 },
    ];

    // Placement is solved by ascending target, but the result must still line up
    // with the caller's original input array so ids map back 1:1.
    const result = positionThreads(inputs);

    expect(result).toEqual({
      placements: [
        { id: 'later-thread', top: 500 },
        { id: 'earlier-thread', top: 100 },
      ],
      height: 540,
    });
    expect(result.placements[0].id).toBe(inputs[0].id);
  });

  it('clamps negative targets up to the default minTop of zero', () => {
    expect(
      positionThreads([{ id: 'thread-1', target: -30, height: 25 }]),
    ).toEqual({
      placements: [{ id: 'thread-1', top: 0 }],
      height: 25,
    });
  });

  it('breaks target ties by input index so the earlier item stays on top', () => {
    expect(
      positionThreads([
        { id: 'first-thread', target: 100, height: 40 },
        { id: 'second-thread', target: 100, height: 10 },
      ]),
    ).toEqual({
      placements: [
        { id: 'first-thread', top: 100 },
        { id: 'second-thread', top: 152 },
      ],
      height: 162,
    });
  });

  it('clamps a negative gap to zero so cards never overlap', () => {
    // Negative gaps clamp to zero, so placement matches the zero-gap contract.
    expect(
      positionThreads(
        [
          { id: 'tall-thread', target: 100, height: 300 },
          { id: 'middle-thread', target: 200, height: 10 },
          { id: 'late-thread', target: 300, height: 10 },
        ],
        { gap: -200 },
      ),
    ).toEqual({
      placements: [
        { id: 'tall-thread', top: 100 },
        { id: 'middle-thread', top: 400 },
        { id: 'late-thread', top: 410 },
      ],
      height: 420,
    });
  });

  it('treats zero and negative heights as zero when advancing the cursor', () => {
    expect(
      positionThreads(
        [
          { id: 'zero-height', target: 100, height: 0 },
          { id: 'after-zero', target: 105, height: 10 },
        ],
        { gap: 12 },
      ),
    ).toEqual({
      placements: [
        { id: 'zero-height', top: 100 },
        { id: 'after-zero', top: 112 },
      ],
      height: 122,
    });

    expect(
      positionThreads(
        [
          { id: 'negative-height', target: 100, height: -20 },
          { id: 'after-negative', target: 105, height: 10 },
        ],
        { gap: 12 },
      ),
    ).toEqual({
      placements: [
        { id: 'negative-height', top: 100 },
        { id: 'after-negative', top: 112 },
      ],
      height: 122,
    });
  });
});
