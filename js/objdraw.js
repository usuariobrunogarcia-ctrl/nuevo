// Dibujado de objetos: port del banco $12/$13 ($8000). Cada tipo arma una grilla de
// sprites de 8x8 con tablas de tiles/atributos leídas del ROM.
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R, O = SM.O;
  function T(a) { return SM.rom.b(a < 0xA000 ? 0x12 : 0x13, a); }
  function s16(hi, lo) { var v = (hi << 8) | lo; return v >= 0x8000 ? v - 0x10000 : v; }
  var D = SM.ObjDraw = {};

  // posición en pantalla lógica del objeto x (jugador en pantalla + relativa)
  function base(x) {
    return [s16(ram[O.SXH + x], ram[O.SXL + x]) + s16(ram[R.PSCR_XH], ram[R.PSCR_X]),
            s16(ram[O.SYH + x], ram[O.SYL + x]) + s16(ram[R.PSCR_YH], ram[R.PSCR_Y])];
  }
  function colOk(x) { return x !== 0 && SM.Spr.visX(x); }
  function rowOk(y) { return y >= 1 && y <= 0xFF; }
  // Grilla genérica. hide=true: un tile 0 oculta la entrada actual (el original escribe Y=$F8).
  // ¿Pasa el prólogo de posición del original? (si ninguna columna o fila cae dentro de la
  // pantalla, el original retorna sin dibujar ni cambiar bancos de CHR)
  function prologue(sx, sy, cols, rows) {
    if (sx >= SM.Spr.xmax || sy > 0xFF) return false;
    if (sx + (cols - 1) * 8 < SM.Spr.xmin) return false;
    if (sy + (rows - 1) * 8 < 0) return false;
    return true;
  }
  function grid(x, cols, rows, idx, rowStart, rowSkip, tile, attr, hide, gcols, grows) {
    var b = base(x), sx = b[0], sy = b[1];
    if (!prologue(sx, sy, gcols || cols, grows || rows)) return false;
    for (var r = rowStart; r < rows; r++) {
      var y = sy + r * 8;
      if (!rowOk(y)) { idx += rowSkip; continue; }
      for (var c = 0; c < cols; c++, idx++) {
        var cx = sx + c * 8;
        if (!colOk(cx)) continue;
        var t = tile(idx);
        if (!t) { if (hide) SM.Spr.hide(); continue; }
        SM.Spr.push(cx, y, t, typeof attr === 'function' ? attr(idx) : attr);
      }
    }
    return true;
  }
  function tbl(a) { return function (i) { return T(a + i); }; }

  var H = {};
  // $810E: tipo 01
  H[0x01] = function (x) {
    var z = (ram[O.P + x] & 0x80) ? 0x0F : 0;
    var y = ram[R.FRAME] & 2;
    var b = base(x);
    grid(x, 5, 3, (T(0x8253 + y) + z) & 0xFF, T(0x8254 + y), 5, tbl(0x8D59), tbl(0x8D77), true);
    if (b[0] >= SM.Spr.xmax || b[1] > 0xFF) return;
    var at = z ? 0x41 : 1;
    var f = ram[R.FRAME] & 6;
    if (f >= 4) return;
    var cx = b[0] + 32;
    if (!colOk(cx)) return;
    var y1 = b[1] + 8, y2 = b[1] + 16;
    if (rowOk(y1)) SM.Spr.push(cx, y1, T(0x824B + f), at);
    if (rowOk(y2)) SM.Spr.poke(cx, y2, T(0x824C + f), at);
  };
  // $8257: tipo 02
  H[0x02] = function (x) {
    var z = (ram[O.P + x] & 0x80) ? 0x10 : 0;
    var y = ram[R.FRAME] & 2;
    grid(x, 4, 4, (T(0x835A + y) + z) & 0xFF, T(0x835B + y), 4, tbl(0x8D95), tbl(0x8DB5), true);
  };
  // $835E: monitores
  H[0x10] = H[0x11] = H[0x12] = H[0x13] = H[0x14] = H[0x15] = function (x) {
    var k = 6;
    if (ram[R.FRAME] & 3) k = ram[O.TYPE + x] & 0x0F;
    grid(x, 3, 3, T(0x8CD3 + k), 0, 3, tbl(0x8CDB), tbl(0x8D1A), false);
  };
  // $8448: tipo 03 (pez)
  H[0x03] = function (x) {
    if (grid(x, 3, 3, (ram[R.FRAME] & 0x10) ? 9 : 0, 0, 3, tbl(0x8DD5), 1, true)) ram[R.CHR1] = ram[R.SPRBANK2];
  };
  // $8533: balas
  H[0x0F] = H[0x1A] = H[0x1B] = H[0x1C] = function (x) {
    var b = base(x);
    var t = (ram[R.FRAME] & 8) ? 0xDF : 0xDE;
    if (b[0] >= SM.Spr.xmax || b[1] > 0xFF || !colOk(b[0]) || !rowOk(b[1])) { SM.Spr.hide(); return; }
    SM.Spr.push(b[0], b[1], t, 0);
  };
  // $85E7: tipo 04
  H[0x04] = function (x) {
    var y = 0;
    if ((ram[O.P + x] & 0x70) !== 0x70) y = T(0x8DE7 + ((ram[R.FRAME] >> 3) & 3));
    grid(x, 3, 3, y, 0, 3, tbl(0x8DEF), tbl(0x8E13), true);
  };
  // $86E9: tipo 05
  H[0x05] = function (x) {
    grid(x, 3, 3, T(0x8DEB + ((ram[O.P + x] >> 1) & 3)), 0, 3, tbl(0x8DEF), tbl(0x8E13), true);
  };
  // $87DF: tipos 06/07
  H[0x06] = H[0x07] = function (x) {
    var p = ram[O.P + x], z = (p & 0x80) ? 0x18 : 0;
    var v = T(0x88E6 + ((p >> 2) & 7));
    if (v >= 0x80) {
      if (v === 0xFF || (ram[R.FRAME] & 2)) return;
      v = 0;
    }
    if (grid(x, 3, 4, (v + z) & 0xFF, 0, 3, tbl(0x8E37), tbl(0x8E67), true)) ram[R.CHR1] = ram[R.SPRBANK];
  };
  // $88EE: tipo 08
  H[0x08] = function (x) {
    var p = ram[O.P + x], at = 2, z = 0;
    if (p & 0x80) { at = 0x42; z = 0x50; }
    var k = (p >> 2) & 7;
    if (T(0x8A09 + k) < 0x80) ram[R.CHR1] = ram[R.SPRBANK];
    var v = T(0x8A01 + k);
    if (v >= 0x80) {
      if (v === 0xFF || (ram[R.FRAME] & 2)) return;
      v = 0;
    }
    grid(x, 4, 4, (v + z) & 0xFF, 0, 3, tbl(0x8E97), at, true);
  };
  // $8A11: animalitos
  H[0x18] = H[0x19] = function (x) {
    var p = ram[O.P + x], y, at;
    if (ram[O.TYPE + x] >= 0x19) {
      y = 0x14;
      if (p & 0x80) { y = 0x0C; if (ram[R.FRAME] & 2) y = 0x10; }
      at = 3;
    } else {
      y = 8;
      if (p & 0x80) y = (p >> 2) & 4;
      at = 2;
    }
    grid(x, 2, 2, y, 0, 2, tbl(0x8F37), at, true);
  };
  // $8B1F: anillo que rebota
  H[0x16] = function (x) {
    grid(x, 2, 2, ram[R.FRAME] & 0x0C, 0, 2, tbl(0x8F4F), tbl(0x8F5F), true);
  };
  // $8C00: explosión (cuatro trozos que se separan)
  H[0x1D] = function (x) {
    var k = (ram[O.P + x] >> 3) & 6;
    var off = T(0x8CCB + k), sp = T(0x8CCC + k);
    var sx = s16(ram[O.SXH + x], ram[O.SXL + x]) + ram[R.PSCR_X] + off;
    var sy = s16(ram[O.SYH + x], ram[O.SYL + x]) + ram[R.PSCR_Y] + sp;
    var t = T(0x8CBF + k);
    for (var r = 0; r < 2; r++) {
      var y = sy + r * sp;
      if (!rowOk(y)) continue;
      for (var c = 0; c < 2; c++) {
        var cx = sx + c * sp;
        if (!colOk(cx)) continue;
        SM.Spr.push(cx, y, t, T(0x8CC7 + r * 2 + c));
      }
    }
  };
  // $936B: plataforma
  H[0x2B] = function (x) {
    var b = base(x), sx = b[0], sy = b[1];
    if (sx >= SM.Spr.xmax || sy > 0xFF) return;
    var idx = 0, at = 3;
    for (var r = 0; r < 2; r++) {
      var y = sy + r * 8;
      if (!rowOk(y)) { idx += 4; at = 0x81; continue; }
      for (var c = 0; c < 4; c++, idx++) {
        var cx = sx + c * 8;
        if (!colOk(cx)) continue;
        var t = T(0x99A9 + idx);
        if (t) SM.Spr.push(cx, y, t, at);
      }
      at = 0x81;
    }
  };
  // $AC5E: cartel de meta
  H[0x2E] = function (x) {
    var idx = ram[O.P + x] ? T(0xAD56 + ((ram[R.FRAME] >> 1) & 3)) : 0;
    if (grid(x, 5, 6, idx, 0, 5, tbl(0xAF15), 1, true)) ram[R.CHR1] = 0x80;
  };
  // $AD5A: cartel detenido
  H[0x2F] = function (x) {
    if (grid(x, 5, 6, ram[O.P + x] ? 0x1E : 0, 0, 5, tbl(0xAF8D), 1, true)) ram[R.CHR1] = 0x80;
  };
  // $8000 del banco $12: recorre los objetos (sentido alternado cada cuadro)
  D.drawAll = function () {
    var n = ram[R.OBJ_N], x;
    if (!(ram[R.FRAME] & 1)) {
      for (x = 0; x < n; x++) one(x);
    } else if (n) {
      for (x = n; x >= 0; x--) one(x);
    }
  };
  function one(x) {
    ram[R.OBJ_I] = x;
    var t = ram[O.TYPE + x];
    if (!t) return;
    var f = H[t];
    if (f) f(x);
  }
  D.H = H;
})();
