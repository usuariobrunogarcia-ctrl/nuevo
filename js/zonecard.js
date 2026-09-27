// Cartel "GREEN HILL ZONE / ACT n" (port del banco $18, $8361).
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R;
  function T(a) { return SM.rom.b(a < 0xA000 ? 0x18 : 0x19, a); }
  function W(a) { return T(a) | (T(a + 1) << 8); }

  var ZC = SM.ZoneCard = {};
  var nt = new Uint8Array(960), attr = new Uint8Array(64), done = null;

  ZC.start = function (cb) {
    // $8500: textos en el nametable y paleta
    nt.fill(0xFF); attr.fill(0);
    var z = ram[R.ZONE], p = W(0x893C + z * 2), i;
    for (i = 0; i < 22; i++) nt[6 * 32 + 4 + i] = T(p + i);
    for (i = 0; i < 22; i++) nt[7 * 32 + 4 + i] = T(p + 22 + i);
    for (i = 0; i < 22; i++) nt[9 * 32 + 4 + i] = T(0x8AB4 + i);
    for (i = 0; i < 22; i++) nt[10 * 32 + 4 + i] = T(0x8AB4 + 22 + i);
    for (i = 0; i < 32; i++) SM.Render.pal[i] = T(0x891C + i) & 0x3F;
    SM.Render.mirrorPal();
    ram[0x02] = 0xF0; ram[0x34D] = 0xF0;
    ram[R.MUSIC] = T(0x83EF + z);
    ZC.run(nt, attr, null, cb);
  };

  // Escena común del cartel y de la pantalla de resultados: textos que entran con scroll
  // partido (IRQ modo 2) y los metasprites "SOMARI" / "ACT" / número.
  // extra: función del estado 3 (resultados, $924B) o null (cartel).
  var curNt, curAttr, extra;
  ZC.run = function (n, a, ex, cb) {
    curNt = n; curAttr = a; extra = ex; done = cb;
    // $85A8: posiciones iniciales de los sprites
    for (var i = 0; i < 12; i++) ram[0x606 + i] = T(0x85FC + i);
    ram[R.IRQMODE] = 2;
    ram[0x86] = 0;
    ram[R.CHR0] = 0x70; ram[R.CHR2] = 0x70; ram[R.CHR3] = 0x71;
    ram[R.CHR1] = 0x72; ram[R.CHR4] = 0x72; ram[R.CHR5] = 0x72;
    SM.Game.scene = step;
  };
  ZC.T = T; ZC.W = W;

  // $8733: metasprite genérico
  function meta(xa, ya, cols, rows, tiles, attrs) {
    var x0 = (ram[xa + 1] << 8) | ram[xa], y0 = (ram[ya + 1] << 8) | ram[ya];
    var ox = (SM.Render.W - 256) >> 1, k = 0;
    for (var r = 0; r < rows; r++) {
      var y = y0 + r * 8;
      if (y > 0xFF) { k += cols; continue; }
      for (var c = 0; c < cols; c++, k++) {
        var x = x0 + c * 8;
        if (x > 0xFF) continue;
        var t = T(tiles + k);
        if (t === 0xFF) continue;
        SM.Spr.push(x + ox, y, t, T(attrs + t) | 0x22);
      }
    }
  }

  function step() {
    SM.Game.nmi();
    var k = ram[0x86];
    if (extra && k >= 3) k = k === 3 ? -1 : k - 1;          // resultados: $924B es el estado 3
    switch (k) {
      case -1: extra(); break;
      case 0: {                                               // $840E
        var a = ram[0x02] - 0x10; ram[0x02] = a < 0 ? 0 : a;
        var b = ram[0x606] - 0x10; ram[0x606] = b & 0xFF; if (b < 0) ram[0x607]--;
        if (ram[0x607] === 0 && ram[0x606] < 0xB0) ram[0x86]++;
        break;
      }
      case 1: {                                               // $8438
        var c = ram[0x34D] - 0x10;
        if (c < 0) { ram[0x34D] = 0; ram[0x86]++; } else ram[0x34D] = c;
        break;
      }
      case 2: {                                               // $844B
        var d = ram[0x60A] - 0x10; ram[0x60A] = d & 0xFF; if (d < 0) ram[0x60B]--;
        if (ram[0x60B] === 0 && ram[0x60A] < 0xB0) { ram[0x86]++; ram[0x603] = 1; }
        var e = ram[0x60A] + 0x20; ram[0x60E] = e & 0xFF; ram[0x60F] = (ram[0x60B] + (e > 0xFF ? 1 : 0)) & 0xFF;
        break;
      }
      case 3:                                                 // $847E
        if (ram[R.SEC_CNT] === 0) { ram[0x603]--; if (ram[0x603] & 0x80) ram[0x86]++; }
        break;
      case 4: {                                               // $848B
        var f = ram[0x34D] + 0x10; ram[0x34D] = f > 0xFF ? 0xF0 : f;
        var g = ram[0x02] + 0x10; ram[0x02] = g > 0xFF ? 0xF0 : g;
        add16(0x606, 0x10); add16(0x60A, 0x10);
        var h = ram[0x60A] + 0x20; ram[0x60E] = h & 0xFF; ram[0x60F] = (ram[0x60B] + (h > 0xFF ? 1 : 0)) & 0xFF;
        if (ram[0x02] === 0xF0 && ram[0x34D] === 0xF0 && ram[0x607] === 1 && ram[0x60B] === 1) {
          ram[0x86]++;
          ram[0x60C] = ram[0x608] = ram[0x610] = 0xF8;
        }
        break;
      }
    }
    // dibujo
    SM.Spr.clear();
    if (ram[R.ZONE] < 6) {
      meta(0x60A, 0x60C, 3, 1, W(0x88C3 + 2), W(0x88C3 + 10));
      meta(0x60E, 0x610, 2, 3, W(0x88C3 + (ram[R.ACT] + 2) * 2), W(0x88C3 + 10));
    }
    meta(0x606, 0x608, 7, 8, W(0x88C3), W(0x88C3 + 10));
    var Rn = SM.Render, ox = (Rn.W - 256) >> 1,
      banks = [ram[R.CHR2], ram[R.CHR3], ram[R.CHR4], ram[R.CHR5]];
    Rn.clear();
    Rn.drawNTRows(curNt, curAttr, banks, ram[0x02], 0, 73, ox, 0xFF);
    Rn.drawNTRows(curNt, curAttr, banks, ram[0x34D], 73, 122, ox, 0xFF);
    Rn.drawNTRows(curNt, curAttr, banks, 0, 122, 240, ox, 0xFF);
    Rn.drawSprites([ram[R.CHR0], ram[R.CHR0] + 1, ram[R.CHR1], ram[R.CHR1] + 1], 0);
    if (ram[0x86] >= (extra ? 6 : 5)) {
      ram[R.IRQMODE] = 0;
      var cb = done; done = null;
      if (cb) cb();
    }
  }
  function add16(a, v) {
    var s = ram[a] + v; ram[a] = s & 0xFF; ram[a + 1] = (ram[a + 1] + (s > 0xFF ? 1 : 0)) & 0xFF;
  }
})();
