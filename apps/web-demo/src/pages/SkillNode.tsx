/**
 * SkillNode page (Phase H5)
 *
 * Walks a learner through the 4 stages of the canonical loop for a
 * single skill: concept_introduction → practice → application →
 * reflection. After reflection, the learner is sent back to /path so
 * the next-action choice is theirs (not auto-advanced).
 *
 * URL: /skill/:id  — id matches a Skill in the loaded content pack.
 */

import { useMemo, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { loadContentPack, type ContentItem } from '@noesis/content-pt-br-math';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CANONICAL_LOOP_STAGES, gradeAnswer, pickItemForStage } from '@/lib/canonicalLoop';

export default function SkillNode() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const skillId = params.id ?? '';
  const [, setLocation] = useLocation();

  const pack = useMemo(() => loadContentPack(), []);
  const skill = useMemo(() => pack.skillGraph.skills.get(skillId), [pack, skillId]);

  const [stageIndex, setStageIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [reflection, setReflection] = useState('');
  const [feedback, setFeedback] = useState<{ correct: boolean; item: ContentItem } | null>(null);

  if (!skill) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t('skillNode.skillNotFound')}</CardTitle>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => setLocation('/path')}>{t('skillNode.backToPath')}</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const currentStage = CANONICAL_LOOP_STAGES[stageIndex];
  const item = pickItemForStage(skillId, currentStage, pack);
  const isLastStage = stageIndex >= CANONICAL_LOOP_STAGES.length - 1;

  const advance = (): void => {
    setAnswer('');
    setReflection('');
    setFeedback(null);
    if (isLastStage) {
      setLocation('/path');
    } else {
      setStageIndex((i) => i + 1);
    }
  };

  const handleSubmitAnswer = (): void => {
    if (!item) return;
    const correct = gradeAnswer(item, answer);
    setFeedback({ correct, item });
  };

  const handleSubmitReflection = (): void => {
    // Persist reflection text in localStorage as a simple journal entry.
    // The engine doesn't grade reflections; this is just so the learner can
    // reread later. Storage failure is non-fatal (private mode etc.).
    try {
      const key = `noesis-reflection-${skillId}`;
      const entries = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
        timestamp: number;
        text: string;
      }>;
      entries.push({ timestamp: Date.now(), text: reflection.trim() });
      localStorage.setItem(key, JSON.stringify(entries));
    } catch {
      // ignore — reflection is best-effort journaling
    }
    advance();
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {t('skillNode.title', { name: skill.name })}
        </h1>
        <p className="mt-1 text-sm text-slate-500" data-testid="stage-progress">
          {t('skillNode.stageOf', {
            current: stageIndex + 1,
            total: CANONICAL_LOOP_STAGES.length,
          })}
        </p>
      </header>

      {currentStage === 'concept_introduction' && (
        <Card data-testid="stage-concept_introduction">
          <CardHeader>
            <CardTitle>{t('skillNode.introduction')}</CardTitle>
            <CardDescription>{t('skillNode.introductionLead')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-base leading-relaxed">
              {item?.workedSolution ?? t('skillNode.introductionFallback', { name: skill.name })}
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={advance} data-testid="continue-stage">
              {t('skillNode.introductionContinue')}
            </Button>
          </CardFooter>
        </Card>
      )}

      {(currentStage === 'practice' || currentStage === 'application') && (
        <Card data-testid={`stage-${currentStage}`}>
          <CardHeader>
            <CardTitle>{t(`skillNode.${currentStage}`)}</CardTitle>
            <CardDescription>{t(`skillNode.${currentStage}Lead`)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {item ? (
              <>
                <p className="text-base font-medium" data-testid="item-prompt">
                  {item.prompt}
                </p>
                {item.answerType === 'multiple-choice' && item.alternatives ? (
                  <fieldset className="space-y-2">
                    <legend className="sr-only">{t('skillNode.yourAnswer')}</legend>
                    {item.alternatives.map((alt) => (
                      <label key={alt} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="answer"
                          value={alt}
                          checked={answer === alt}
                          onChange={() => setAnswer(alt)}
                          disabled={feedback !== null}
                          data-testid={`alt-${alt}`}
                        />
                        <span>{alt}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="skill-answer">{t('skillNode.yourAnswer')}</Label>
                    <Input
                      id="skill-answer"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder={t('skillNode.answerPlaceholder')}
                      disabled={feedback !== null}
                      data-testid="answer-input"
                    />
                  </div>
                )}
                {feedback && (
                  <div
                    className={`rounded-md p-3 text-sm ${
                      feedback.correct
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-amber-50 text-amber-900'
                    }`}
                    data-testid="feedback"
                  >
                    <p className="font-semibold">
                      {feedback.correct ? t('skillNode.correct') : t('skillNode.incorrect')}
                    </p>
                    <p className="mt-1">{feedback.item.workedSolution}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500" data-testid="no-item">
                {t('skillNode.noItemForStage')}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex justify-between gap-2">
            <Button variant="ghost" onClick={advance} data-testid="skip-stage">
              {t('skillNode.skip')}
            </Button>
            {feedback ? (
              <Button onClick={advance} data-testid="next-stage">
                {isLastStage ? t('skillNode.finish') : t('skillNode.next')}
              </Button>
            ) : item ? (
              <Button onClick={handleSubmitAnswer} data-testid="submit-answer">
                {t('skillNode.submit')}
              </Button>
            ) : (
              <Button onClick={advance} data-testid="advance-no-item">
                {t('skillNode.next')}
              </Button>
            )}
          </CardFooter>
        </Card>
      )}

      {currentStage === 'reflection' && (
        <Card data-testid="stage-reflection">
          <CardHeader>
            <CardTitle>{t('skillNode.reflection')}</CardTitle>
            <CardDescription>{t('skillNode.reflectionLead')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="reflection-text" className="mb-2 block">
              {t('skillNode.reflectionPrompt')}
            </Label>
            <Textarea
              id="reflection-text"
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              rows={5}
              data-testid="reflection-input"
            />
          </CardContent>
          <CardFooter className="flex justify-between gap-2">
            <Button variant="ghost" onClick={advance} data-testid="skip-reflection">
              {t('skillNode.skip')}
            </Button>
            <Button onClick={handleSubmitReflection} data-testid="submit-reflection">
              {t('skillNode.reflectionSubmit')}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
