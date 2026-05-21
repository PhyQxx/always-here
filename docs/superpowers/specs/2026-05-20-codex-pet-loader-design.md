# Codex Pet Loader Design

Always Here should use the same local pet package shape as Codex:
`%USERPROFILE%\.codex\pets\<folder>\pet.json` plus `spritesheet.webp`.
Always Here stores its own selected pet id in its app config and does not follow
Codex's current `selected-avatar-id`.

The Electron main process owns filesystem access. It scans the Codex pets
directory, validates each `pet.json`, resolves each spritesheet inside its pet
folder, and exposes safe IPC methods to the renderer. The renderer only receives
pet metadata and a data URL for the selected spritesheet.

The pet widget drops the earlier touch, feed, happiness, and speech behavior.
It becomes a Codex-style sprite player: load selected pet, draw frames from the
standard 192x208 atlas, and loop through the idle row.

Settings gains a pet selector populated from the local Codex pets directory.
Changing the selector saves `config.petId` and reloads the widget.
