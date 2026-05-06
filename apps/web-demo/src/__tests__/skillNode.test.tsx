/**
 * SkillNode page tests (Phase H5)
 *
 * Walks the 4-stage canonical loop end to end for a real pack skill,
 * checks that grading + feedback render, that skip and submit both
 * advance, and that finishing reflection navigates back to /path.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Router, Route } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import i18n, { i18nReady } from '../lib/i18n';
import SkillNode from '../pages/SkillNode';

const {
  hook: memoryHook,
  navigate,
  history,
} = memoryLocation({
  path: '/skill/adicao',
  record: true,
});

beforeAll(async () => {
  await i18nReady;
  await i18n.changeLanguage('pt-BR');
});

beforeEach(() => {
  localStorage.clear();
  // Reset history & route to /skill/adicao for each test
  navigate('/skill/adicao');
});

function renderSkillNode(): ReturnType<typeof render> {
  // wouter's useParams reads from the matching <Route> — mount via Route so
  // the :id segment binds correctly.
  return render(
    <Router hook={memoryHook}>
      <Route path="/skill/:id" component={SkillNode} />
    </Router>
  );
}

describe('Phase H5: SkillNode page', () => {
  it('renders the skill name and stage 1 of 4 progress', () => {
    renderSkillNode();
    expect(screen.queryByText(/Tópico:.*Adição/)).not.toBeNull();
    expect(screen.queryByText('Etapa 1 de 4')).not.toBeNull();
    expect(screen.queryByTestId('stage-concept_introduction')).not.toBeNull();
  });

  it('continue advances from concept_introduction to practice', () => {
    renderSkillNode();
    fireEvent.click(screen.getByTestId('continue-stage'));
    expect(screen.queryByTestId('stage-practice')).not.toBeNull();
    expect(screen.queryByText('Etapa 2 de 4')).not.toBeNull();
  });

  it('practice stage shows the item prompt and grades a correct answer', () => {
    renderSkillNode();
    fireEvent.click(screen.getByTestId('continue-stage'));
    // adi_001 from golden sequence: "Quanto é 7 + 5?" → 12
    expect(screen.getByTestId('item-prompt').textContent).toMatch(/7 \+ 5/);
    fireEvent.change(screen.getByTestId('answer-input'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('submit-answer'));
    const feedback = screen.getByTestId('feedback');
    expect(feedback.textContent).toMatch(/Correto/);
  });

  it('grades an incorrect answer with the worked-solution explanation', () => {
    renderSkillNode();
    fireEvent.click(screen.getByTestId('continue-stage'));
    fireEvent.change(screen.getByTestId('answer-input'), { target: { value: '999' } });
    fireEvent.click(screen.getByTestId('submit-answer'));
    const feedback = screen.getByTestId('feedback');
    expect(feedback.textContent).toMatch(/Quase lá/);
    // Worked solution from items.json — "7 + 5 = 12. Pode contar..."
    expect(feedback.textContent).toMatch(/7 \+ 5 = 12/);
  });

  it('next-stage button advances after feedback is shown', () => {
    renderSkillNode();
    fireEvent.click(screen.getByTestId('continue-stage'));
    fireEvent.change(screen.getByTestId('answer-input'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('submit-answer'));
    fireEvent.click(screen.getByTestId('next-stage'));
    expect(screen.queryByTestId('stage-application')).not.toBeNull();
    expect(screen.queryByText('Etapa 3 de 4')).not.toBeNull();
  });

  it('reaches the reflection stage and submitting routes back to /path', () => {
    renderSkillNode();
    // Stage 1 → 2
    fireEvent.click(screen.getByTestId('continue-stage'));
    // Stage 2 (practice): submit any answer + advance
    fireEvent.change(screen.getByTestId('answer-input'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('submit-answer'));
    fireEvent.click(screen.getByTestId('next-stage'));
    // Stage 3 (application): submit + advance
    fireEvent.change(screen.getByTestId('answer-input'), { target: { value: '62' } });
    fireEvent.click(screen.getByTestId('submit-answer'));
    fireEvent.click(screen.getByTestId('next-stage'));
    // Stage 4 (reflection)
    expect(screen.queryByTestId('stage-reflection')).not.toBeNull();
    fireEvent.change(screen.getByTestId('reflection-input'), {
      target: { value: 'Aprendi a somar.' },
    });
    fireEvent.click(screen.getByTestId('submit-reflection'));
    expect(history[history.length - 1]).toBe('/path');
  });

  it('persists the reflection text to localStorage', () => {
    renderSkillNode();
    // Walk through to reflection
    fireEvent.click(screen.getByTestId('continue-stage'));
    fireEvent.click(screen.getByTestId('skip-stage'));
    fireEvent.click(screen.getByTestId('skip-stage'));
    fireEvent.change(screen.getByTestId('reflection-input'), {
      target: { value: 'Reflexão de teste' },
    });
    fireEvent.click(screen.getByTestId('submit-reflection'));
    const raw = localStorage.getItem('noesis-reflection-adicao');
    expect(raw).not.toBeNull();
    const entries = JSON.parse(raw!);
    expect(entries[0].text).toBe('Reflexão de teste');
    expect(typeof entries[0].timestamp).toBe('number');
  });

  it('skip during practice still advances without grading', () => {
    renderSkillNode();
    fireEvent.click(screen.getByTestId('continue-stage'));
    fireEvent.click(screen.getByTestId('skip-stage'));
    expect(screen.queryByTestId('stage-application')).not.toBeNull();
    // No feedback should have been shown since we skipped
    expect(screen.queryByTestId('feedback')).toBeNull();
  });

  it('shows the skill-not-found card for an unknown skill id', () => {
    navigate('/skill/this-id-does-not-exist');
    renderSkillNode();
    expect(screen.queryByText('Tópico não encontrado.')).not.toBeNull();
  });
});
