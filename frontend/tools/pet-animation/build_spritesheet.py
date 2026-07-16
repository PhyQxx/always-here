#!/usr/bin/env python3
"""Build a 19-row pet atlas while preserving the original v1 rows byte-for-pixel."""

import argparse
from pathlib import Path
from PIL import Image

CELL_WIDTH = 192
CELL_HEIGHT = 208
COLS = 8
ROWS = 19
WIDTH = CELL_WIDTH * COLS
HEIGHT = CELL_HEIGHT * ROWS


def parse_row(value: str):
    row_text, path_text = value.split("=", 1)
    row = int(row_text)
    if row < 9 or row >= ROWS:
        raise argparse.ArgumentTypeError("new rows must be between 9 and 18")
    return row, Path(path_text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--row", action="append", default=[], type=parse_row,
                        help="row_number=normalized_strip.png")
    args = parser.parse_args()

    base = Image.open(args.base).convert("RGBA")
    valid_base_heights = {CELL_HEIGHT * 9, HEIGHT}
    if base.width != WIDTH or base.height not in valid_base_heights:
        raise SystemExit(
            f"base atlas must be {WIDTH}x{CELL_HEIGHT * 9} or {WIDTH}x{HEIGHT}, got {base.size}"
        )
    base_rows = base.crop((0, 0, WIDTH, CELL_HEIGHT * 9))

    atlas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    atlas.alpha_composite(base_rows, (0, 0))
    for row, strip_path in args.row:
        strip = Image.open(strip_path).convert("RGBA")
        if strip.size != (WIDTH, CELL_HEIGHT):
            raise SystemExit(f"row {row} must be {WIDTH}x{CELL_HEIGHT}, got {strip.size}")
        atlas.alpha_composite(strip, (0, row * CELL_HEIGHT))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.out, "WEBP", lossless=True, method=6)
    print(f"wrote {args.out} ({atlas.width}x{atlas.height})")


if __name__ == "__main__":
    main()
