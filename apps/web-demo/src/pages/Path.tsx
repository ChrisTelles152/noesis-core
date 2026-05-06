/**
 * Path page (Phase H4) — the main "what should I learn next" surface.
 *
 * Renders the full 25-skill DAG grouped by category, in topological order.
 * Each skill card shows its current status (locked / available /
 * inProgress / mastered) based on the diagnostic estimates persisted by
 * the Diagnostic page (Phase H3) — falling back to the engine's default
 * 0.3 prior when no diagnostic has been taken.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { loadContentPack } from '@noesis/content-pt-br-math';
import type { Skill } from '@noesis-edu/core';
import SkillNodeCard from '@/components/SkillNodeCard';
import { loadEstimatesFromStorage } from '@/lib/pathStatus';

const CATEGORY_ORDER = [
  'arithmetic',
  'algebra',
  'functions',
  'geometry',
  'trigonometry',
  'statistics',
];

export default function Path() {
  const { t } = useTranslation();

  const pack = useMemo(() => loadContentPack(), []);
  const estimates = useMemo(() => loadEstimatesFromStorage(), []);

  const skillsByCategory = useMemo(() => {
    // Topological order keeps prerequisites first inside each category — so
    // a learner reads top-to-bottom in the order they'd actually unlock.
    const order = pack.skillGraph.getTopologicalOrder();
    const byCat = new Map<string, Skill[]>();
    for (const id of order) {
      const skill = pack.skillGraph.skills.get(id);
      if (!skill) continue;
      const cat = skill.category ?? 'other';
      const arr = byCat.get(cat) ?? [];
      arr.push(skill);
      byCat.set(cat, arr);
    }
    return byCat;
  }, [pack]);

  const orderedCategories = useMemo(() => {
    const seen = new Set(skillsByCategory.keys());
    const ordered: string[] = [];
    for (const cat of CATEGORY_ORDER) {
      if (seen.has(cat)) {
        ordered.push(cat);
        seen.delete(cat);
      }
    }
    // Append any categories not in CATEGORY_ORDER (future-proofing for new
    // packs that introduce a category we haven't slotted yet).
    for (const cat of seen) ordered.push(cat);
    return ordered;
  }, [skillsByCategory]);

  if (pack.skillGraph.skills.size === 0) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">{t('path.title')}</h1>
        <p className="text-slate-600">{t('path.noContent')}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('path.title')}</h1>
        <p className="mt-2 text-slate-600">{t('path.subtitle')}</p>
      </header>

      {orderedCategories.map((category) => {
        const skills = skillsByCategory.get(category) ?? [];
        return (
          <section key={category} className="mb-10" data-testid={`category-${category}`}>
            <h2 className="text-xl font-semibold mb-4">
              {t(`path.categories.${category}`, { defaultValue: category })}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skills.map((skill) => (
                <SkillNodeCard
                  key={skill.id}
                  skill={skill}
                  estimates={estimates}
                  graph={pack.skillGraph}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
