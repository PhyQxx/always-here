#!/usr/bin/env python3
"""Validate dimensions and declared non-empty frames in a pet atlas."""

import argparse
import json
from pathlib import Path
from PIL import Image

CELL_WIDTH = 192
CELL_HEIGHT = 208

ACTION_ROWS = {
    "idle": (0, 6), "runningRight": (1, 8), "runningLeft": (2, 8),
    "waving": (3, 4), "jumping": (4, 5), "failed": (5, 8),
    "waiting": (6, 6), "running": (7, 6), "review": (8, 6),
    "dance": (9, 6), "cheer": (10, 4), "spin": (11, 6),
    "sleep": (12, 4), "yawn": (13, 4), "stretch": (14, 4),
    "nod": (15, 4), "study": (16, 6), "stomp": (17, 4), "eat": (18, 6),
}


def alpha_bbox(image):
    return image.getchannel("A").getbbox()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    args = parser.parse_args()

    image = Image.open(args.image).convert("RGBA")
    manifest = json.loads(args.manifest.read_text())
    actions = manifest.get("supportedActions") or list(ACTION_ROWS)[:9]
    errors = []

    if image.width != CELL_WIDTH * 8 or image.height % CELL_HEIGHT:
        errors.append(f"invalid atlas size {image.width}x{image.height}")

    for action in actions:
        if action not in ACTION_ROWS:
            errors.append(f"unknown declared action: {action}")
            continue
        row, frames = ACTION_ROWS[action]
        if (row + 1) * CELL_HEIGHT > image.height:
            errors.append(f"{action}: row {row} exceeds image height")
            continue
        for frame in range(frames):
            cell = image.crop((frame * CELL_WIDTH, row * CELL_HEIGHT,
                               (frame + 1) * CELL_WIDTH, (row + 1) * CELL_HEIGHT))
            if alpha_bbox(cell) is None:
                errors.append(f"{action}: frame {frame} is fully transparent")

    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors))
        raise SystemExit(1)
    print(f"OK: {len(actions)} actions validated in {image.width}x{image.height}")


if __name__ == "__main__":
    main()
