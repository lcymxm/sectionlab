"""生成 SectionLab 的社交预览图（1280x640）。

    python make_social.py

图标是琥珀色圆角方块 + 工字钢剪影，正文是标题、一句话卖点、四个标签。
纯 Pillow 画的，不依赖任何外部素材。
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(r"C:\Users\1\Documents\deepseek-harness\default-workspace")
OUT = ROOT / "sectionlab" / "docs" / "social-preview.png"

W, H = 1280, 640
BG = (11, 14, 18)
AMBER = (240, 180, 41)
AMBER_LIGHT = (255, 209, 102)
INK = (12, 16, 21)

FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_CN = r"C:\Windows\Fonts\msyh.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"


def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        return ImageFont.load_default()


def ibeam_points(size, pad=0.24):
    """工字钢剪影，坐标归一化到 [0,1]，再缩放到 size。"""
    pts = [
        (0.18, 0.10), (0.82, 0.10), (0.82, 0.26), (0.57, 0.26),
        (0.57, 0.74), (0.82, 0.74), (0.82, 0.90), (0.18, 0.90),
        (0.18, 0.74), (0.43, 0.74), (0.43, 0.26), (0.18, 0.26),
    ]
    return [(x * size, y * size) for x, y in pts]


def build_icon(size=1024):
    """圆角方块 + 渐变 + 工字钢剪影。"""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    t = np.clip((xx + yy) / (2.0 * (size - 1)), 0, 1)[..., None]
    arr = (1 - t) * np.array(AMBER_LIGHT, np.float32) + t * np.array(AMBER, np.float32)
    grad = Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1],
                                           radius=int(size * 0.22), fill=255)
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.paste(grad, (0, 0), mask)

    shape = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(shape)
    d.polygon(ibeam_points(size), fill=INK + (255,))
    icon = Image.alpha_composite(icon, shape)
    return icon


def main():
    canvas = Image.new("RGB", (W, H), BG)

    # 背景光晕
    glow = Image.new("RGB", (W, H), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-300, -380, 700, 460], fill=(46, 34, 12))
    gd.ellipse([880, -280, 1600, 400], fill=(16, 34, 44))
    canvas = Image.blend(canvas, glow.filter(ImageFilter.GaussianBlur(120)), 0.7)

    icon = build_icon()
    big = icon.resize((176, 176), Image.LANCZOS)
    canvas.paste(big, (96, 92), big)

    title = font(FONT_BOLD, 78)
    sub = font(FONT_CN, 34)
    chip = font(FONT_CN, 25)
    mono = font(FONT_MONO, 24)

    d = ImageDraw.Draw(canvas)
    d.text((96, 306), "SectionLab", font=title, fill=(240, 245, 250))
    d.text((100, 406), "任意截面，拖一下就出全部几何性质", font=sub, fill=(147, 162, 179))

    x = 100
    for text in ["7 种型材", "任意多边形", "带孔洞", "三平台", "零依赖"]:
        tw = d.textlength(text, font=chip)
        d.rounded_rectangle([x, 478, x + tw + 34, 530], radius=26,
                            fill=(26, 22, 12), outline=(70, 56, 24))
        d.text((x + 17, 491), text, font=chip, fill=AMBER_LIGHT)
        x += tw + 50

    d.text((96, 574), "github.com/lcymxm/sectionlab", font=mono, fill=(90, 106, 118))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, optimize=True)
    print(f"{OUT}  {OUT.stat().st_size/1024:.0f} KB  {W}x{H}")


if __name__ == "__main__":
    main()
