"""Draws the Chrome Web Store promo tiles into store/. Needs Pillow."""
from PIL import Image, ImageDraw, ImageFont

BLUE = (37, 99, 235)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def tile(w, h, path, icon, title_size, sub_size):
    im = Image.new("RGB", (w, h), BLUE)
    d = ImageDraw.Draw(im)
    title_font = ImageFont.truetype(BOLD, title_size)
    sub_font = ImageFont.truetype(FONT, sub_size)
    title, sub = "Open Page Watcher", "Private, open-source change alerts"
    gap = int(icon * 0.3)
    text_w = max(d.textlength(title, font=title_font), d.textlength(sub, font=sub_font))
    x0 = int((w - (icon + gap + text_w)) / 2)
    y0 = (h - icon) // 2
    d.rounded_rectangle([x0, y0, x0 + icon, y0 + icon], radius=icon // 5, fill="white")
    cx, cy = x0 + icon / 2, y0 + icon / 2
    ew, eh, r = icon * 0.38, icon * 0.22, icon * 0.12
    d.ellipse([cx - ew, cy - eh, cx + ew, cy + eh], fill=BLUE)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="white")
    tx = x0 + icon + gap
    d.text((tx, h / 2 - title_size * 1.15), title, font=title_font, fill="white")
    d.text((tx, h / 2 + sub_size * 0.35), sub, font=sub_font, fill=(219, 234, 254))
    im.save(path)


tile(440, 280, "store/promo-small-440x280.png", 84, 23, 12)
tile(1400, 560, "store/promo-marquee-1400x560.png", 220, 64, 32)
