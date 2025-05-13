# Noesis Core

**Cross-platform adaptive learning SDK for attention-aware, personalized education.**  
Built for XR, desktop, mobile, and web platforms.

---

## 🧠 Purpose

Noesis Core is the foundation for adaptive, neuro-aware educational experiences.  
It provides modular SDKs to track attention, orchestrate voice interaction, and integrate learning content with modern UI/UX frameworks.

> "Learning infrastructure should adapt to the learner — not the other way around."

---

## 🔧 Key Modules

| Module             | Description                                                                 |
|--------------------|-----------------------------------------------------------------------------|
| `client/`          | Frontend logic and UI scaffolding                                           |
| `server/`          | Backend endpoints (auth, telemetry, LLMs)                                   |
| `shared/`          | Shared logic (types, interfaces, attention models)                          |
| `attached_assets/` | Static assets, icons, demos                                                  |

---

## 📦 Features

- 👁️ Attention-aware learning (gaze, input patterns, timing)
- 🗣️ Voice interface support for LLM and command interaction
- 🧠 Compatible with LLM orchestration layers (OpenAI, Claude, local)
- 🕶️ XR-ready: supports Quest, Vision Pro, and desktop simulation
- ⚡ Modern stack: Vite, TypeScript, Tailwind, Node/Express

---

## 🚀 Getting Started

```bash
git clone https://github.com/ChrisTelles152/noesis-core.git
cd noesis-core
npm install
npm run dev
