import zlib, struct, subprocess, sys
CHROME = "/opt/pw-browsers/chromium"

def _decode(path):
    d = open(path, "rb").read()
    w, h, bd, ct = struct.unpack(">IIBB", d[16:26])
    bpp = {0:1, 2:3, 4:2, 6:4}[ct]
    raw = b""; p = 8
    while p < len(d):
        ln = struct.unpack(">I", d[p:p+4])[0]
        if d[p+4:p+8] == b"IDAT": raw += d[p+8:p+8+ln]
        p += 12 + ln
    img = zlib.decompress(raw); rows = []; prev = bytearray(w*bpp); i = 0
    for _ in range(h):
        f = img[i]; i += 1
        line = bytearray(img[i:i+w*bpp]); i += w*bpp
        for x in range(len(line)):
            a = line[x-bpp] if x >= bpp else 0
            b = prev[x]; c = prev[x-bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x]+a) & 255
            elif f == 2: line[x] = (line[x]+b) & 255
            elif f == 3: line[x] = (line[x]+(a+b)//2) & 255
            elif f == 4:
                pp = a+b-c; pa, pb, pc = abs(pp-a), abs(pp-b), abs(pp-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x]+pr) & 255
        rows.append(bytes(line)); prev = line
    return w, h, bpp, rows

def _encode(path, w, h, bpp, rows):
    def chunk(t, data):
        return struct.pack(">I", len(data)) + t + data + struct.pack(">I", zlib.crc32(t+data) & 0xffffffff)
    ct = {3:2, 4:6}[bpp]
    ihdr = struct.pack(">IIBBBBB", w, h, 8, ct, 0, 0, 0)
    body = b"".join(b"\x00" + r[:w*bpp] for r in rows[:h])
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
                           + chunk(b"IDAT", zlib.compress(body, 9)) + chunk(b"IEND", b""))

def shot(html_path, out, w, h):
    """Render at the exact size wanted. Chromium's screenshot viewport is
    shorter than the window it is given, so it renders with headroom and the
    picture is cropped back to size afterwards."""
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", f"--window-size={w},{h+220}",
                    f"--screenshot=/tmp/_shot.png", f"file://{html_path}"],
                   capture_output=True)
    W, H, bpp, rows = _decode("/tmp/_shot.png")
    assert W >= w and H >= h, f"rendered {W}x{H}, wanted {w}x{h}"
    _encode(out, w, h, bpp, rows)
    import os
    print(f"  {out}  {w}x{h}  {os.path.getsize(out)}b")
