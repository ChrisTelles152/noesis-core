/**
 * Path page tests (Phase H4)
 *
 * Verifies the rendered path covers all 25 skills, gates correctly off
 * persisted diagnostic estimates, and exposes the right CTA/copy per
 * status. The gating *logic* itself is covered by pathStatus.test.ts —
 * here we mostly check the UI surfaces it faithfully.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import i18n, { i18nReady } from '../lib/i18n';
import Path from '../pages/Path';
import { DIAGNOSTIC_ESTIMATES_STORAGE_KEY } from '../pages/Diagnostic';

const { hook: memoryHook } = memoryLocation();

beforeAll(async () => {
  await i18nReady;
  await i18n.changeLanguage('pt-BR');
});

beforeEach(() => {
  localStorage.clear();
});

function renderPath(): ReturnType<typeof render> {
  return render(
    <Router hook={memoryHook}>
      <Path />
    </Router>,
  );
}

describe('Phase H4: Path page', () => {
  it('renders the pt-BR title and subtitle', () => {
    renderPath();
    expect(screen.queryByText('Sua Trilha de Aprendizado')).not.toBeNull();
    expect(screen.queryByText(/Siga a trilha abaixo/)).not.toBeNull();
  });

  it('renders all 25 skill cards from the content pack', () => {
    renderPath();
    // Every skill in the pack should produce a card with data-testid="skill-<id>"
    const cards = document.querySelectorAll('[data-testid^="skill-"]');
    expect(cards.length).toBe(25);
  });

  it('renders skills grouped by category', () => {
    renderPath();
    expect(screen.queryByTestId('category-arithmetic')).not.toBeNull();
    expect(screen.queryByTestId('category-algebra')).not.toBeNull();
    expect(screen.queryByTestId('category-geometry')).not.toBeNull();
    expect(screen.queryByTestId('category-trigonometry')).not.toBeNull();
    expect(screen.queryByTestId('category-functions')).not.toBeNull();
    expect(screen.queryByTestId('category-statistics')).not.toBeNull();
  });

  it('with no diagnostic data: adicao is available, equacoes_quadraticas is locked', () => {
    renderPath();
    const adicaoCard = screen.getByTestId('skill-adicao');
    expect(adicaoCard.getAttribute('data-status')).toBe('available');
    const equCard = screen.getByTestId('skill-equacoes_quadraticas');
    expect(equCard.getAttribute('data-status')).toBe('locked');
  });

  it('locked tile shows a "Faltam: ..." note listing the missing prereqs', () => {
    renderPath();
    // equacoes_quadraticas has unmastered prereqs in the default state →
    // locked-reason note should be rendered.
    const reason = screen.queryByTestId('locked-reason-equacoes_quadraticas');
    expect(reason).not.toBeNull();
    expect(reason!.textContent).toMatch(/Faltam:/);
  });

  it('mastered diagnostic estimates flip the status to mastered + show review CTA', () => {
    localStorage.setItem(
      DIAGNOSTIC_ESTIMATES_STORAGE_KEY,
      JSON.stringify({ adicao: 0.9 }),
    );
    renderPath();
    const card = screen.getByTestId('skill-adicao');
    expect(card.getAttribute('data-status')).toBe('mastered');
    // Review CTA visible (Praticar would be wrong wording for a mastered skill)
    const cta = screen.getByTestId('practice-adicao');
    expect(cta.textContent).toMatch(/Revisar/);
  });

  it('mastering all of a node\'s prereqs unlocks it', () => {
    // equacoes_quadraticas requires polinomios AND equacoes_lineares. Master
    // both transitively (we also need their prereqs, etc) — easiest path is
    // to mark every skill below it as mastered.
    const mastered: Record<string, number> = {};
    const allBelow = [
      'adicao',
      'subtracao',
      'multiplicacao',
      'divisao',
      'fracoes',
      'variaveis',
      'potencias',
      'polinomios',
      'equacoes_lineares',
    ];
    for (const id of allBelow) mastered[id] = 0.9;
    localStorage.setItem(DIAGNOSTIC_ESTIMATES_STORAGE_KEY, JSON.stringify(mastered));
    renderPath();
    const card = screen.getByTestId('skill-equacoes_quadraticas');
    expect(card.getAttribute('data-status')).toBe('available');
    expect(screen.queryByTestId('practice-equacoes_quadraticas')).not.toBeNull();
  });

  it('practice CTA links to /skill/<id>', () => {
    renderPath();
    const cta = screen.getByTestId('practice-adicao');
    const link = cta.querySelector('a') ?? cta;
    expect(link.getAttribute('href')).toBe('/skill/adicao');
  });

  it('locked tiles do NOT render a practice CTA', () => {
    renderPath();
    expect(screen.queryByTestId('practice-equacoes_quadraticas')).toBeNull();
  });
});
