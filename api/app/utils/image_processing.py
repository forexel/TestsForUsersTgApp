from __future__ import annotations
import os
from io import BytesIO
from PIL import Image, ImageOps

# === Tunables from env ===
MAX_W = int(os.getenv("CARD_IMAGE_MAX_WIDTH", "610"))
MAX_H = int(os.getenv("CARD_IMAGE_MAX_HEIGHT", "1000"))
QUALITY = int(os.getenv("CARD_IMAGE_QUALITY", "82"))
FORMAT = os.getenv("CARD_IMAGE_FORMAT", "WEBP").upper()  # WEBP | JPEG
STRIP_EXIF = os.getenv("CARD_STRIP_EXIF", "true").lower() == "true"
# fixed aspect ratio (W:H). We want vertical 610:1000 by default.
TARGET_ASPECT_W = int(os.getenv("CARD_ASPECT_W", "610"))
TARGET_ASPECT_H = int(os.getenv("CARD_ASPECT_H", "1000"))

CONTENT_TYPES = {
    "WEBP": "image/webp",
    "JPEG": "image/jpeg",
    "JPG": "image/jpeg",
    "PNG": "image/png",
}

def _normalize_mode(img: Image.Image) -> Image.Image:
    # JPEG doesn't support alpha; WEBP supports but we still normalize
    if FORMAT in ("JPEG", "JPG"):
        if img.mode in ("RGBA", "LA"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            return bg
        return img.convert("RGB")

    if img.mode not in ("RGB", "RGBA"):
        return img.convert("RGBA" if "A" in img.getbands() else "RGB")
    return img

def _center_crop_aspect(img: Image.Image, target_aspect: float) -> Image.Image:
    """Crop the image to the target aspect ratio keeping the center."""
    w, h = img.size
    current = w / h
    if abs(current - target_aspect) < 1e-3:
        return img  # already close enough

    if current > target_aspect:
        # too wide -> cut left/right
        new_w = int(h * target_aspect)
        x0 = (w - new_w) // 2
        return img.crop((x0, 0, x0 + new_w, h))
    else:
        # too tall -> cut top/bottom
        new_h = int(w / target_aspect)
        y0 = (h - new_h) // 2
        return img.crop((0, y0, w, y0 + new_h))

def _resize_by_shorter_side(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """
    Scale image so that the *shorter* side matches the corresponding target side,
    without upscaling above original size. This ensures we don't lose detail before crop.
    """
    w, h = img.size
    scale = min(target_w / w, target_h / h)
    if scale < 1.0:
        new_size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
        return img.resize(new_size, Image.Resampling.LANCZOS)
    return img  # don't upscale

def compress_image(src_bytes: bytes) -> tuple[bytes, str]:
    """
    Pipeline:
    1) Downscale by the *shorter* side to fit MAX_W x MAX_H
    2) Center-crop to fixed aspect (default 610:1000 vertical)
    3) Ensure exact final dimensions (MAX_W x MAX_H)
    4) Strip metadata and save as WEBP/JPEG with quality settings.
    Returns (optimized_bytes, content_type).
    """
    with Image.open(BytesIO(src_bytes)) as im:
        im.load()
        if STRIP_EXIF:
            im.info.pop("icc_profile", None)
            im.info.pop("exif", None)

        im = _normalize_mode(im)

        # 1) downscale by shorter side first (no upscaling)
        im = _resize_by_shorter_side(im, MAX_W, MAX_H)

        # 2) crop to target aspect (vertical 610:1000 by default)
        target_aspect = TARGET_ASPECT_W / TARGET_ASPECT_H
        im = _center_crop_aspect(im, target_aspect)

        # 3) final resize to exact target dimensions (if still off by a few px)
        if im.size != (MAX_W, MAX_H):
            im = im.resize((MAX_W, MAX_H), Image.Resampling.LANCZOS)

        # 4) save optimized
        out = BytesIO()
        save_kwargs = {}
        if FORMAT in ("JPEG", "JPG"):
            save_kwargs.update(optimize=True, quality=QUALITY, progressive=True)
        elif FORMAT == "WEBP":
            save_kwargs.update(quality=QUALITY, method=6, lossless=False)

        im.save(out, FORMAT, **save_kwargs)
        out.seek(0)
        return out.read(), CONTENT_TYPES.get(FORMAT, "application/octet-stream")