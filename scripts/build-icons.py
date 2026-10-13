"""Generate local extension icons without external assets or dependencies."""
from pathlib import Path
import struct
import zlib

OUT = Path(__file__).resolve().parent.parent / "smart-autofill" / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def chunk(kind, data):
    return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data) & 0xffffffff)


for size in (16, 48, 128):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            px, py = (x + .5) / size, (y + .5) / size
            # Rounded teal square and a simple white S, drawn as native geometric strokes.
            dx, dy = max(.18 - px, 0, px - .82), max(.18 - py, 0, py - .82)
            inside = dx * dx + dy * dy <= .17 ** 2
            mark = ((.30 <= px <= .70 and (.24 <= py <= .34 or .45 <= py <= .55 or .66 <= py <= .76))
                    or (.30 <= px <= .40 and .24 <= py <= .55)
                    or (.60 <= px <= .70 and .45 <= py <= .76))
            rows.extend((255, 255, 255, 255) if mark else (15, 118, 110, 255) if inside else (0, 0, 0, 0))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack("!2I5B", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows))) + chunk(b"IEND", b"")
    (OUT / f"icon{size}.png").write_bytes(png)
