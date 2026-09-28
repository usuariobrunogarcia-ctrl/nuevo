#!/usr/bin/env python3
# Extrae los cuadros de Somari de somari.png (tira horizontal sobre fondo celeste) a js/somarigfx.js.
# Cuadros: 0 quieto, 1-7 caminar, 8-10 correr. Todos se rellenan al mismo ancho, centrados.
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(__file__), '..')
im = Image.open(os.path.join(ROOT, 'somari.png')).convert('RGB')
W, H = im.size; px = im.load()
BG = (190, 212, 252)
cols = [any(px[x, y] != BG for y in range(H)) for x in range(W)]
segs = []; x = 0
while x < W:
    if cols[x]:
        s = x
        while x < W and cols[x]: x += 1
        segs.append((s, x))
    else: x += 1
rows = [y for y in range(H) if any(px[x, y] != BG for x in range(W))]
y0, y1 = min(rows), max(rows) + 1
fw = max(b - a for a, b in segs) + 2; fh = y1 - y0
pal = []; frames = []
for (a, b) in segs:
    pad = (fw - (b - a)) // 2; s = ''
    for y in range(y0, y1):
        for i in range(fw):
            x = a + i - pad
            c = px[x, y] if a <= x < b else BG
            if c == BG: s += '.'; continue
            if c not in pal: pal.append(c)
            s += chr(ord('a') + pal.index(c))
    frames.append('[%d,%d,"%s"]' % (fw, fh, s))
with open(os.path.join(ROOT, 'js', 'somarigfx.js'), 'w') as f:
    f.write("// Generado por tools/somari_sheet.py desde somari.png.\n")
    f.write("// Cuadros [ancho, alto, píxeles]: '.' transparente, 'a'.. índice en la paleta.\n")
    f.write("'use strict';\nvar SM = window.SM || (window.SM = {});\n")
    f.write("SM.SomariGfx = {\n  pal: [%s],\n  frames: [\n    %s\n  ]\n};\n" % (
        ', '.join('"#%02x%02x%02x"' % c for c in pal), ',\n    '.join(frames)))
print(len(frames), fw, fh, len(pal))
