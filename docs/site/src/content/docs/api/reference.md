---
title: API reference
description: HTTP API surface for the Noesis server.
---

The full HTTP API reference lives in
[`docs/API_REFERENCE.md`](https://github.com/ChrisTelles152/noesis-core/blob/main/docs/API_REFERENCE.md)
in the repository — that's the canonical source. This page summarizes
the surface so you can scan it quickly.

## Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Username + password sign-in |
| `POST` | `/api/auth/logout` | End the session |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/auth/check-username/:username` | Availability check |

## Core engine (per-user)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/core/next-action` | Planner's recommended next action |
| `POST` | `/api/core/practice` | Submit a practice event |
| `GET` | `/api/core/progress` | Per-learner mastery roll-up |
| `GET` | `/api/core/events` | Paginated event log |
| `PUT` | `/api/engine/state` | Persist a snapshot |
| `GET` | `/api/engine/state` | Load a snapshot |

## Curriculum (per-user)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/curriculum/skills` | Save a learner's curriculum |
| `GET` | `/api/curriculum/skills` | Load it back |

## Mentor (admin-only)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/mentor/learners` | List every learner with progress |
| `GET` | `/api/mentor/export.csv` | CSV of the same |

## Authoring (admin-only)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/skills` | System-wide curriculum |
| `POST` | `/api/admin/skills` | Add a topic |
| `PUT` | `/api/admin/skills/:id` | Update a topic |
| `DELETE` | `/api/admin/skills/:id` | Remove a topic + scrub prereqs |

## Analytics

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/analytics/attention` | Paginated, date-range filterable |
| `GET` | `/api/analytics/mastery` | Same |
| `GET` | `/api/learning/events` | Same |

## WebSocket

`ws://<host>/ws` — broadcasts on every event-store route so other tabs
or dashboards see practice events in real time.
