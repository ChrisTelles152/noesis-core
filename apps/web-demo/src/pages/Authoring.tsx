/**
 * Authoring page (Phase H7)
 *
 * Admin-only editor for the system curriculum: list every topic, add new
 * ones, edit existing ones, delete them. Each mutation re-fetches the
 * full list so the UI stays consistent with the server's view of the
 * graph (including any prerequisite scrubbing the server does on delete).
 *
 * Form state is intentionally simple — one in-place form for create,
 * inline form per row for edit. No drag-and-drop graph editor in the
 * pilot scope; this is the contract surface, the visual editor is a
 * follow-up.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface SkillForm {
  id: string;
  name: string;
  description?: string;
  prerequisites: string[];
  category?: string;
  difficulty?: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; skills: SkillForm[] }
  | { status: 'forbidden' }
  | { status: 'error'; message: string };

const EMPTY_FORM: SkillForm = {
  id: '',
  name: '',
  description: '',
  prerequisites: [],
  category: '',
  difficulty: undefined,
};

function parsePrereqs(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function Authoring() {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [draft, setDraft] = useState<SkillForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SkillForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/skills', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        setState({ status: 'forbidden' });
        return;
      }
      if (!res.ok) {
        setState({ status: 'error', message: `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as { skills: SkillForm[] };
      setState({ status: 'ready', skills: body.skills ?? [] });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'unknown error',
      });
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleCreate = async (): Promise<void> => {
    setSaveError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setDraft(EMPTY_FORM);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (id: string): Promise<void> => {
    setSaveError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/skills/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editDraft),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setEditingId(null);
      setEditDraft(EMPTY_FORM);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm(t('authoring.confirmDelete'))) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/skills/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (skill: SkillForm): void => {
    setEditingId(skill.id);
    setEditDraft({ ...skill });
    setSaveError(null);
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('authoring.title')}</h1>
        <p className="mt-1 text-slate-600">{t('authoring.subtitle')}</p>
      </header>

      {state.status === 'loading' && (
        <p className="text-slate-500" data-testid="authoring-loading">
          {t('authoring.loading')}
        </p>
      )}

      {state.status === 'forbidden' && (
        <Card data-testid="authoring-forbidden">
          <CardHeader>
            <CardTitle>{t('authoring.forbidden')}</CardTitle>
          </CardHeader>
        </Card>
      )}

      {state.status === 'error' && (
        <Card data-testid="authoring-error">
          <CardHeader>
            <CardTitle>{t('authoring.loadFailed')}</CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {state.status === 'ready' && (
        <>
          <Card className="mb-6" data-testid="authoring-create">
            <CardHeader>
              <CardTitle className="text-base">{t('authoring.addNew')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="new-id">{t('authoring.skillId')}</Label>
                  <Input
                    id="new-id"
                    placeholder={t('authoring.skillIdPlaceholder')}
                    value={draft.id}
                    onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                    data-testid="new-id"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-name">{t('authoring.skillName')}</Label>
                  <Input
                    id="new-name"
                    placeholder={t('authoring.skillNamePlaceholder')}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    data-testid="new-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-prereqs">{t('authoring.skillPrerequisites')}</Label>
                  <Input
                    id="new-prereqs"
                    value={draft.prerequisites.join(', ')}
                    onChange={(e) =>
                      setDraft({ ...draft, prerequisites: parsePrereqs(e.target.value) })
                    }
                    data-testid="new-prereqs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-category">{t('authoring.skillCategory')}</Label>
                  <Input
                    id="new-category"
                    value={draft.category ?? ''}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    data-testid="new-category"
                  />
                </div>
              </div>
              {saveError && (
                <p className="text-sm text-red-600" data-testid="save-error">
                  {t('authoring.saveError', { error: saveError })}
                </p>
              )}
            </CardContent>
            <CardContent className="pt-0">
              <Button
                onClick={handleCreate}
                disabled={busy || draft.id.length === 0 || draft.name.length === 0}
                data-testid="create-skill"
              >
                {busy ? t('authoring.saving') : t('authoring.save')}
              </Button>
            </CardContent>
          </Card>

          {state.skills.length === 0 ? (
            <p className="text-slate-500" data-testid="authoring-empty">
              {t('authoring.empty')}
            </p>
          ) : (
            <ul className="space-y-3" data-testid="skill-list">
              {state.skills.map((skill) => (
                <li key={skill.id}>
                  <Card data-testid={`skill-row-${skill.id}`}>
                    <CardContent className="pt-6">
                      {editingId === skill.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor={`edit-name-${skill.id}`}>
                                {t('authoring.skillName')}
                              </Label>
                              <Input
                                id={`edit-name-${skill.id}`}
                                value={editDraft.name}
                                onChange={(e) =>
                                  setEditDraft({ ...editDraft, name: e.target.value })
                                }
                                data-testid={`edit-name-${skill.id}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`edit-prereqs-${skill.id}`}>
                                {t('authoring.skillPrerequisites')}
                              </Label>
                              <Input
                                id={`edit-prereqs-${skill.id}`}
                                value={editDraft.prerequisites.join(', ')}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    prerequisites: parsePrereqs(e.target.value),
                                  })
                                }
                                data-testid={`edit-prereqs-${skill.id}`}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleUpdate(skill.id)}
                              disabled={busy}
                              data-testid={`save-${skill.id}`}
                            >
                              {t('authoring.save')}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setEditingId(null);
                                setEditDraft(EMPTY_FORM);
                              }}
                            >
                              {t('authoring.cancel')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-medium">
                              {skill.name}{' '}
                              <span className="text-xs text-slate-400">({skill.id})</span>
                            </h3>
                            {skill.prerequisites.length > 0 && (
                              <p className="text-sm text-slate-500 mt-1">
                                ← {skill.prerequisites.join(', ')}
                              </p>
                            )}
                            {skill.category && (
                              <p className="text-xs text-slate-400 mt-1">{skill.category}</p>
                            )}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              variant="outline"
                              onClick={() => startEdit(skill)}
                              data-testid={`edit-${skill.id}`}
                            >
                              {t('authoring.edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => handleDelete(skill.id)}
                              data-testid={`delete-${skill.id}`}
                            >
                              {t('authoring.delete')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
