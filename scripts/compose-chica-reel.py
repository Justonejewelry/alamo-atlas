#!/usr/bin/env python3
"""15s 9:16 Reels cut: real Atlas screenshots + talking Chica PIP + fuchsia titles."""
from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path("/workspace")
DEMO = ROOT / "screenshots" / "demo"
WORK = ROOT / "screenshots" / "reel"
FRAMES = WORK / "frames"
CHICA_VID = ROOT / "artifacts" / "imagine_videos" / "cb27deec-b4b8-46ad-b27c-56725aa189cb.mp4"
CHICA_FR = WORK / "chica-frames"
AUDIO = ROOT / "artifacts" / "chica-narration.mp3"
OUT = ROOT / "screenshots" / "chica-atlas-reel.mp4"

W, H, FPS, DUR = 1080, 1920, 30, 15.0
N = int(DUR * FPS)
FUCHSIA = (255, 46, 200)
CREAM = (255, 244, 250)
INK = (8, 8, 10)
ANTON = str(ROOT / "fonts" / "Anton-Regular.ttf")
ARCHIVO = str(ROOT / "fonts" / "ArchivoBlack-Regular.ttf")

# Word-locked titles from narration timestamps
TITLES = [
    (0.00, 2.10, "I'M CHICA"),
    (2.10, 3.90, "ALAMO ATLAS"),
    (3.90, 7.45, "LIVE PINS"),
    (7.45, 9.50, "SEARCH BY NAME"),
    (9.50, 11.75, "HOTTEST ZIPS"),
    (11.75, 15.05, "CHECK IT OUT"),
]

SHOTS = [
    (0.00, 2.10, str(DEMO / "01-live-map.png")),
    (2.10, 3.90, str(DEMO / "01-live-map.png")),
    (3.90, 5.70, str(DEMO / "02-live-board.png")),
    (5.70, 7.45, str(DEMO / "03-call-focus.png")),
    (7.45, 9.50, str(DEMO / "06-search-hit.png")),
    (9.50, 11.75, str(WORK / "atlas-zips-mobile.png")),
    (11.75, 15.05, str(WORK / "atlas-hero-mobile.png")),
]
PANEL_Y = 228
PANEL_H = 1020

