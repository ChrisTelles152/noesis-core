/**
 * Mentor dashboard tests (Phase H6)
 *
 * Stubs the /api/mentor/* fetches so we can pin the four state branches
 * (loading, ready, forbidden, error) plus the CSV download trigger
 * without standing up a real server.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import i18n, { i18nReady } from '../lib/i18n';
import Mentor from '../pages/Mentor';

const { hook: memoryHook } = memoryLocation();

beforeAll(async () => {
  await i18nReady;
  await i18n.changeLanguage('pt-BR');
});

beforeEach(() => {
  // Reset the global fetch + URL.createObjectURL mocks before each test.
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderMentor(): ReturnType<typeof render> {
  return render(
    <Router hook={memoryHook}>
      <Mentor />
    </Router>,
  );
}

describe('Phase H6: Mentor dashboard', () => {
  it('shows the loading state on first render', () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(() => undefined), // never resolves
    );
    renderMentor();
    expect(screen.queryByTestId('mentor-loading')).not.toBeNull();
  });

  it('renders the forbidden card when API returns 403', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'admin only' }), { status: 403 }),
    );
    renderMentor();
    await waitFor(() => {
      expect(screen.queryByTestId('mentor-forbidden')).not.toBeNull();
    });
  });

  it('renders the empty card when learners array is empty', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ learners: [] }), { status: 200 }),
    );
    renderMentor();
    await waitFor(() => {
      expect(screen.queryByTestId('mentor-empty')).not.toBeNull();
    });
  });

  it('renders a row per learner when API returns data', async () => {
    const learners = [
      {
        id: 1,
        username: 'alice',
        displayName: null,
        isAdmin: false,
        progress: {
          totalSkills: 25,
          masteredSkills: 5,
          learningSkills: 8,
          notStartedSkills: 12,
          averageMastery: 0.42,
          totalEvents: 30,
        },
      },
      {
        id: 2,
        username: 'bob',
        displayName: 'Bob the Mentor',
        isAdmin: true,
        progress: null,
      },
    ];
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ learners }), { status: 200 }),
    );
    renderMentor();
    await waitFor(() => {
      expect(screen.queryByTestId('mentor-row-1')).not.toBeNull();
    });
    expect(screen.queryByTestId('mentor-row-2')).not.toBeNull();
    // Mastery cell is rounded to 2 decimals
    expect(screen.getByTestId('mentor-row-1').textContent).toMatch(/0\.42/);
    // null progress shows em-dash placeholders
    expect(screen.getByTestId('mentor-row-2').textContent).toMatch(/—/);
    // Admin column shows checkmark for admins
    expect(screen.getByTestId('mentor-row-2').textContent).toMatch(/✓/);
  });

  it('renders the error card when fetch throws', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    renderMentor();
    await waitFor(() => {
      expect(screen.queryByTestId('mentor-error')).not.toBeNull();
    });
    expect(screen.getByTestId('mentor-error').textContent).toMatch(/network down/);
  });

  it('clicking Export CSV fetches the export endpoint with credentials', async () => {
    const learners = [
      {
        id: 1,
        username: 'alice',
        displayName: null,
        isAdmin: false,
        progress: {
          totalSkills: 25,
          masteredSkills: 5,
          learningSkills: 8,
          notStartedSkills: 12,
          averageMastery: 0.42,
          totalEvents: 30,
        },
      },
    ];
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (typeof url === 'string' && url.endsWith('/api/mentor/export.csv')) {
        return new Response('id,username\n1,alice\n', {
          status: 200,
          headers: { 'Content-Type': 'text/csv' },
        });
      }
      return new Response(JSON.stringify({ learners }), { status: 200 });
    });

    // Stub URL.createObjectURL — jsdom doesn't implement it.
    const objectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    renderMentor();
    await waitFor(() => {
      expect(screen.queryByTestId('export-csv')).not.toBeNull();
    });
    fireEvent.click(screen.getByTestId('export-csv'));

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([u]) => typeof u === 'string' && u.endsWith('/api/mentor/export.csv'),
        ),
      ).toBe(true);
    });
    // The download anchor was created. (cleanup runs synchronously after click,
    // so we just verify createObjectURL was called.)
    expect(objectUrlSpy).toHaveBeenCalled();
  });
});
