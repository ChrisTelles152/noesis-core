---
title: pt-BR math content pack
description: 25-skill Brazilian-Portuguese math curriculum that proves the platform end-to-end.
---

The first content pack ships in `packages/content-pt-br-math/`. It's
a real curriculum (not a fixture): 25 skills with prerequisites and
encompassed-skills relations, ~50 practice items, and 5 golden-path
sequences that pin item ordering through the canonical loop.

## Topic coverage

| Category | Topics |
|---|---|
| Aritmética | adição, subtração, multiplicação, divisão, frações, decimais, porcentagem, potências |
| Álgebra | variáveis, equações lineares, sistemas lineares, polinômios, equações quadráticas, logaritmos |
| Funções | função linear, função quadrática, função exponencial |
| Geometria | ângulos, triângulos, círculo, áreas e volumes, semelhança |
| Trigonometria | trigonometria básica |
| Estatística | estatística básica, probabilidade |

## Loading the pack

```ts
import { loadContentPack } from '@noesis/content-pt-br-math';

const pack = loadContentPack();
// pack.skillGraph: validated SkillGraph (throws on cycle / missing prereq)
// pack.items: ContentItem[] — prompts + worked solutions in pt-BR
// pack.itemSkillMappings: ItemSkillMapping[] for the diagnostic engine
// pack.goldenSequences: 5 curated sequences keyed to the canonical stages
```

## Verification suite

The pack ships with 19 tests in
`packages/content-pt-br-math/src/__tests__/contentPack.test.ts`:

- DAG validates (no cycles, all prereqs resolvable, topo order respected)
- Exactly 25 skills, 50 items
- Every skill has at least one primary item (no orphan topics)
- Every item routes to a skill that exists
- Multiple-choice items have `correctAnswer` in `alternatives`
- Names use Portuguese diacritics (≥ 15 of 25), no English equivalents
- Item prompts don't match English-only test phrases like "How much is"
- Golden sequences only reference real skills + items
- Stage names belong to the canonical 4
