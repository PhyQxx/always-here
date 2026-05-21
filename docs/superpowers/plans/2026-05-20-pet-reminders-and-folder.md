# Pet Reminders And Folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable pet reminders and a configurable Codex pet folder.

**Architecture:** Keep filesystem and system notification work in Electron main IPC. Keep reminder timing decisions in a small renderer-side module with automated tests, and let the pet widget render reminder bubbles and trigger pet actions.

**Tech Stack:** Electron, CommonJS main/preload, browser ES modules, Node built-in test runner.

---

### Task 1: Reminder Rule Module

**Files:**
- Create: `src/renderer/widgets/petReminders.mjs`
- Create: `test/petReminders.test.js`

- [ ] Test default reminder settings.
- [ ] Test water and sedentary interval normalization with a 5-minute minimum.
- [ ] Test due reminder generation for hourly, water, sedentary, and work-time reminders.

### Task 2: Main IPC

**Files:**
- Modify: `src/main.js`
- Modify: `src/preload.js`

- [ ] Add `petFolderPath` and `reminders` defaults.
- [ ] Add `choose-pet-folder` IPC using Electron's directory picker.
- [ ] Add `show-notification` IPC using Electron Notification.
- [ ] Make `list-pets` and `get-pet-spritesheet` read from the configured pet folder.

### Task 3: Renderer UI

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/settings.js`
- Modify: `src/renderer/settings.css`
- Modify: `src/renderer/utils/config.js`
- Modify: `src/renderer/widgets/pet.js`
- Modify: `src/renderer/widgets/pet.css`

- [ ] Add pet bubble markup.
- [ ] Add settings controls for pet folder and reminder toggles.
- [ ] Add number inputs for water and sedentary intervals.
- [ ] Schedule reminders in the pet widget and show bubbles/system notifications.

### Task 4: Verification

**Files:**
- No new files.

- [ ] Run `npm.cmd test`.
- [ ] Run `node --check` on changed JavaScript files.
- [ ] Launch Electron for a short smoke test.
