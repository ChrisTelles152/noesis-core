# INTENTION.md — Noesis

## What This Is
Noesis is a deterministic, domain-agnostic learning and mastery infrastructure — a cross-platform SDK with an invariant core engine that compresses complex knowledge into human-bandwidth-respecting sequences. It is positioned as the "engine" layer (analogous to "Stripe for adaptive learning"): developers and institutions embed it to get mastery progression, spaced reinforcement, attention/engagement signals, and optional LLM orchestration without owning the learning loop themselves. Noesis Core is open; orchestration, analytics, and enterprise tooling are the proprietary monetization surface.

## The Problem It Solves
Modern learning systems optimize for content exposure, engagement metrics, and gamified retention — not for durable mastery. They ignore cognitive bandwidth limits, fragment learning across disconnected tools, conflate engagement with understanding, and are non-deterministic and non-auditable, which makes serious pedagogy and research impossible to run on top of them. Noesis exists as a first-principles alternative: a replayable, testable, subject-agnostic kernel that other products consume rather than reinvent.

## Who It's For
Priority order:
1. Self-directed learners pursuing real mastery (polymaths, engineers, founders).
2. Builders of educational systems / developers integrating adaptive learning into their apps (web, mobile, XR).
3. Researchers in learning science who need replay, audit, and longitudinal analysis.
4. Schools and institutions seeking infrastructure rather than ideology.
5. Phase-1 end-user wedge: elite STEM high-schoolers in Brazil (top 1–5%, grades 8–12, Olympiad/ITA/IME/USP/Unicamp aspirants) as the first concrete content-and-program deployment.

## What Success Looks Like
Two horizons, in sequence:
- **Core production-ready (current stage):** Noesis Core SDK published as a dependency-minimal TypeScript package with full determinism, replay correctness, injectable clock and RNG, event-sourced state, strong tests, public wiki, and a deployed docs site (Vercel) plus a runnable demo (Replit). GitHub remains canonical source of truth.
- **Phase-1 wedge proof (Year 1):** A live Noesis v1 used by 30–100 real Brazilian students completing a 6–8 week structured program in advanced math (and possibly physics), with measurable pre/post learning gains, a coherent YouTube content slate aligned to the topic graph, and a published Golden Sequence canon website. Success is measured by durable mastery and student impact — not vanity metrics.

## MVP Feature Set (In Scope)
- **Noesis Core (engine):** learner state representation; mastery state advancement; sequencing constraint enforcement; confidence and decay tracking; spaced reinforcement scheduling; deterministic, pure state transitions; full event log → replayable state.
- **Canonical learning loop:** Concept Introduction → Active Recall → Application → Reflection → Spaced Reinforcement (Core enforces existence and order, not presentation).
- **Cognitive-State Vector (NALS spec):** attention (A), recall strength (R), affect (F) — each with confidence and timestamp; updated via input adapters.
- **Mastery Graph:** DAG of concepts with prerequisite edges; per-concept mastery values [0,1]; configurable mastery threshold; BKT-compatible or simple logistic update rules.
- **Input Adapters (per platform):** XR sensors (eye/head/gesture), webcam/mouse/keyboard latency, mobile touch/motion/audio, optional biometrics — all normalized into the unified attention engine.
- **Pluggable LLM Orchestration Layer ("Noesis Tutor"):** planner / explainer / evaluator interface; rules-based fallback; LLM-agnostic.
- **Developer SDKs/Wrappers:** TypeScript first (most universal), then Unity, React/React Native, Swift, Kotlin.
- **Analytics/Dashboard:** mastery curves, attention heatmaps, drop-off analysis, exportable data.
- **Phase-1 product surface (Noesis v1 for Brazil STEM wedge):** 80–150-node math topic graph; diagnostic placement quiz; guided path with dependency unlocks; per-node explanations + worked examples + exercises with immediate feedback; spaced review queue from mistakes; minimal mentor dashboard (student list, progress, CSV export); simple internal authoring admin.
- **Companion assets:** YouTube channel (12–20 flagship lessons, 20–40 problem-solving shorts, host with Olympiad/ITA/IME/USP credibility); Golden Sequence website (3–5 curated reading sequences linked into Noesis nodes).

## Explicitly Out of Scope
- Not a content marketplace.
- Not a social network or social-feature layer.
- Not a school replacement or full LMS.
- Not a gamified-dopamine app — no streaks-as-reward, no urgency cues, no addiction loops.
- Not an LLM tutor wrapper. LLMs may assist; they never own the learning loop.
- Not a UI framework or content authoring product (those layers consume Core, not modify it).
- No native mobile app in Year 1 — responsive web only.
- No payments / monetization in Year 1 — pilots are free.
- No multi-subject expansion in Year 1 (no humanities, no general school curriculum). Physics inclusion in v1 deferred / optional.
- No real XR sensor integration in the first MVP demo (simulated attention via explicit user feedback).
- No hidden state, no nondeterministic side effects, no heavy runtime dependencies in Core. Determinism regressions are always breaking.
- Brand and design must NOT signal surveillance, manipulation, attention extraction, gamification, or social comparison.

