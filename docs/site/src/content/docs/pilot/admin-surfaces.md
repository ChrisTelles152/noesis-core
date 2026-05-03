---
title: Mentor + authoring admin
description: Cohort visibility and curriculum editing for the people running the pilot.
---

Two admin-gated surfaces ship with the pilot. Both require a user with
`isAdmin = true` on their record (no UI for self-promotion — the seam
is `storage.setUserAdmin(userId, true)` so an admin grant always shows
up in code review).

## Mentor dashboard — `/mentor`

Server: `GET /api/mentor/learners` returns every learner with their
`LearnerProgress` aggregates (totalSkills, masteredSkills, learning,
notStarted, averageMastery, totalEvents). One bad engine doesn't
tank the list — failures hydrate to `null` progress so the row
still appears.

Client: a table view plus an **Export CSV** button that fetches
`GET /api/mentor/export.csv` (RFC-4180-ish, `text/csv` mime,
`Content-Disposition: attachment`). Cells containing commas, quotes,
or newlines are quoted.

## Authoring admin — `/authoring`

Per-skill CRUD on a system-wide curriculum (kept separate from
per-user curricula so editing the template doesn't trample any active
learner).

- `GET /api/admin/skills` — list
- `POST /api/admin/skills` — add (409 on duplicate id)
- `PUT /api/admin/skills/:id` — update (404 if unknown)
- `DELETE /api/admin/skills/:id` — remove **and scrub the deleted id
  out of any other skill's prerequisites + encompassedSkills**, so
  the resulting graph stays validatable

Every mutation re-runs `createSkillGraph().validate()` before the
save, returning 400 with the engine's structural errors. A bad edit
can't land a corrupted graph in storage.

## Future: seeding learners from the system curriculum

The system curriculum exists today as a contract surface; the engine
manager still hydrates per-user curricula. Wiring "new learner
auto-seeded from the system curriculum" is a follow-up — an
engine-manager change rather than a schema or API change.
