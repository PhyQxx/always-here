# Codex Pet Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Always Here choose and render local Codex-format pets from `%USERPROFILE%\.codex\pets`.

**Architecture:** Add a main-process pet resource module that safely scans local pet packages and returns sprite data URLs through IPC. Keep renderer code filesystem-free, with `pet.js` acting only as a sprite player and `settings.js` owning the selector UI.

**Tech Stack:** Electron, CommonJS in main/preload, browser ES modules in renderer, Node built-in test runner.

---

### Task 1: Pet Resource Module

**Files:**
- Create: `src/petStore.js`
- Create: `test/petStore.test.js`
- Modify: `package.json`

- [ ] Write tests for scanning valid pets, resolving by manifest id, and rejecting unsafe ids.
- [ ] Implement `listPets`, `findPetById`, and `getPetSpritesheetDataUrl`.
- [ ] Run `npm test`.

### Task 2: IPC Wiring

**Files:**
- Modify: `src/main.js`
- Modify: `src/preload.js`

- [ ] Add default `petId: "hina"` to config.
- [ ] Expose `list-pets` and `get-pet-spritesheet` IPC handlers.
- [ ] Expose `listPets()` and `getPetSpritesheet(petId)` in preload.

### Task 3: Renderer Pet Player

**Files:**
- Modify: `src/renderer/widgets/pet.js`
- Modify: `src/renderer/widgets/pet.css`
- Modify: `src/renderer/index.html`

- [ ] Remove click, double-click, happiness, mood, and speech behavior.
- [ ] Load the selected pet's spritesheet via preload IPC.
- [ ] Draw the standard Codex idle row from 192x208 cells.

### Task 4: Settings Selector

**Files:**
- Modify: `src/renderer/settings.js`
- Modify: `src/renderer/settings.css`
- Modify: `src/renderer/index.html`

- [ ] Populate a select box from `listPets()`.
- [ ] Save `config.petId` on change.
- [ ] Reload the pet widget after the selection changes.

### Task 5: Verification

**Files:**
- No new files.

- [ ] Run `npm test`.
- [ ] Run a syntax/import smoke check with Node.
- [ ] Start Electron if possible and confirm the app launches.
