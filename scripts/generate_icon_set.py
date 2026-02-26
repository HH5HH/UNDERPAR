#!/usr/bin/env python3

"""
Generate the UnderPAR icon suite from a pre-cropped master icon.

This intentionally does a direct resize pipeline only:
- No auto-cropping
- No masking
- No color processing
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

DEFAULT_SOURCE = REPO_ROOT / "icons" / "underpar-source-master.png"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "icons"
DEFAULT_TARGET = 8192
DEFAULT_SIZES = [16, 24, 32, 48, 64, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512, 1024, 2048, 4096, 8192]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def fail(message: str) -> None:
    print(f"[generate_icon_set] {message}", file=sys.stderr)
    sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build UnderPAR icon suite from pre-cropped source artwork.")
    parser.add_argument("--source", default=str(DEFAULT_SOURCE), help=f"Source image path. Default: {DEFAULT_SOURCE}")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help=f"Output directory. Default: {DEFAULT_OUTPUT_DIR}")
    parser.add_argument("--target", type=int, default=DEFAULT_TARGET, help=f"Max generated size. Default: {DEFAULT_TARGET}")
    return parser.parse_args()


def read_source(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if image is None:
        fail(f"Unable to read source image: {path}")

    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA)
    elif image.shape[2] == 3:
        alpha = np.full((image.shape[0], image.shape[1], 1), 255, dtype=np.uint8)
        image = np.concatenate([image, alpha], axis=2)
    elif image.shape[2] != 4:
        fail(f"Unsupported channel count in source image: {image.shape[2]}")

    return image


def resize_icon(image: np.ndarray, size: int) -> np.ndarray:
    h, w = image.shape[:2]
    if h == size and w == size:
        return image
    interpolation = cv2.INTER_AREA if size < max(h, w) else cv2.INTER_LANCZOS4
    return cv2.resize(image, (size, size), interpolation=interpolation)


def write_png(path: Path, image: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok = cv2.imwrite(str(path), image, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    if not ok:
        fail(f"Failed to write {path}")


def write_ico(path: Path, png_paths: list[Path]) -> None:
    cmd = ["ffmpeg", "-y"]
    for png in png_paths:
        cmd.extend(["-i", str(png)])
    for idx in range(len(png_paths)):
        cmd.extend(["-map", str(idx)])
    cmd.append(str(path))

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError:
        fail("ffmpeg is required to generate .ico files.")
    except subprocess.CalledProcessError as error:
        details = error.stderr.decode("utf-8", errors="replace").strip()
        fail(f"Failed to generate ICO: {details}")


def main() -> None:
    args = parse_args()

    source = Path(args.source).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    target = int(args.target)

    if target < 16:
        fail("Target must be >= 16")

    source_image = read_source(source)

    sizes = sorted(set(size for size in DEFAULT_SIZES if size <= target) | {target})
    ico_inputs: list[Path] = []

    for size in sizes:
        icon = resize_icon(source_image, size)
        out = output_dir / f"underpar-{size}.png"
        write_png(out, icon)
        if size in ICO_SIZES:
            ico_inputs.append(out)

    write_png(output_dir / "underpar-concept-source.png", resize_icon(source_image, 1024))
    write_ico(output_dir / "underpar.ico", ico_inputs)

    print(f"[generate_icon_set] source: {source}")
    print(f"[generate_icon_set] output: {output_dir}")
    print("[generate_icon_set] generated sizes:", ", ".join(str(size) for size in sizes))


if __name__ == "__main__":
    main()
