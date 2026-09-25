#!/usr/bin/env python3
"""Build aligned web assets from the selected folder photo. Run from web/.

Requires Pillow and numpy. The source layers are in spec/filebox-photo/.
Run spec/filebox-photo/make-layers.py first: only folder-full-1.png is committed;
back/front/empty/dock-filebox are derived from it.
Output file names must change when their content changes — public/sw.js serves
/cards/ and /icons/ stale-while-revalidate, so an overwritten name shows the old image once.
"""

from pathlib import Path
import re

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "spec/filebox-photo"
CARDS = ROOT / "public/cards/v2"
DOCK = ROOT / "public/icons/dock"
CROP = (45, 140, 979, 890)  # shared crop, including a little shadow clearance
WIDTH = 640
HEIGHT = round((CROP[3] - CROP[1]) * WIDTH / (CROP[2] - CROP[0]))


def photo(name: str) -> Image.Image:
    return Image.open(SOURCE / name).convert("RGBA")


def save_card(image: Image.Image, name: str) -> None:
    image.crop(CROP).resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS).save(
        CARDS / name, optimize=True
    )


def memo_tints() -> list[tuple[int, int, int]]:
    source = (ROOT / "src/components/workspace/memoVariety.ts").read_text()
    palette = source.split("export const MEMO_TINTS = [", 1)[1].split("]", 1)[0]
    return [tuple(bytes.fromhex(value[1:])) for value in re.findall(r"#[0-9a-fA-F]{6}", palette)]


def paper_stack(full: Image.Image, count: int) -> Image.Image:
    """Extend the photographed paper texture above the folder's back edge."""
    result = Image.new("RGBA", full.size)
    # This is the exposed paper in the original photo, before the front covers it.
    texture = full.crop((402, 259, 906, 283)).convert("RGB")
    tints = memo_tints()
    tops = [205, 191] if count == 2 else [201, 187, 173, 159, 145]
    for index, top in enumerate(tops):
        left = 390 + (index % 3) * 7
        right = 902 - (index % 2) * 9
        bottom = 298
        width, height = right - left, bottom - top
        sheet = texture.resize((width, height), Image.Resampling.BICUBIC)
        tint = Image.new("RGB", sheet.size, tints[index % len(tints)])
        sheet = ImageChops.multiply(sheet, tint)
        mask = Image.new("L", sheet.size)
        draw = ImageDraw.Draw(mask)
        slope = [-6, 2, -3, 4, -1][index]
        draw.polygon([(0, 4), (width - 4, slope + 4), (width, height), (0, height)], fill=255)
        shadow = Image.new("RGBA", sheet.size, (65, 49, 19, 0))
        shadow.putalpha(mask.point(lambda alpha: round(alpha * 0.25)))
        shadow = shadow.filter(ImageFilter.GaussianBlur(3))
        result.alpha_composite(shadow, (left + 2, top + 5))
        sheet.putalpha(mask)
        result.alpha_composite(sheet, (left, top))
    return result


def main() -> None:
    back = photo("folder-back.png")
    front = photo("folder-front.png")
    empty = photo("folder-empty.png")
    full = photo("folder-full-1.png")
    assert Image.alpha_composite(back, front).tobytes() == empty.tobytes()

    low = paper_stack(full, 2)
    high = paper_stack(full, 5)

    save_card(back, "board-back.png")
    save_card(front, "board-front.png")
    save_card(low, "board-papers-low.png")
    save_card(high, "board-papers-high.png")

    # 독 드래그 프리뷰 — 독에서 끌어 만든 파일함은 비어 있으므로 빈 폴더. 작게 보이니 절반 크기.
    preview = empty.crop(CROP).resize((WIDTH // 2, HEIGHT // 2), Image.Resampling.LANCZOS)
    preview.save(CARDS / "board.png", optimize=True)

    icon = photo("dock-filebox.png")
    icon = icon.crop(icon.getbbox())
    icon.thumbnail((74, 66), Image.Resampling.LANCZOS)
    tile = Image.new("RGBA", (88, 88))
    tile.alpha_composite(icon, ((88 - icon.width) // 2, (88 - icon.height) // 2))
    tile.save(DOCK / "filebox-folder.png", optimize=True)


if __name__ == "__main__":
    main()