# Click beats in full-frame coords (demo panel starts at y=250)
CLICKS = [
    (4.35, 820, 250 + 420),
    (6.20, 360, 250 + 390),
    (8.20, 840, 250 + 430),
    (10.35, 520, 250 + 360),
]


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def panel_shot(path: Path) -> Image.Image:
    """Fit a screenshot into the 1080xPANEL_H demo stage."""
    im = Image.open(path).convert("RGB")
    pw, ph = W, PANEL_H
    scale = max(pw / im.width, ph / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (nw - pw) // 2
    y = 0
    return im.crop((x, y, x + pw, y + ph))


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m


def stroke_text(draw: ImageDraw.ImageDraw, xy, text, fnt, fill, stroke, sw: int) -> None:
    draw.text(xy, text, font=fnt, fill=fill, stroke_width=sw, stroke_fill=stroke)


def title_at(t: float) -> tuple[str, float]:
    for a, b, s in TITLES:
        if a <= t < b:
            return s, t - a
    return TITLES[-1][2], 0.0


def shot_at(t: float) -> str:
    for a, b, f in SHOTS:
        if a <= t < b:
            return f
    return SHOTS[-1][2]


def cursor_state(t: float) -> tuple[float, float, float]:
    """Return x, y, click_age (seconds since last click, or 99)."""
    pts = [(0.15, 900, 1500)] + [(c[0], c[1], c[2]) for c in CLICKS] + [(14.6, 820, 1480)]
    for i in range(len(pts) - 1):
        t0, x0, y0 = pts[i]
        t1, x1, y1 = pts[i + 1]
        if t <= t1 or i == len(pts) - 2:
            u = 0 if t1 == t0 else min(1.0, max(0.0, (t - t0) / (t1 - t0)))
            u = u * u * (3 - 2 * u)
            x = x0 + (x1 - x0) * u
            y = y0 + (y1 - y0) * u
            age = 99.0
            for ct, *_ in CLICKS:
                if t >= ct:
                    age = min(age, t - ct)
            return x, y, age
    return pts[-1][1], pts[-1][2], 99.0


def draw_cursor(img: Image.Image, x: float, y: float, age: float) -> None:
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    if age < 0.50:
        r = 22 + age * 260
        a = int(220 * (1 - age / 0.50))
        bbox = [x - r, y - r, x + r, y + r]
        d.ellipse(bbox, outline=FUCHSIA + (a,), width=10)
        d.ellipse([x - 18, y - 18, x + 18, y + 18], fill=(255, 255, 255, 220))
        d.ellipse([x - 8, y - 8, x + 8, y + 8], fill=FUCHSIA + (255,))
    # pointer
    pts = [(x, y), (x + 8, y + 34), (x + 16, y + 24), (x + 28, y + 48), (x + 36, y + 44), (x + 22, y + 18), (x + 34, y + 16)]
    d.polygon(pts, fill=(255, 255, 255, 255), outline=FUCHSIA + (255,))
    img.alpha_composite(overlay)


def draw_titles(img: Image.Image, text: str, age: float, t: float) -> None:
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    pop = min(1.0, age / 0.14)
    scale = 0.88 + 0.12 * pop
    alpha = int(255 * pop)
    if text == "SEARCH BY NAME":
        lines = ["SEARCH", "BY NAME"]
    elif text == "CHECK IT OUT":
        lines = ["CHECK", "IT OUT"]
    elif text == "I'M CHICA":
        lines = ["I'M", "CHICA"]
    elif text == "HOTTEST ZIPS":
        lines = ["HOTTEST", "ZIPS"]
    else:
        lines = [text]
    size = 150 if max(len(s) for s in lines) <= 8 else 124
    fnt = font(ANTON, int(size * scale))
    y = 1100 if t >= 11.75 else 36
    for line in lines:
        bbox = d.textbbox((0, 0), line, font=fnt)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2
        d.text((x + 3, y + 6), line, font=fnt, fill=(0, 0, 0, int(180 * pop)))
        d.text((x, y), line, font=fnt, fill=FUCHSIA + (alpha,), stroke_width=8, stroke_fill=(0, 0, 0, alpha))
        y += int(size * scale * 0.88)
    uw = 180
    d.rectangle(((W - uw) // 2, y, (W + uw) // 2, y + 8), fill=FUCHSIA + (alpha,))
    if t >= 11.75:
        sub = font(ARCHIVO, 22)
        url = "justonejewelry.github.io/Chicas-Map/atlas"
        bbox = d.textbbox((0, 0), url, font=sub)
        tw = bbox[2] - bbox[0]
        d.text(((W - tw) // 2, y + 18), url, font=sub, fill=CREAM + (alpha,), stroke_width=2, stroke_fill=(0, 0, 0, alpha))
    img.alpha_composite(overlay)


def extract_chica() -> list[Path]:
    CHICA_FR.mkdir(parents=True, exist_ok=True)
    existing = sorted(CHICA_FR.glob("c-*.jpg"))
    if len(existing) >= 300:
        return existing
    run(["ffmpeg", "-y", "-i", str(CHICA_VID), "-vf", "fps=30,scale=480:-1", str(CHICA_FR / "c-%04d.jpg")])
    return sorted(CHICA_FR.glob("c-*.jpg"))


def mouth_scores(paths: list[Path]) -> np.ndarray:
    scores = []
    for p in paths:
        im = Image.open(p).convert("L")
        w, h = im.size
        # mouth band from QC: lower-mid face
        box = (int(w * 0.38), int(h * 0.52), int(w * 0.64), int(h * 0.68))
        crop = np.asarray(im.crop(box), dtype=np.float32)
        # open mouth → darker hole → lower mean, higher std
        scores.append(float(crop.std() - 0.35 * crop.mean()))
    s = np.array(scores, dtype=np.float32)
    s = (s - s.min()) / (float(np.ptp(s)) + 1e-6)
    return s


def audio_rms(n_frames: int) -> np.ndarray:
    raw_path = WORK / "narration.s16"
    run(["ffmpeg", "-y", "-i", str(AUDIO), "-ac", "1", "-ar", "24000", "-f", "s16le", str(raw_path)])
    raw = np.frombuffer(raw_path.read_bytes(), dtype=np.int16).astype(np.float32)
    hop = int(24000 / FPS)
    out = np.zeros(n_frames, dtype=np.float32)
    for i in range(n_frames):
        sl = raw[i * hop : (i + 1) * hop]
        if sl.size:
            out[i] = float(np.sqrt(np.mean(sl * sl)))
    if out.max() > 0:
        out = out / out.max()
    # slight smooth
    k = np.array([0.15, 0.2, 0.3, 0.2, 0.15])
    out = np.convolve(out, k, mode="same")
    return out


def lip_index(mouth: np.ndarray, rms: np.ndarray) -> list[int]:
    """Map each output frame to a Chica frame whose mouth matches speech energy."""
    n_src = len(mouth)
    play = 0
    idx = []
    for i, e in enumerate(rms):
        # keep roughly in time, with a small search window for mouth shape
        target = int(i * (n_src / max(1, len(rms))))
        lo = max(0, min(play, target) - 2)
        hi = min(n_src - 1, max(play, target) + 6)
        window = range(lo, hi + 1)
        if e < 0.12:
            pick = min(window, key=lambda j: mouth[j] + 0.01 * abs(j - target))
        else:
            pick = max(window, key=lambda j: mouth[j] - 0.015 * abs(j - target))
        # don't jump backward more than 1
        if pick < play - 1:
            pick = play
        play = min(n_src - 1, pick + (0 if e < 0.08 else 1))
        idx.append(int(pick))
    return idx


def paste_chica(base: Image.Image, frame: Image.Image) -> None:
    # bottom-right sitting PIP
    tw = 300
    th = int(frame.height * (tw / frame.width))
    dog = frame.resize((tw, th), Image.Resampling.LANCZOS).convert("RGBA")
    mask = rounded_mask((tw, th), 28)
    ring = Image.new("RGBA", (tw + 14, th + 14), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.rounded_rectangle((0, 0, tw + 13, th + 13), radius=34, fill=FUCHSIA + (255,))
    inner = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    inner.paste(dog, (0, 0), mask)
    x = W - tw - 22
    y = H - th - 36
    base.alpha_composite(ring, (x - 8, y - 8))
    base.alpha_composite(inner, (x, y))
    # nameplate
    d = ImageDraw.Draw(base)
    fnt = font(ARCHIVO, 18)
    d.rounded_rectangle((x + 16, y + th - 44, x + 150, y + th - 14), radius=12, fill=FUCHSIA + (240,))
    d.text((x + 32, y + th - 40), "CHICA", font=fnt, fill=(255, 255, 255, 255))


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    FRAMES.mkdir(parents=True, exist_ok=True)
    print("extract chica")
    chica_paths = extract_chica()
    print("chica frames", len(chica_paths))
    mouth = mouth_scores(chica_paths)
    rms = audio_rms(N)
    picks = lip_index(mouth, rms)
    cache: dict[str, Image.Image] = {}

    for i in range(N):
        t = i / FPS
        fn = shot_at(t)
        if fn not in cache:
            cache[fn] = panel_shot(Path(fn))
        canvas = Image.new("RGBA", (W, H), INK + (255,))
        canvas.paste(cache[fn], (0, PANEL_Y))
        title, age = title_at(t)
        draw_titles(canvas, title, age, t)
        cx, cy, cage = cursor_state(t)
        if t < 13.4:
            draw_cursor(canvas, cx, cy, cage)
        dog = Image.open(chica_paths[picks[i]]).convert("RGB")
        paste_chica(canvas, dog)
        out = FRAMES / f"f-{i:04d}.jpg"
        canvas.convert("RGB").save(out, "JPEG", quality=86)
        if i % 30 == 0:
            print(f"frame {i}/{N} {title}")

    # pad audio to 15s
    pad = WORK / "narration-15.m4a"
    run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(AUDIO),
            "-af",
            "apad=pad_dur=3",
            "-t",
            "15",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(pad),
        ]
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(FPS),
            "-i",
            str(FRAMES / "f-%04d.jpg"),
            "-i",
            str(pad),
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "17",
            "-preset",
            "medium",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-r",
            str(FPS),
            str(OUT),
        ]
    )
    print("wrote", OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
