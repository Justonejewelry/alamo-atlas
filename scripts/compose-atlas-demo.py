#!/usr/bin/env python3
"""Build a 16:9 feature video from real Alamo Atlas / Chicas Map screenshots."""
from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path("/workspace")
DEMO = ROOT / "screenshots" / "demo"
WORK = ROOT / "screenshots" / "demo-frames"
OUT = ROOT / "screenshots" / "alamo-atlas-demo.mp4"
LOGO = ROOT / "public" / "logo.jpg"

W, H = 1920, 1080
FPS = 30
ACCENT = (198, 18, 175)
CREAM = (247, 242, 234)
MUTED = (176, 170, 164)
BG = (10, 11, 12)
PINE = (26, 92, 68)

FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

SLIDES = [
    {
        "kind": "title",
        "dur": 2.8,
        "kicker": "CHICA'S MAP  ·  CIVIC LAYER",
        "title": "Alamo Atlas",
        "sub": "Live SAPD dispatch and neighborhood crime reports.\nSan Antonio. Public data. Not 911.",
    },
    {
        "kind": "shot",
        "file": "01-live-map.png",
        "dur": 3.4,
        "kicker": "01  LIVE MAP",
        "title": "On-scene pins, right now",
        "bias": "top",
    },
    {
        "kind": "shot",
        "file": "02-live-board.png",
        "dur": 3.2,
        "kicker": "02  LIVE BOARD",
        "title": "Units already working the call",
        "bias": "right",
    },
    {
        "kind": "shot",
        "file": "03-call-focus.png",
        "dur": 3.0,
        "kicker": "03  HUNDRED-BLOCK",
        "title": "Tap a pin. Fly to the street.",
        "bias": "center",
    },
    {
        "kind": "shot",
        "file": "04-reports.png",
        "dur": 3.2,
        "kicker": "04  REPORTS",
        "title": "87,673 written offenses, year to date",
        "bias": "top",
    },
    {
        "kind": "shot",
        "file": "06-search-hit.png",
        "dur": 3.2,
        "kicker": "05  SEARCH BY NAME",
        "title": "Every published field. Search theft, ZIP, ID.",
        "bias": "right",
    },
    {
        "kind": "shot",
        "file": "07-spanish.png",
        "dur": 2.6,
        "kicker": "06  EN / ES",
        "title": "English or Spanish. Same pack.",
        "bias": "top",
    },
    {
        "kind": "shot",
        "file": "08-share.png",
        "dur": 2.6,
        "kicker": "07  SHARE",
        "title": "Copy a neighborhood snapshot",
        "bias": "top",
    },
    {
        "kind": "shot",
        "file": "09-chicas-home.png",
        "dur": 2.8,
        "kicker": "08  CHICA'S MAP",
        "title": "Now on the pack homepage",
        "bias": "top",
    },
    {
        "kind": "shot",
        "file": "11-atlas-zip.png",
        "dur": 3.2,
        "kicker": "09  OPEN DATA SA",
        "title": "Hottest ZIPs, live from the city file",
        "bias": "top",
    },
    {
        "kind": "end",
        "dur": 3.4,
        "kicker": "GROK BUILD PROOF OF CONCEPT",
        "title": "Alamo Atlas",
        "sub": "justonejewelry.github.io/Chicas-Map/atlas",
    },
]


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def circle_logo(size: int) -> Image.Image:
    im = Image.open(LOGO).convert("RGBA")
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse((1, 1, size - 2, size - 2), outline=ACCENT + (220,), width=6)
    return Image.alpha_composite(out, ring)


