"""Derive pixel-aligned layers from the selected generated folder photo."""

from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).parent
SIZE = 1024
def clean_alpha(im):
    rgba = im.copy()
    alpha = rgba.getchannel("A").point(lambda value: 0 if value < 16 else value)
    rgba.putalpha(alpha)
    transparent = Image.new("RGBA", rgba.size)
    rgba = Image.composite(rgba, transparent, alpha.point(lambda value: 255 if value else 0))
    return rgba


for variant in (1,):
    path = ROOT / f"folder-full-{variant}.png"
    clean_alpha(Image.open(path).convert("RGBA")).save(path)
source = Image.open(ROOT / "folder-full-1.png").convert("RGBA")


# The front edge is traced once from the photograph. Both layers retain the
# source canvas, so positioning does not depend on later CSS measurements.
front_area = Image.new("L", (SIZE, SIZE))
draw = ImageDraw.Draw(front_area)
draw.polygon(
    [(61, 324), (63, 309), (73, 298), (88, 292), (939, 292),
     (953, 299), (960, 310), (961, 865), (65, 865)],
    fill=255,
)
front_area = front_area.filter(ImageFilter.GaussianBlur(0.45))
front = source.copy()
front.putalpha(ImageChops.multiply(source.getchannel("A"), front_area))
front = clean_alpha(front)
front.save(ROOT / "folder-front.png")

# The hidden lower back panel cannot be recovered from a single photograph.
# Reuse its photographed kraft fibers beneath the front, leaving the real tab,
# label and exposed upper rear panel untouched.
back = Image.new("RGBA", (SIZE, SIZE))
texture = source.crop((75, 320, 950, 865)).resize((875, 617), Image.Resampling.BICUBIC)
texture.putalpha(Image.new("L", texture.size, 255))
back.paste(texture, (75, 248))
rear_shape = Image.new("L", (SIZE, SIZE))
rear_draw = ImageDraw.Draw(rear_shape)
rear_draw.rounded_rectangle((74, 248, 951, 864), radius=11, fill=255)
back.putalpha(ImageChops.multiply(back.getchannel("A"), rear_shape))

upper = source.copy()
upper_mask = Image.new("L", (SIZE, SIZE))
for y in range(260):
    strength = 255 if y < 248 else round(255 * (260 - y) / 12)
    ImageDraw.Draw(upper_mask).line((0, y, SIZE, y), fill=strength)
upper.putalpha(ImageChops.multiply(source.getchannel("A"), upper_mask))
back = Image.alpha_composite(back, upper)
back = clean_alpha(back)
back.save(ROOT / "folder-back.png")

empty = Image.alpha_composite(back, front)
empty = clean_alpha(empty)
empty.save(ROOT / "folder-empty.png")

# Slightly generous empty border keeps the icon legible on a small dock tile.
icon = Image.new("RGBA", (512, 512))
folder = source.crop((50, 145, 975, 875))
folder.thumbnail((400, 400), Image.Resampling.LANCZOS)
icon.alpha_composite(folder, ((512 - folder.width) // 2, (512 - folder.height) // 2))
clean_alpha(icon).save(ROOT / "dock-filebox.png")

memo = Image.open(ROOT / "../../public/cards/v2/text.png").convert("RGBA")
comparison = Image.new("RGBA", (2048, 1024), (230, 227, 219, 255))
comparison.alpha_composite(memo.resize((1024, 1024), Image.Resampling.LANCZOS), (0, 0))
comparison.alpha_composite(source, (1024, 0))
comparison.convert("RGB").save(ROOT / "compare.png")
