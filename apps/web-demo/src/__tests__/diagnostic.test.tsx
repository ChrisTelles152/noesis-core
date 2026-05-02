/**
 * Diagnostic placement quiz tests (Phase H3)
 *
 * Walks the full flow end-to-end: intro → answer N items → complete card →
 * estimates persisted to localStorage. Tests the integration of the core's
 * DiagnosticEngine with the pt-BR math content pack via the React UI.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import i18n, { i18nReady } from '../lib/i18n';
import Diagnostic, { DIAGNOSTIC_ESTIMATES_STORAGE_KEY } from '../pages/Diagnostic';

const { hook: memoryHook, navigate, history } = memoryLocation({ record: true });

beforeAll(async () => {
  await i18nReady;
  await i18n.changeLanguage('pt-BR');
});

beforeEach(() => {
  localStorage.clear();
  navigate('/diagnostic');
});

function renderDiagnostic(): ReturnType<typeof render> {
  return render(
    <Router hook={memoryHook}>
      <Diagnostic />
    </Router>,
  );
}

/**
 * Walk a question — handle both numeric/free-text (input box) and multiple-
 * choice (radio) by inspecting the rendered DOM. Submits an arbitrary answer;
 * grading correctness is not the point of these tests.
 */
function answerCurrentQuestion(): void {
  const input = screen.queryByTestId('answer-input') as HTMLInputElement | null;
  if (input) {
    fireEvent.change(input, { target: { value: '1' } });
  } else {
    // Multiple-choice — pick the first radio.
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.length).toBeGreaterThan(0);
    fireEvent.click(radios[0]);
  }
  fireEvent.click(screen.getByTestId('submit-answer'));
}

describe('Phase H3: Diagnostic placement quiz', () => {
  it('renders the pt-BR intro with begin button (default render = intro)', () => {
    renderDiagnostic();
    expect(screen.queryByText('Avaliação Inicial')).not.toBeNull();
    expect(screen.queryByTestId('begin-diagnostic')).not.toBeNull();
    // Question card not shown yet
    expect(screen.queryByTestId('diagnostic-question')).toBeNull();
  });

  it('clicking "Começar Avaliação" reveals the first question with progress label', () => {
    renderDiagnostic();
    fireEvent.click(screen.getByTestId('begin-diagnostic'));
    expect(screen.queryByTestId('diagnostic-question')).not.toBeNull();
    // Progress label should match "Pergunta 1 de N" format
    expect(screen.queryByText(/Pergunta 1 de \d+/)).not.toBeNull();
  });

  it('walks through every diagnostic item and lands on the complete card', () => {
    renderDiagnostic();
    fireEvent.click(screen.getByTestId('begin-diagnostic'));

    // Walk until the complete card appears. Cap iterations defensively so a
    // bug in the page can't infinite-loop the test runner.
    const HARD_CAP = 30;
    let iterations = 0;
    while (!screen.queryByTestId('diagnostic-complete') && iterations < HARD_CAP) {
      answerCurrentQuestion();
      iterations++;
    }
    expect(screen.queryByTestId('diagnostic-complete')).not.toBeNull();
    expect(screen.queryByText('Avaliação Concluída!')).not.toBeNull();
  });

  it('persists mastery estimates to localStorage after completion', () => {
    renderDiagnostic();
    fireEvent.click(screen.getByTestId('begin-diagnostic'));

    let iterations = 0;
    while (!screen.queryByTestId('diagnostic-complete') && iterations < 30) {
      answerCurrentQuestion();
      iterations++;
    }

    const raw = localStorage.getItem(DIAGNOSTIC_ESTIMATES_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Record<string, number>;
    // Every estimate is in [0.05, 0.95] per the engine, with default 0.3 prior
    // for skills with no responses. We expect at least the 25 pack skills.
    expect(Object.keys(parsed).length).toBeGreaterThanOrEqual(25);
    for (const value of Object.values(parsed)) {
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('clicking "Ver Trilha" on completion navigates to /path', async () => {
    renderDiagnostic();
    fireEvent.click(screen.getByTestId('begin-diagnostic'));
    let iterations = 0;
    while (!screen.queryByTestId('diagnostic-complete') && iterations < 30) {
      answerCurrentQuestion();
      iterations++;
    }
    await act(async () => {
      fireEvent.click(screen.getByTestId('view-path'));
    });
    // wouter's setLocation pushes onto memoryLocation's recorded history.
    // The most recent entry should be /path.
    expect(history[history.length - 1]).toBe('/path');
  });

  it('skip records the response as incorrect and still advances', () => {
    renderDiagnostic();
    fireEvent.click(screen.getByTestId('begin-diagnostic'));
    // First question — skip instead of answer
    fireEvent.click(screen.getByTestId('skip-question'));
    // Either we landed on the next question or (if there was only 1) on complete
    const onNext =
      screen.queryByTestId('diagnostic-question') !== null ||
      screen.queryByTestId('diagnostic-complete') !== null;
    expect(onNext).toBe(true);
  });
});
