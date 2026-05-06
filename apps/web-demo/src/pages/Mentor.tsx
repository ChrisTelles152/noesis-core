/**
 * Mentor dashboard (Phase H6)
 *
 * Admin-only view of every learner in the system, with their per-skill
 * mastery aggregates pulled from /api/mentor/learners. Includes a CSV
 * export button that triggers a browser download by hitting the server
 * with credentials so the same admin gate applies.
 *
 * Non-admins land on a 403 message rather than the table — the server
 * gates the data, this page just surfaces a readable explanation.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface LearnerProgress {
  totalSkills: number;
  masteredSkills: number;
  learningSkills: number;
  notStartedSkills: number;
  averageMastery: number;
  totalEvents: number;
}

interface MentorLearner {
  id: number;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  progress: LearnerProgress | null;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; learners: MentorLearner[] }
  | { status: 'forbidden' }
  | { status: 'error'; message: string };

export default function Mentor() {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/mentor/learners', { credentials: 'include' });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) {
          setState({ status: 'error', message: `HTTP ${res.status}` });
          return;
        }
        const body = (await res.json()) as { learners: MentorLearner[] };
        setState({ status: 'ready', learners: body.learners });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'unknown error',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExportCsv = async (): Promise<void> => {
    // Fetch the CSV through the same credentialed channel so the server's
    // requireAdmin gate applies, then trigger a download via a synthetic <a>
    // — works in jsdom (test) as well as real browsers without redirecting
    // away from the dashboard.
    try {
      const res = await fetch('/api/mentor/export.csv', { credentials: 'include' });
      if (!res.ok) {
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'learners.csv';
      a.setAttribute('data-testid', 'csv-download-link');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Failure is non-fatal; user can retry. The button stays enabled.
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('mentor.title')}</h1>
          <p className="mt-1 text-slate-600">{t('mentor.subtitle')}</p>
        </div>
        {state.status === 'ready' && state.learners.length > 0 && (
          <Button onClick={handleExportCsv} data-testid="export-csv">
            {t('mentor.exportCsv')}
          </Button>
        )}
      </header>

      {state.status === 'loading' && (
        <p className="text-slate-500" data-testid="mentor-loading">
          {t('mentor.loading')}
        </p>
      )}

      {state.status === 'forbidden' && (
        <Card data-testid="mentor-forbidden">
          <CardHeader>
            <CardTitle>{t('mentor.forbidden')}</CardTitle>
          </CardHeader>
        </Card>
      )}

      {state.status === 'error' && (
        <Card data-testid="mentor-error">
          <CardHeader>
            <CardTitle>{t('mentor.loadFailed')}</CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {state.status === 'ready' && state.learners.length === 0 && (
        <p className="text-slate-500" data-testid="mentor-empty">
          {t('mentor.empty')}
        </p>
      )}

      {state.status === 'ready' && state.learners.length > 0 && (
        <Card>
          <CardContent className="pt-6 overflow-x-auto">
            <table className="w-full text-sm" data-testid="mentor-table">
              <thead>
                <tr className="text-left border-b border-slate-200">
                  <th className="py-2 pr-4">{t('mentor.columns.id')}</th>
                  <th className="py-2 pr-4">{t('mentor.columns.username')}</th>
                  <th className="py-2 pr-4">{t('mentor.columns.totalSkills')}</th>
                  <th className="py-2 pr-4">{t('mentor.columns.mastered')}</th>
                  <th className="py-2 pr-4">{t('mentor.columns.learning')}</th>
                  <th className="py-2 pr-4">{t('mentor.columns.notStarted')}</th>
                  <th className="py-2 pr-4">{t('mentor.columns.averageMastery')}</th>
                  <th className="py-2 pr-4">{t('mentor.columns.totalEvents')}</th>
                  <th className="py-2 pr-4">{t('mentor.columns.isAdmin')}</th>
                </tr>
              </thead>
              <tbody>
                {state.learners.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-slate-100 last:border-0"
                    data-testid={`mentor-row-${l.id}`}
                  >
                    <td className="py-2 pr-4">{l.id}</td>
                    <td className="py-2 pr-4 font-medium">{l.username}</td>
                    <td className="py-2 pr-4">{l.progress?.totalSkills ?? '—'}</td>
                    <td className="py-2 pr-4">{l.progress?.masteredSkills ?? '—'}</td>
                    <td className="py-2 pr-4">{l.progress?.learningSkills ?? '—'}</td>
                    <td className="py-2 pr-4">{l.progress?.notStartedSkills ?? '—'}</td>
                    <td className="py-2 pr-4">
                      {l.progress ? l.progress.averageMastery.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 pr-4">{l.progress?.totalEvents ?? '—'}</td>
                    <td className="py-2 pr-4">{l.isAdmin ? '✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
