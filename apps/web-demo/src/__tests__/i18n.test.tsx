/**
 * i18n verification tests (Phase H1)
 *
 * Verifies the locale wiring + key parity between pt-BR (the default) and
 * en-US (the fallback). The pilot is Brazil-first per INTENTION.md, so
 * pt-BR is the language a fresh visitor sees by default.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n, { i18nReady } from '../lib/i18n';
import ptBR from '../locales/pt-BR.json';
import enUS from '../locales/en-US.json';
import Hero from '../components/Hero';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

const { hook: memoryHook } = memoryLocation();

beforeAll(async () => {
  // i18next init is async (returns a Promise). Wait for resources to
  // register before any render runs — otherwise t() returns the raw key.
  await i18nReady;
  await i18n.changeLanguage('pt-BR');
});

/** Recursively flatten a nested locale object into dotted-path keys. */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe('Phase H1: locale files are at parity', () => {
  it('pt-BR and en-US have the same set of translation keys', () => {
    const ptKeys = flattenKeys(ptBR as unknown as Record<string, unknown>);
    const enKeys = flattenKeys(enUS as unknown as Record<string, unknown>);

    const onlyInPt = ptKeys.filter((k) => !enKeys.includes(k));
    const onlyInEn = enKeys.filter((k) => !ptKeys.includes(k));
    expect(onlyInPt, `Keys missing from en-US: ${onlyInPt.join(', ')}`).toEqual([]);
    expect(onlyInEn, `Keys missing from pt-BR: ${onlyInEn.join(', ')}`).toEqual([]);
  });

  it('every translation value is a non-empty string', () => {
    for (const locale of [ptBR, enUS] as const) {
      const keys = flattenKeys(locale as unknown as Record<string, unknown>);
      for (const path of keys) {
        const value = path
          .split('.')
          .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], locale);
        expect(typeof value, `${path} should be a string`).toBe('string');
        expect((value as string).length, `${path} should be non-empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe('Phase H1: pt-BR is the default at render', () => {
  it('renders Hero with the Portuguese headline (not the English one)', async () => {
    await i18n.changeLanguage('pt-BR');
    const { container } = render(
      <Router hook={memoryHook}>
        <Hero />
      </Router>
    );
    expect(container.textContent).toContain('Aprendizado Adaptativo');
    expect(container.textContent).not.toContain('Adaptive Learning');
  });

  it('renders Portuguese subhead and CTA labels', async () => {
    await i18n.changeLanguage('pt-BR');
    render(
      <Router hook={memoryHook}>
        <Hero />
      </Router>
    );
    expect(
      screen.queryByText(/A camada de infraestrutura universal para experiências/)
    ).not.toBeNull();
    // Primary CTA — "Começar" is the pt-BR for "Get Started". Wrapped with
    // an icon, so use a regex match instead of exact text.
    expect(screen.queryByText(/Começar/)).not.toBeNull();
  });
});

describe('Phase H1: language can be switched at runtime', () => {
  it('switching to en-US re-renders English copy', async () => {
    await i18n.changeLanguage('en-US');
    render(
      <Router hook={memoryHook}>
        <Hero />
      </Router>
    );
    // Heading is the most reliable signal — direct text node.
    expect(screen.queryByText('Adaptive Learning')).not.toBeNull();
    expect(screen.queryByText('Aprendizado Adaptativo')).toBeNull();
    // CTA — wrapped with icon; regex match.
    expect(screen.queryByText(/Get Started/)).not.toBeNull();
    // Restore default for any test that runs after this one.
    await i18n.changeLanguage('pt-BR');
  });
});