## Key Constraints
- **Geography & language:** Brazil-first for Phase 1, fully Portuguese; US Delaware C-Corp parent with Brazilian subsidiary contemplated for fundraising/operations; eventual global scope.
- **Funding:** primarily personal capital early; investor-ready structure later.
- **Founder time:** founder has a full-time job and is architect/capital provider/recruiter, not day-to-day operator. Execution requires hiring a small core team (founding tech lead + lead educator + part-time producer/ops + freelancers).
- **Regulatory:** Phase-1 wedge deliberately chosen to live outside MEC/K-12 compliance burden; later institutional phases (school, university, university-anchored city, 10–30 yr horizon) accept heavier regulation.
- **Technical:** Core must be deterministic, dependency-minimal, replayable, subject-agnostic, UI-agnostic. Time and randomness must be injectable. Event-sourced state is required.
- **Architectural discipline:** open-core split — Core SDK + platform adapters open; orchestration API, full analytics, enterprise features proprietary. Two GitHub orgs proposed (`noesis-open`, `noesis-dev`).
- **Brand:** "sacred-tech" aesthetic — cognitive minimalism, calm, timeless, non-exploitative. Spiral-eye logo. Locked palette (Cloudbone White, Slate Grey, Neural Copper, Iris Bloom, Glacial Cyan). Geometric sans for UI, soft serif for philosophical/long-form.
- **Design rule:** if it feels impressive, it is probably too loud. Remove until clarity emerges.
- **Decision rule going forward:** every choice ships with pros/cons, a recommendation, and rationale tied to Noesis goals + founder constraints.

## Current Status
- **Stage:** Core Finalization. Everything beyond Core is deferred until Core is correct.
- **Built:** `noesis-core` TypeScript repo exists on GitHub with `index.ts` initialized; Node 20 + ESM + ts-node toolchain debugged via `node --loader ts-node/esm`.
- **Documentation:** Canonical Context Document v1.0 written (constitution + design spine, reusable across chats). GitHub wiki for Noesis Core written in markdown, contributor-facing, public-repo-ready.
- **Specifications drafted:** NALS (Noesis Adaptive-Learning Stack) v1.0 technical spec — Cognitive-State Vector, Mastery Graph algebra and update rules, Attention-Loop API, device-agnostic interface contracts, on-device privacy guidelines, reference curriculum schema, Unity quick-start.
- **MVP demo defined:** "Adaptive Learning Coach" — browser-first, rules-based orchestrator, simulated attention via user feedback, deployable on Vercel, separate repo (`noesis-mvp-demo`) from `noesis-sdk`.
- **Sprint Engine module specced:** first-party optional module shipping with Core, ~30/5 Pomodoro-style cycles, integrates via events to User-State Graph and Spaced-Repetition service.
- **Brand DNA locked:** name, tagline ("Where your mind goes to grow"), spiral-eye logo, palette, type system, design system export ready for website-builder agent handoff.
- **Phase-1 wedge selected:** elite STEM high-schoolers in Brazil. Year-1 timeline drafted (Months 0–3 thesis + hires, Months 4–8 closed beta + first videos + Golden Sequence site, Months 9–12 6–8 week pilot with 30–100 students).
- **Topic graph skeleton:** middle and upper-secondary math, science, reading/writing, Portuguese, English micro-skills with cross-domain interrelations enumerated.

## Open Questions
- For-profit vs non-profit structure for Noesis (and the broader ecosystem). Hybrid Delaware C-Corp + Brazilian subsidiary contemplated but not finalized.
- Open-source license: MIT vs Apache 2 — unresolved.
- Whether the two-org GitHub split (`noesis-open` / `noesis-dev`) is actually executed.
- Whether physics is in v1 or deferred to v2.
- Final public brand/naming for the YouTube channel and umbrella initiative (separate from "Noesis" the SDK).
- Whether the MVP demo must include real LLM calls now or can stay rules-based until later.
- Privacy / data governance / telemetry policy specifics — not yet drafted.
- Packaging strategy (npm, PyPI, etc.) and which language ecosystems get first-class support beyond TypeScript.
- Final mastery-update algorithm: simple logistic vs full BKT with guess/slip parameters.
- Shape of later institutions beyond Phase 1 (free school for low-income high-aptitude students vs cross-subsidized model vs micro-campus vs full university vs university-anchored city).
- Primary current audience priority: developer adoption vs investor demoability vs internal team — drives docs/site/demo emphasis.
