/**
 * Authoring page tests (Phase H7)
 *
 * Walks the create / edit / delete flows against a mocked /api/admin/skills
 * endpoint. The CRUD contract correctness lives in the server tests; these
 * tests cover the page's state machine and that user actions actually fire
 * the right HTTP method.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import i18n, { i18nReady } from '../lib/i18n';
import Authoring from '../pages/Authoring';

const { hook: memoryHook } = memoryLocation();

beforeAll(async () => {
  await i18nReady;
  await i18n.changeLanguage('pt-BR');
});

beforeEach(() => {
  vi.restoreAllMocks();
  // Default confirm dialog → yes, so delete tests don't depend on it.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderAuthoring(): ReturnType<typeof render> {
  return render(
    <Router hook={memoryHook}>
      <Authoring />
    </Router>
  );
}

describe('Phase H7: Authoring page', () => {
  it('shows the loading state on first render', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => undefined));
    renderAuthoring();
    expect(screen.queryByTestId('authoring-loading')).not.toBeNull();
  });

  it('renders the forbidden card when API returns 403', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'admin only' }), { status: 403 })
    );
    renderAuthoring();
    await waitFor(() => {
      expect(screen.queryByTestId('authoring-forbidden')).not.toBeNull();
    });
  });

  it('renders the empty state when the curriculum has no skills', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ skills: [] }), { status: 200 })
    );
    renderAuthoring();
    await waitFor(() => {
      expect(screen.queryByTestId('authoring-empty')).not.toBeNull();
    });
  });

  it('renders one row per skill in the loaded curriculum', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          skills: [
            { id: 'sk_a', name: 'Skill A', prerequisites: [] },
            { id: 'sk_b', name: 'Skill B', prerequisites: ['sk_a'] },
          ],
        }),
        { status: 200 }
      )
    );
    renderAuthoring();
    await waitFor(() => {
      expect(screen.queryByTestId('skill-row-sk_a')).not.toBeNull();
    });
    expect(screen.queryByTestId('skill-row-sk_b')).not.toBeNull();
    // Prereq line shown for B
    expect(screen.getByTestId('skill-row-sk_b').textContent).toMatch(/sk_a/);
  });

  it('clicking Save fires POST /api/admin/skills with the form payload', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (
        typeof url === 'string' &&
        url === '/api/admin/skills' &&
        (init?.method ?? 'GET') === 'POST'
      ) {
        return new Response(
          JSON.stringify({ skill: { id: 'sk_new', name: 'New' }, skillCount: 1 }),
          { status: 201 }
        );
      }
      // Default GET → empty list
      return new Response(JSON.stringify({ skills: [] }), { status: 200 });
    });
    renderAuthoring();
    await waitFor(() => {
      expect(screen.queryByTestId('authoring-create')).not.toBeNull();
    });
    fireEvent.change(screen.getByTestId('new-id'), { target: { value: 'sk_new' } });
    fireEvent.change(screen.getByTestId('new-name'), { target: { value: 'New' } });
    fireEvent.click(screen.getByTestId('create-skill'));
    await waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        ([u, i]) =>
          typeof u === 'string' && u === '/api/admin/skills' && (i?.method ?? 'GET') === 'POST'
      );
      expect(postCall).toBeDefined();
    });
  });

  it('Save button disabled when id or name is empty', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ skills: [] }), { status: 200 })
    );
    renderAuthoring();
    await waitFor(() => {
      expect(screen.queryByTestId('create-skill')).not.toBeNull();
    });
    const button = screen.getByTestId('create-skill') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    // Provide id only — still disabled
    fireEvent.change(screen.getByTestId('new-id'), { target: { value: 'sk_x' } });
    expect((screen.getByTestId('create-skill') as HTMLButtonElement).disabled).toBe(true);
    // Provide name → enabled
    fireEvent.change(screen.getByTestId('new-name'), { target: { value: 'X' } });
    expect((screen.getByTestId('create-skill') as HTMLButtonElement).disabled).toBe(false);
  });

  it('clicking Edit reveals the inline form, Save fires PUT', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (
        typeof url === 'string' &&
        url.startsWith('/api/admin/skills/') &&
        init?.method === 'PUT'
      ) {
        return new Response(JSON.stringify({ skill: { id: 'sk_a', name: 'Renamed' } }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          skills: [{ id: 'sk_a', name: 'Skill A', prerequisites: [] }],
        }),
        { status: 200 }
      );
    });
    renderAuthoring();
    await waitFor(() => {
      expect(screen.queryByTestId('skill-row-sk_a')).not.toBeNull();
    });
    fireEvent.click(screen.getByTestId('edit-sk_a'));
    expect(screen.queryByTestId('edit-name-sk_a')).not.toBeNull();
    fireEvent.change(screen.getByTestId('edit-name-sk_a'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByTestId('save-sk_a'));
    await waitFor(() => {
      const putCall = fetchSpy.mock.calls.find(
        ([u, i]) => typeof u === 'string' && u === '/api/admin/skills/sk_a' && i?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
    });
  });

  it('clicking Delete fires DELETE after confirm', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (
        typeof url === 'string' &&
        url.startsWith('/api/admin/skills/') &&
        init?.method === 'DELETE'
      ) {
        return new Response(JSON.stringify({ deleted: 'sk_a', skillCount: 0 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ skills: [{ id: 'sk_a', name: 'A', prerequisites: [] }] }),
        { status: 200 }
      );
    });
    renderAuthoring();
    await waitFor(() => {
      expect(screen.queryByTestId('delete-sk_a')).not.toBeNull();
    });
    fireEvent.click(screen.getByTestId('delete-sk_a'));
    await waitFor(() => {
      const delCall = fetchSpy.mock.calls.find(
        ([u, i]) =>
          typeof u === 'string' && u === '/api/admin/skills/sk_a' && i?.method === 'DELETE'
      );
      expect(delCall).toBeDefined();
    });
  });

  it('shows the save error when POST fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (typeof url === 'string' && url === '/api/admin/skills' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'Invalid skill graph' }), { status: 400 });
      }
      return new Response(JSON.stringify({ skills: [] }), { status: 200 });
    });
    renderAuthoring();
    await waitFor(() => {
      expect(screen.queryByTestId('create-skill')).not.toBeNull();
    });
    fireEvent.change(screen.getByTestId('new-id'), { target: { value: 'sk_bad' } });
    fireEvent.change(screen.getByTestId('new-name'), { target: { value: 'Bad' } });
    fireEvent.click(screen.getByTestId('create-skill'));
    await waitFor(() => {
      expect(screen.queryByTestId('save-error')).not.toBeNull();
    });
    expect(screen.getByTestId('save-error').textContent).toMatch(/Invalid skill graph/);
  });
});
