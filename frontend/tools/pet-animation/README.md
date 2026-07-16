# Pet animation asset pipeline

The files in `references/` are source/reference images. `normalized/` contains
standard 1536×208 atlas rows. Run commands from `frontend/` with a Python that
provides Pillow.

Normalize generated sheets:

```sh
python tools/pet-animation/normalize_action_sheet.py \
  --image tools/pet-animation/references/pilot-actions-alpha.png \
  --spec tools/pet-animation/pilot-actions.json \
  --out-dir tools/pet-animation/normalized
```

Repeat with `second-batch.json`, `eat.json`, and `dance-spin.json` and their
matching alpha images.

Build the atlas:

```sh
python tools/pet-animation/build_spritesheet.py \
  --base src/renderer/assets/pets/hina/spritesheet.webp \
  --out /tmp/hina-v2.webp \
  --row 9=tools/pet-animation/normalized/dance.png \
  --row 10=tools/pet-animation/normalized/cheer.png \
  --row 11=tools/pet-animation/normalized/spin.png \
  --row 12=tools/pet-animation/normalized/sleep.png \
  --row 13=tools/pet-animation/normalized/yawn.png \
  --row 14=tools/pet-animation/normalized/stretch.png \
  --row 15=tools/pet-animation/normalized/nod.png \
  --row 16=tools/pet-animation/normalized/study.png \
  --row 17=tools/pet-animation/normalized/stomp.png \
  --row 18=tools/pet-animation/normalized/eat.png
```

Validate before replacing the packaged asset:

```sh
python tools/pet-animation/validate_spritesheet.py \
  --image /tmp/hina-v2.webp \
  --manifest src/renderer/assets/pets/hina/pet.json
```
