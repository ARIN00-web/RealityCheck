import { describe, expect, it } from 'vitest';
import {
  extractExplorationCandidates,
  extractExplorationCandidatesWithSummary,
  isSafeBrowserAction,
} from './runner.js';

describe('extractExplorationCandidates', () => {
  it('extracts visible same-origin links and ordinary buttons from a controlled fixture', () => {
    expect(
      extractExplorationCandidates(
        [
          {
            kind: 'link',
            href: 'https://fixture.example/catalog',
            label: 'Catalog',
            index: 0,
            visible: true,
          },
          { kind: 'button', label: 'Show details', index: 0, visible: true },
          { kind: 'button', label: 'Open menu', index: 1, visible: true, roleButton: true },
          {
            kind: 'link',
            href: 'https://outside.example/',
            label: 'Outside',
            index: 1,
            visible: true,
          },
          { kind: 'button', label: 'Submit', index: 1, visible: true, inForm: true, submit: true },
        ],
        'https://fixture.example',
      ),
    ).toEqual([
      { id: 'link-0', kind: 'navigate', href: 'https://fixture.example/catalog', label: 'Catalog' },
      {
        id: 'button-0',
        kind: 'click',
        selector: 'button, [role="button"]',
        index: 0,
        label: 'Show details',
      },
      {
        id: 'button-1',
        kind: 'click',
        selector: 'button, [role="button"]',
        index: 1,
        label: 'Open menu',
      },
    ]);
  });

  it('returns no candidates for a block-like page with only cross-origin or form controls', () => {
    expect(
      extractExplorationCandidates(
        [
          {
            kind: 'link',
            href: 'https://outside.example/',
            label: 'Continue',
            index: 0,
            visible: true,
          },
          { kind: 'button', label: 'Verify', index: 0, visible: true, inForm: true, submit: true },
        ],
        'https://fixture.example',
      ),
    ).toEqual([]);
  });

  it('reports safe diagnostic rejection counts without retaining page content', () => {
    expect(
      extractExplorationCandidatesWithSummary(
        [
          {
            kind: 'link',
            href: 'https://outside.example/',
            label: 'Outside',
            index: 0,
            visible: true,
          },
          { kind: 'button', label: 'Hidden', index: 0, visible: false },
          { kind: 'button', label: 'Submit', index: 1, visible: true, inForm: true },
        ],
        'https://fixture.example',
      ).candidateSummary,
    ).toEqual({
      anchors: 1,
      buttons: 2,
      roleButtons: 0,
      eligible: 0,
      rejected: { cross_origin: 1, not_visible: 1, form_control: 1 },
    });
  });

  it('rejects authentication and destructive controls before execution', () => {
    expect(
      isSafeBrowserAction({ id: 'sign-in', kind: 'click', selector: 'button', label: 'Sign In' }),
    ).toBe(false);
    expect(
      isSafeBrowserAction({
        id: 'delete',
        kind: 'click',
        selector: 'button',
        label: 'Delete account',
      }),
    ).toBe(false);
    expect(
      isSafeBrowserAction({
        id: 'details',
        kind: 'click',
        selector: 'button',
        label: 'Show details',
      }),
    ).toBe(true);
  });
});
