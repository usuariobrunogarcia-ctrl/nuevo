#!/usr/bin/env python3
# Extrae los cuadros de Tails de tails.png (hoja de SonicMarioMan123) a js/tailsgfx.js.
# Cada cuadro está sobre un recuadro gris (gris claro/oscuro = paleta 1/2 del NES) y el
# fondo de la hoja es azul verdoso: ambos se vuelven transparentes.
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(__file__), '..')
im = Image.open(os.path.join(ROOT, 'tails.png')).convert('RGB')
W, H = im.size; px = im.load()
BG = (0, 85, 121); GRAY = [(195, 195, 195), (127, 127, 127)]
seen = set(); boxes = []
for y in range(H):
    for x in range(W):
        if px[x, y] in GRAY and (x, y) not in seen:
            st = [(x, y)]; seen.add((x, y)); x0 = x1 = x; y0 = y1 = y; n = 0
            while st:
                a, b = st.pop(); n += 1
                x0 = min(x0, a); x1 = max(x1, a); y0 = min(y0, b); y1 = max(y1, b)
                for c, d in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                    if 0 <= c < W and 0 <= d < H and (c, d) not in seen and px[c, d] != BG:
                        seen.add((c, d)); st.append((c, d))
            if n > 100: boxes.append((y0, x0, x1 - x0 + 1, y1 - y0 + 1))
boxes.sort()
boxes = boxes[:60]                      # 59 cuadros + el ícono de vidas (sin los anillos)
pal = []; frames = []
for (y0, x0, w, h) in boxes:
    s = ''
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            c = px[x, y]
            if c == BG or c in GRAY: s += '.'; continue
            if c not in pal: pal.append(c)
            s += chr(ord('a') + pal.index(c))
    frames.append('[%d,%d,"%s"]' % (w, h, s))
with open(os.path.join(ROOT, 'js', 'tailsgfx.js'), 'w') as f:
    f.write("// Generado por tools/tails_sheet.py desde tails.png (sprites: SonicMarioMan123).\n")
    f.write("// Cuadros [ancho, alto, píxeles]: '.' transparente, 'a'.. índice en la paleta.\n")
    f.write("'use strict';\nvar SM = window.SM || (window.SM = {});\n")
    f.write("SM.TailsGfx = {\n  pal: [%s],\n  frames: [\n    %s\n  ]\n};\n" % (
        ', '.join('"#%02x%02x%02x"' % c for c in pal), ',\n    '.join(frames)))
print(len(frames), 'frames', pal)
