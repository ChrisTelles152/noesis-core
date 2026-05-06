/**
 * SkillNodeCard — single skill tile on the Path page (Phase H4)
 *
 * Visually encodes the four UI states (locked / available / inProgress /
 * mastered) and gates the practice CTA accordingly. Locked tiles list
 * the missing prerequisites in a learner-friendly way so the path of
 * action is obvious without consulting the graph.
 */

import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import type { Skill, SkillGraph } from '@noesis-edu/core';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { computePathStatus, getMissingPrerequisites, type PathStatus } from '@/lib/pathStatus';

interface Props {
  skill: Skill;
  estimates: Map<string, number>;
  graph: SkillGraph;
}

const STATUS_BADGE_CLASSES: Record<PathStatus, string> = {
  locked: 'text-slate-500 bg-slate-100',
  available: 'text-iris-bloom-700 bg-iris-bloom-50',
  inProgress: 'text-amber-700 bg-amber-50',
  mastered: 'text-emerald-700 bg-emerald-50',
};

export default function SkillNodeCard({ skill, estimates, graph }: Props) {
  const { t } = useTranslation();
  const status = computePathStatus(skill, estimates, graph);
  const missingPrereqs =
    status === 'locked' ? getMissingPrerequisites(skill, estimates, graph) : [];

  const statusLabel = t(`path.${status}`);
  const isInteractive = status === 'available' || status === 'inProgress' || status === 'mastered';
  const ctaLabel = status === 'mastered' ? t('path.review') : t('path.practice');

  return (
    <Card
      data-testid={`skill-${skill.id}`}
      data-status={status}
      className={status === 'locked' ? 'opacity-70' : ''}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{skill.name}</CardTitle>
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE_CLASSES[status]}`}
            data-testid={`status-badge-${skill.id}`}
          >
            {statusLabel}
          </span>
        </div>
        {skill.description && (
          <CardDescription className="text-sm">{skill.description}</CardDescription>
        )}
      </CardHeader>
      {status === 'locked' && missingPrereqs.length > 0 && (
        <CardContent>
          <p className="text-sm text-slate-600" data-testid={`locked-reason-${skill.id}`}>
            {t('path.lockedReasonDetail', {
              names: missingPrereqs.map((p) => p.name).join(', '),
            })}
          </p>
        </CardContent>
      )}
      <CardFooter>
        {isInteractive ? (
          <Button
            asChild
            variant={status === 'mastered' ? 'outline' : 'default'}
            data-testid={`practice-${skill.id}`}
          >
            <Link href={`/skill/${skill.id}`}>{ctaLabel}</Link>
          </Button>
        ) : (
          <span className="text-sm text-slate-500">{t('path.lockedReason')}</span>
        )}
      </CardFooter>
    </Card>
  );
}
