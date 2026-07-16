#!/usr/bin/env python3
"""Extract action frames from a generated sheet and normalize them into atlas rows."""

import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

CELL_WIDTH = 192
CELL_HEIGHT = 208
ATLAS_WIDTH = CELL_WIDTH * 8


def keep_largest_component(frame):
    """Remove isolated chroma-key specks or slivers from neighboring cells."""
    alpha = frame.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    largest = []

    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if visited[offset] or pixels[x, y] <= 16:
                continue
            visited[offset] = 1
            stack = [(x, y)]
            component = []
            while stack:
                cx, cy = stack.pop()
                component.append((cx, cy))
                for ny in range(max(0, cy - 1), min(height, cy + 2)):
                    for nx in range(max(0, cx - 1), min(width, cx + 2)):
                        neighbor = ny * width + nx
                        if not visited[neighbor] and pixels[nx, ny] > 16:
                            visited[neighbor] = 1
                            stack.append((nx, ny))
            if len(component) > len(largest):
                largest = component

    keep = set(largest)
    output = frame.copy()
    output_pixels = output.load()
    for y in range(height):
        for x in range(width):
            if (x, y) not in keep:
                red, green, blue, _ = output_pixels[x, y]
                output_pixels[x, y] = (red, green, blue, 0)
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--spec", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()

    image = Image.open(args.image).convert("RGBA")
    spec = json.loads(args.spec.read_text())
    for mask in spec.get("masks", []):
        ImageDraw.Draw(image).rectangle(mask, fill=(0, 0, 0, 0))

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for action, boxes in spec["actions"].items():
        frames = []
        bounds = []
        for box in boxes:
            frame = keep_largest_component(image.crop(tuple(box)))
            bbox = frame.getchannel("A").getbbox()
            if bbox is None:
                raise SystemExit(f"{action}: empty source frame {box}")
            frames.append(frame.crop(bbox))
            bounds.append((bbox[2] - bbox[0], bbox[3] - bbox[1]))

        max_width = max(width for width, _ in bounds)
        max_height = max(height for _, height in bounds)
        scale = min(176 / max_width, 196 / max_height)
        strip = Image.new("RGBA", (ATLAS_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
        for index, frame in enumerate(frames):
            width = max(1, round(frame.width * scale))
            height = max(1, round(frame.height * scale))
            resized = frame.resize((width, height), Image.Resampling.NEAREST)
            x = index * CELL_WIDTH + (CELL_WIDTH - width) // 2
            y = CELL_HEIGHT - height - 4
            strip.alpha_composite(resized, (x, y))

        output = args.out_dir / f"{action}.png"
        strip.save(output)
        print(f"wrote {output} ({len(frames)} frames, scale={scale:.3f})")


if __name__ == "__main__":
    main()
