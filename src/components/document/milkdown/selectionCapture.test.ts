import { describe, expect, it } from 'vitest';
import { snapToWordBoundaries } from './selectionCapture';

describe('snapToWordBoundaries', () => {
  it('leaves a clean word-boundary selection unchanged', () => {
    expect(
      snapToWordBoundaries(
        'The current API (v1) was ',
        'designed rapidly',
        ' and has accumulated',
      ),
    ).toEqual({
      quote: 'designed rapidly',
      prefix: 'The current API (v1) was ',
      suffix: ' and has accumulated',
    });
  });

  it('snaps start when selection begins mid-word (the real bug case)', () => {
    expect(
      snapToWordBoundaries(
        'The current API (v1) was d',
        'esigned rapidly',
        ' and has accumulated',
      ),
    ).toEqual({
      quote: 'designed rapidly',
      prefix: 'The current API (v1) was ',
      suffix: ' and has accumulated',
    });
  });

  it('snaps end when selection ends mid-word', () => {
    expect(
      snapToWordBoundaries(
        'The current API (v1) was ',
        'designed rapid',
        'ly and has accumulated',
      ),
    ).toEqual({
      quote: 'designed rapidly',
      prefix: 'The current API (v1) was ',
      suffix: ' and has accumulated',
    });
  });

  it('snaps both ends when selection straddles two partial words', () => {
    expect(snapToWordBoundaries('prefix b', 'ar ba', 'z suffix')).toEqual({
      quote: 'bar baz',
      prefix: 'prefix ',
      suffix: ' suffix',
    });
  });

  it('does not snap when prefix ends with whitespace (clean boundary)', () => {
    expect(snapToWordBoundaries('some text ', 'here', ' more text')).toEqual({
      quote: 'here',
      prefix: 'some text ',
      suffix: ' more text',
    });
  });

  it('does not snap when suffix starts with whitespace', () => {
    expect(snapToWordBoundaries('prefix ', 'word', ' suffix')).toEqual({
      quote: 'word',
      prefix: 'prefix ',
      suffix: ' suffix',
    });
  });

  it('handles empty prefix and suffix', () => {
    expect(snapToWordBoundaries('', 'designed rapidly', '')).toEqual({
      quote: 'designed rapidly',
      prefix: '',
      suffix: '',
    });
  });

  it('does not snap when quote starts after a non-word char in prefix', () => {
    // prefix ends with '(' which is not \w, so no snap needed
    expect(snapToWordBoundaries('some text (', 'word', ') more')).toEqual({
      quote: 'word',
      prefix: 'some text (',
      suffix: ') more',
    });
  });

  it('handles a quote that is a single character mid-word', () => {
    // 'e' from 'designed' — should pull the surrounding word
    expect(snapToWordBoundaries('d', 'esign', 'ed')).toEqual({
      quote: 'designed',
      prefix: '',
      suffix: '',
    });
  });
});