def cover(src: Path, bias: str) -> Image.Image:
    im = Image.open(src).convert("RGB")
    scale = max(W / im.width, H / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    if bias == "right":
        x = nw - W
        y = 0
    elif bias == "top":
        x = (nw - W) // 2
        y = 0
    else:
        x = (nw - W) // 2
        y = (nh - H) // 2
    x = max(0, min(x, nw - W))
    y = max(0, min(y, nh - H))
    return im.crop((x, y, x + W, y + H))


def lower_third(base: Image.Image, kicker: str, title: str) -> Image.Image:
    img = base.convert("RGBA")
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.rectangle((0, H - 168, W, H), fill=(10, 11, 12, 214))
    d.rectangle((0, H - 172, W, H - 168), fill=ACCENT + (255,))
    d.rectangle((0, 0, 8, H), fill=ACCENT + (255,))
    fk = font(FONT_BOLD, 22)
    ft = font(FONT_BOLD, 44)
    d.text((48, H - 142), kicker, font=fk, fill=ACCENT)
    d.text((48, H - 104), title, font=ft, fill=CREAM)
    return Image.alpha_composite(img, overlay).convert("RGB")


def title_card(kicker: str, title: str, sub: str) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    # soft magenta wash
    wash = Image.new("RGB", (W, H), BG)
    wd = ImageDraw.Draw(wash)
    wd.ellipse((-200, 200, 900, 1300), fill=(48, 8, 42))
    wd.ellipse((1200, -200, 2100, 700), fill=(20, 40, 32))
    img = Image.blend(img, wash.filter(ImageFilter.GaussianBlur(80)), 0.55)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 8, H), fill=ACCENT)
    logo = circle_logo(240)
    img.paste(logo, (120, 420), logo)
    d.text((420, 430), kicker, font=font(FONT_BOLD, 24), fill=ACCENT)
    d.text((420, 478), title, font=font(FONT_BOLD, 92), fill=CREAM)
    y = 610
    for line in sub.split("\n"):
        d.text((420, y), line, font=font(FONT_REG, 32), fill=MUTED)
        y += 46
    d.text((420, 920), "Real screenshots  ·  Public city data  ·  Grok Build POC", font=font(FONT_REG, 22), fill=(120, 116, 112))
    return img


def end_card(kicker: str, title: str, sub: str) -> Image.Image:
    img = title_card(kicker, title, "Open it on Chica's Map")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((420, 700, 1480, 790), radius=40, fill=ACCENT)
    d.text((460, 722), sub, font=font(FONT_BOLD, 28), fill=CREAM)
    return img


def zoom_clip(png: Path, mp4: Path, seconds: float, zoom_in: bool) -> None:
    frames = int(round(seconds * FPS))
    zexpr = "min(1.045,zoom+0.00028)" if zoom_in else "if(eq(on,0),1.045,max(1.0,zoom-0.00028))"
    vf = (
        f"scale={W}:{H},zoompan=z='{zexpr}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*0.12'"
        f":d={frames}:s={W}x{H}:fps={FPS},format=yuv420p"
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-i",
            str(png),
            "-vf",
            vf,
            "-t",
            f"{seconds:.2f}",
            "-r",
            str(FPS),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "18",
            "-preset",
            "medium",
            str(mp4),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def concat(clips: list[Path], dest: Path) -> None:
    lst = WORK / "concat.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in clips), encoding="utf-8")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(lst),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "18",
            "-movflags",
            "+faststart",
            "-r",
            str(FPS),
            str(dest),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    clips: list[Path] = []
    for i, slide in enumerate(SLIDES):
        png = WORK / f"slide-{i:02d}.png"
        if slide["kind"] == "title":
            title_card(slide["kicker"], slide["title"], slide["sub"]).save(png, "PNG")
        elif slide["kind"] == "end":
            end_card(slide["kicker"], slide["title"], slide["sub"]).save(png, "PNG")
        else:
            framed = cover(DEMO / slide["file"], slide.get("bias", "top"))
            lower_third(framed, slide["kicker"], slide["title"]).save(png, "PNG")
        clip = WORK / f"clip-{i:02d}.mp4"
        zoom_clip(png, clip, float(slide["dur"]), zoom_in=(i % 2 == 0))
        clips.append(clip)
        print("clip", i, slide.get("title") or slide["kind"])
    concat(clips, OUT)
    print("wrote", OUT, "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
