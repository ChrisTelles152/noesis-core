import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { createDiagnosticEngine } from '@noesis-edu/core';
import { loadContentPack, type ContentItem } from '@noesis/content-pt-br-math';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const MAX_DIAGNOSTIC_ITEMS = 10;

export const DIAGNOSTIC_ESTIMATES_STORAGE_KEY = 'noesis-diagnostic-estimates';

type Stage = 'intro' | 'question' | 'complete';

interface Response {
  itemId: string;
  correct: boolean;
}

function gradeAnswer(item: ContentItem, raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return false;

  if (item.answerType === 'numeric') {
    const num = Number(trimmed.replace(',', '.'));
    return Number.isFinite(num) && num === Number(item.correctAnswer);
  }

  return trimmed.toLowerCase() === String(item.correctAnswer).trim().toLowerCase();
}

export default function Diagnostic() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const pack = useMemo(() => loadContentPack(), []);
  const engine = useMemo(() => createDiagnosticEngine(), []);

  const items = useMemo(() => {
    const ids = engine.generateDiagnostic(
      pack.skillGraph,
      pack.itemSkillMappings,
      MAX_DIAGNOSTIC_ITEMS,
    );
    const lookup = new Map(pack.items.map((it) => [it.id, it]));
    return ids.map((id) => lookup.get(id)).filter((it): it is ContentItem => it !== undefined);
  }, [pack, engine]);

  const [stage, setStage] = useState<Stage>('intro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t('diagnostic.title')}</CardTitle>
            <CardDescription>{t('diagnostic.noContentLoaded')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const finalize = (allResponses: Response[]): void => {
    const estimates = engine.analyzeResults(
      pack.skillGraph,
      pack.itemSkillMappings,
      allResponses,
    );
    try {
      const serialised = JSON.stringify(Object.fromEntries(estimates));
      localStorage.setItem(DIAGNOSTIC_ESTIMATES_STORAGE_KEY, serialised);
    } catch (err) {
      // localStorage may be unavailable (private mode, quota). Diagnostic still
      // completes — Path will fall back to the engine's default prior.
      console.warn('[diagnostic] failed to persist estimates:', err);
    }
    setStage('complete');
  };

  const handleSubmit = (): void => {
    const item = items[currentIndex];
    if (!item) return;
    const raw = item.answerType === 'multiple-choice' ? (choice ?? '') : answer;
    const correct = gradeAnswer(item, raw);
    const next = [...responses, { itemId: item.id, correct }];
    setResponses(next);
    setAnswer('');
    setChoice(null);

    if (currentIndex + 1 >= items.length) {
      finalize(next);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleSkip = (): void => {
    const item = items[currentIndex];
    if (!item) return;
    const next = [...responses, { itemId: item.id, correct: false }];
    setResponses(next);
    setAnswer('');
    setChoice(null);
    if (currentIndex + 1 >= items.length) {
      finalize(next);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const item = items[currentIndex];

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      {stage === 'intro' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('diagnostic.title')}</CardTitle>
            <CardDescription>{t('diagnostic.subtitle')}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => setStage('question')} data-testid="begin-diagnostic">
              {t('diagnostic.begin')}
            </Button>
          </CardFooter>
        </Card>
      )}

      {stage === 'question' && item && (
        <Card data-testid="diagnostic-question">
          <CardHeader>
            <CardDescription>
              {t('diagnostic.questionOf', {
                current: currentIndex + 1,
                total: items.length,
              })}
            </CardDescription>
            <CardTitle className="text-lg">{item.prompt}</CardTitle>
          </CardHeader>
          <CardContent>
            {item.answerType === 'multiple-choice' && item.alternatives ? (
              <fieldset className="space-y-2">
                <legend className="sr-only">{t('diagnostic.answer')}</legend>
                {item.alternatives.map((alt) => (
                  <label key={alt} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="alt"
                      value={alt}
                      checked={choice === alt}
                      onChange={() => setChoice(alt)}
                      data-testid={`choice-${alt}`}
                    />
                    <span>{alt}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="diagnostic-answer">{t('diagnostic.answer')}</Label>
                <Input
                  id="diagnostic-answer"
                  type={item.answerType === 'numeric' ? 'text' : 'text'}
                  inputMode={item.answerType === 'numeric' ? 'decimal' : 'text'}
                  placeholder={t('diagnostic.answerPlaceholder')}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  data-testid="answer-input"
                />
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between gap-2">
            <Button variant="ghost" onClick={handleSkip} data-testid="skip-question">
              {t('diagnostic.skip')}
            </Button>
            <Button onClick={handleSubmit} data-testid="submit-answer">
              {currentIndex + 1 >= items.length
                ? t('diagnostic.submitAnswer')
                : t('diagnostic.next')}
            </Button>
          </CardFooter>
        </Card>
      )}

      {stage === 'complete' && (
        <Card data-testid="diagnostic-complete">
          <CardHeader>
            <CardTitle>{t('diagnostic.complete')}</CardTitle>
            <CardDescription>{t('diagnostic.completeMessage')}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => setLocation('/path')} data-testid="view-path">
              {t('diagnostic.viewPath')}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
