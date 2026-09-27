// Jefe de Green Hill (Eggman y la bola de demolición): port del código del banco de zona
// ($0D:$9600, actualización) y del banco $11 ($8000, dibujo).
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R, O = SM.O;
  function TZ(a) { return SM.rom.b(SM.ram[R.ZBANK], a); }   // $8000-$9FFF: banco de zona
  function T11(a) { return SM.rom.b(0x11, a); }
  function s16(hi, lo) { var v = (hi << 8) | lo; return v >= 0x8000 ? v - 0x10000 : v; }
  var B = SM.Boss = {};

  // posición relativa al jugador con la corrección de páginas de 240
  function rel(xl, xh, yl, yh, oxl, oxh, oyl, oyh) {
    var dx = (((ram[xh] << 8) | ram[xl]) - ((ram[R.NX_HI] << 8) | ram[R.NX_LO])) & 0xFFFF;
    ram[oxl] = dx & 0xFF; ram[oxh] = dx >> 8;
    if (ram[oxh] !== 0 && ram[oxh] !== 0xFF) return false;
    var bl = ram[yl] - ram[R.NY_LO];
    ram[oyl] = bl & 0xFF;
    ram[oyh] = (ram[yh] - ram[R.NY_HI] - (bl < 0 ? 1 : 0)) & 0xFF;
    var a;
    if (ram[oyh] === 0) a = 0xF0; else if (ram[oyh] === 0xFF) a = 0x10; else return false;
    if (ram[yh] !== ram[R.NY_HI]) {
      var s = a + ram[oyl], c = s > 0xFF ? 1 : 0;
      ram[oyl] = s & 0xFF;
      ram[oyh] = (a & 0x80) ? (ram[oyh] - 1 + c) & 0xFF : (ram[oyh] + c) & 0xFF;
    }
    return true;
  }

  // ---- $9600 ----
  B.update = function () {
    if (ram[R.ZONE] === 6) return;
    phase();
    if (rel(0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9)) bossTouch();
    if (ram[0xD3] && rel(0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA)) ballTouch();
    if (ram[0xCD]) { ram[0xCD]--; ram[0xCB] = 5; }
  };

  function loadScript(n) {
    var p = TZ(0x9D24 + n * 2) | (TZ(0x9D25 + n * 2) << 8);
    ram[0xBA] = p & 0xFF; ram[0xBB] = p >> 8;
    ram[0xBD] = 0; ram[0xBC] = 0;
  }

  function phase() {
    var z = ram[R.ZONE] * 4;
    switch (ram[0xB8]) {
      case 2:                                          // $9644
        ram[R.MUSIC] = 0x29;
        for (var i = 0; i < 8; i++) ram[0xBE + i] = TZ(0x9696 + z + i);
        for (i = 0; i < 8; i++) ram[0xD3 + i] = 0;
        ram[0xCC] = 0x0A; ram[0xCB] = 0; ram[0xCA] = 0; ram[0xCD] = 0;
        ram[0xB8] = 3; ram[R.DYING] = 1; ram[0xB7] = 1;
        return;
      case 1:                                          // $969E
        if (ram[R.NX_HI] === 0x18 && ram[R.NX_LO] >= 0x10) {
          ram[0xB8] = 2;
          for (var k = 0; k < 8; k++) SM.Render.pal[0x18 + k] = TZ(0x9833 + k) & 0x3F;
          ram[R.CHR1] = TZ(0x96B9 + ram[R.ZONE]);
        }
        return;
      case 3: return cameraToArena();                  // $96C0
      case 4: return script();                         // $976B
      case 5:                                          // $9AE3
        ram[0xD3] = 0x70; ram[0xD4] = ram[0xC3]; ram[0xD5] = 0x20; ram[0xD6] = ram[0xC5];
        ram[0xD1] = 0x70; ram[0xB8] = 6;
        return;
      case 6:                                          // $9AFA
        ram[0xD5]++;
        ram[0xD1]--;
        if (!ram[0xD1]) { ram[0xB8] = 7; ram[0xD1] = 0x80; ram[0xB9] = 0; }
        return;
      case 7:                                          // $9B10
        swing();
        if (ram[0xD1] >= 0xE0) { ram[0xB9] = 1; ram[0xB8] = 8; ram[0xD1] = 0xF8; loadScript(1); }
        return;
      case 8:                                          // $9B38
        if (!(ram[0xB9] & 1)) swingLeft(); else swingRight();
        script();
        move();
        rel(0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9);
        return;
      case 9: {                                        // $976E: derrotado
        var y = ram[R.OBJ_N];
        ram[O.XL + y] = ram[0xC2]; ram[O.XH + y] = ram[0xC3];
        var s = ram[0xC4] + 8;
        ram[O.YL + y] = s & 0xFF; ram[O.YH + y] = (ram[0xC5] + (s > 0xFF ? 1 : 0)) & 0xFF;
        ram[O.P + y] = 0; ram[O.TYPE + y] = 0x60;
        ram[R.OBJ_N] = y + 1;
        ram[0xB8] = 10; ram[0xB1] = 2;
        return;
      }
      case 10:                                         // $979D
        if (ram[R.SEC_CNT] === 0) {
          ram[0xB1]--;
          if (!ram[0xB1]) { ram[0xB8] = 11; loadScript(4); }
        }
        return;
      case 11: return script();                        // $97BD
      case 12:                                         // $97C0: aparece la cápsula
        ram[0xB8] = 0;
        ram[R.MUSIC] = TZ(0x9803 + ram[R.ZONE]);
        for (var q = 0; q < 4; q++) ram[0x680 + q] = TZ(0x97F3 + z + q);
        ram[0xB6] = 1; ram[0xB7] = 0;
        return;
    }
  }

  // $96C0: la cámara se desplaza hasta la arena del jefe
  function cameraToArena() {
    var d = ram[R.NCAM_XL] - ram[0xBE], a = 0;
    var lo = d & 0xFF, hi = (ram[R.NCAM_XH] - ram[0xBF] - (d < 0 ? 1 : 0)) & 0xFF;
    if (hi & 0x80) a = 1; else if (lo) a = 0xFF;
    ram[0x25] = a;
    var e = ram[R.NCAM_YL] - ram[0xC0], b = 0;
    var lo2 = e & 0xFF, hi2 = (ram[R.NCAM_YH] - ram[0xC1] - (e < 0 ? 1 : 0)) & 0xFF;
    if (hi2 & 0x80) b = 1; else if (lo2) b = 0xFF;
    ram[0x26] = b;
    var x = ((ram[R.NCAM_XH] << 8) | ram[R.NCAM_XL]) + (a === 0xFF ? -1 : a);
    ram[R.NCAM_XL] = x & 0xFF; ram[R.NCAM_XH] = (x >> 8) & 0xFF;
    var y = (b + ram[R.NCAM_YL]) & 0xFF;
    ram[R.NCAM_YL] = y;
    if (y >= 0xF0) {
      if (!(b & 0x80)) { ram[R.NCAM_YL] = (y + 0x10) & 0xFF; ram[R.NCAM_YH]++; }
      else ram[R.NCAM_YL] = y - 0x10;
    }
    if (!a && !b) {
      ram[0xB8] = 4; loadScript(0);
      ram[0xC2] = TZ(0x969A); ram[0xC3] = TZ(0x969B); ram[0xC4] = TZ(0x969C); ram[0xC5] = TZ(0x969D);
    }
  }

  // $983B: guion de movimiento (dx, dy, cuadros, animación)
  function script() {
    if (ram[0xBD]) return move();
    var p = (ram[0xBB] << 8) | ram[0xBA], y = ram[0xBC];
    for (var guard = 0; guard < 64; guard++) {
      ram[0xCF] = TZ(p + y); ram[0xD0] = TZ(p + y + 1);
      var a = TZ(p + y + 2);
      if (a < 0x80) {
        ram[0xBD] = a; ram[0xCB] = TZ(p + y + 3); ram[0xBC] = y + 4;
        return move();
      }
      if (a === 0xFF) { ram[0xB8]++; return; }
      ram[0xBC] = a & 0x7F; y = ram[0xBC];
    }
  }
  // $986E
  function move() {
    var dx = ram[0xCF], x = ((ram[0xC3] << 8) | ram[0xC2]) + (dx < 0x80 ? dx : dx - 256);
    ram[0xC2] = x & 0xFF; ram[0xC3] = (x >> 8) & 0xFF;
    var dy = ram[0xD0], y = (dy + ram[0xC4]) & 0xFF;
    ram[0xC4] = y;
    if (y >= 0xF0) {
      if (!(dy & 0x80)) { ram[0xC4] = (y + 0x10) & 0xFF; ram[0xC5]++; }
      else { ram[0xC4] = y - 0x10; ram[0xC5]--; }
    }
    ram[0xBD]--;
  }

  // $9BF7: vaivén de la bola
  function swing() {
    var x = ram[0xB9], d = SM.rom.b(ram[R.ZBANK], 0x9CA2 + x);
    var v = ((ram[0xD4] << 8) | ram[0xD3]) + (d < 0x80 ? d : d - 256);
    ram[0xD3] = v & 0xFF; ram[0xD4] = (v >> 8) & 0xFF;
    var k = ram[0xD1] >> 2;
    var e = x === 0 ? TZ(0x9CA4 + k) : TZ(0x9CE4 + k);
    var y = (e + ram[0xD5]) & 0xFF;
    ram[0xD5] = y;
    if (y >= 0xF0) {
      if (!(e & 0x80)) { ram[0xD5] = (y + 0x10) & 0xFF; ram[0xD6]++; }
      else { ram[0xD5] = y - 0x10; ram[0xD6]--; }
    }
    if (!ram[0xB9]) {
      ram[0xD1] += 2;
      if (ram[0xD1] >= 0xE0) { ram[0xB9] = 1; ram[0xD1] = 0xF8; loadScript(3); }
    } else {
      ram[0xD1] -= 2;
      if (ram[0xD1] < 0x21) { ram[0xB9] = 0; ram[0xD1] = 8; loadScript(2); }
    }
  }
  function nudgeBall(d) {
    var v = ((ram[0xD4] << 8) | ram[0xD3]) + d;
    ram[0xD3] = v & 0xFF; ram[0xD4] = (v >> 8) & 0xFF;
  }
  function swingLeft() {   // $9B9C
    if (ram[0xD1] >= 0x21) return swing();
    nudgeBall(1); ram[0xD1]++;
  }
  function swingRight() {  // $9BC4
    if (ram[0xD1] >= 0xE0) { nudgeBall(-1); ram[0xD1]--; return; }
    swing();
    if (ram[0xD1] === 0x20) ram[0xB9] = 0;
  }

  // $991F: contacto con Eggman
  function bossTouch() {
    if (ram[0xCA] || ram[0xCD]) return;
    if (ram[0xC7] !== 0xFF || ram[0xC6] < 0xD0) return;
    if (ram[0xC9] !== 0xFF || ram[0xC8] < 0xC8) return;
    if (ram[R.PFLAGS2] < 4) return hurt();
    ram[0xCD] = 0x32; ram[0xCB] = 5; ram[R.SFX] = 9;
    ram[R.VSPD] = 0x10; ram[R.PFLAGS] &= 0xF3;
    if (ram[0xC6] >= 0xF0) { ram[R.PFLAGS] |= 3; ram[R.GSPD] = 0x30; }
    else if (ram[0xC6] < 0xE0) { ram[R.PFLAGS] &= 0xFC; ram[R.GSPD] = 0x30; }
    else ram[R.GSPD] = 0;
    ram[R.LOCK] = 0x20;
    ram[0xCC]--;
    if (ram[0xCC] & 0x80) { ram[0xB8]++; ram[0xCA] = 1; ram[0xD3] = 0; }
  }
  // $98AD: contacto con la bola
  function ballTouch() {
    if (ram[0xCA]) return;
    if (ram[0xD8] !== 0xFF || ram[0xD7] < 0xD8) return;
    if (ram[0xDA] !== 0xFF || ram[0xD9] < 0xC0) return;
    hurt();
  }
  // $99E8
  function hurt() {
    if (ram[R.PREV_STATE] === 9 || ram[R.HURT]) return;
    ram[R.STATE] = 0x0A; ram[R.GSPD] = 0x30; ram[R.VSPD] = 0x30;
    ram[R.PFLAGS] = (ram[R.PFLAGS] ^ 3) | 0x0C;
    ram[R.HURT] = 3;
    var y = ram[R.PFLAGS2];
    if (y & 2) { ram[R.PFLAGS2] = y & 0xFD; return; }
    var n = 3;
    if (ram[R.RING_H] === 0 && ram[R.RING_T] === 0) {
      if (ram[R.RING_O] === 0) {
        ram[R.STATE] = 9; ram[R.VSPD] = 0x50; ram[R.GSPD] = 0; ram[R.PFLAGS] |= 4;
        ram[R.DYING] = 1; ram[R.SFX] = 5; ram[R.HURT] = 0;
        return;
      }
      if (ram[R.RING_O] < 3) n = ram[R.RING_O];
    }
    var s = ram[R.OBJ_N];
    for (var i = 0; i < 3; i++) {
      ram[O.TYPE + s + i] = i < n ? 0x16 : 0;
      ram[O.XL + s + i] = ram[R.NX_LO]; ram[O.XH + s + i] = ram[R.NX_HI];
      ram[O.YL + s + i] = ram[R.NY_LO]; ram[O.YH + s + i] = ram[R.NY_HI];
    }
    ram[O.P + s] = 1; ram[O.P + s + 1] = 0x91;
    ram[R.OBJ_N] = (s + n) & 0xFF;
    ram[R.RING_H] = ram[R.RING_T] = ram[R.RING_O] = 0;
    ram[R.SFX] = 4;
  }

  // ================= dibujo: banco $11 =================
  B.draw = function () {
    var b8 = ram[0xB8];
    if (ram[R.ZONE] !== 0) return body();
    if (b8 === 6) { body(); ball(); return; }
    if (b8 > 6 && b8 < 9) ball();
    body();
  };
  function colOk(x) { return x !== 0 && SM.Spr.visX(x); }
  function rowOk(y) { return y >= 1 && y <= 0xFF; }
  // $8020: Eggman (6x8 tiles)
  function body() {
    if (!ram[0xB8]) return;
    var tp = T11(0x83AF + ram[R.ZONE] * 2) | (T11(0x83B0 + ram[R.ZONE] * 2) << 8);
    var cb = ram[0xCB], f = T11(0x83A0 + cb);
    if (f < 0x80) ram[0xCE] = f;
    var y = cb * 4 + ((ram[R.FRAME] & 8) ? 2 : 0);
    var fr = T11(tp + y) | (T11(tp + y + 1) << 8);
    var sx = s16(ram[0xC7], ram[0xC6]) + s16(ram[R.PSCR_XH], ram[R.PSCR_X]);
    var sy = s16(ram[0xC9], ram[0xC8]) + s16(ram[R.PSCR_YH], ram[R.PSCR_Y]);
    if (sx >= SM.Spr.xmax || sy > 0xFF || sx + 40 < SM.Spr.xmin || sy + 56 < 0) return;
    var idx = 0, ai = 0, flip = ram[0xCE];
    for (var r = 0; r < 8; r++) {
      var yy = sy + r * 8;
      if (!rowOk(yy)) { idx += 6; ai += 6; continue; }
      for (var k = 0; k < 6; k++, idx++, ai++) {
        var c = flip ? 5 - k : k;
        var cx = sx + c * 8;
        if (!colOk(cx)) continue;
        var t = SM.rom.b(0x11, fr + idx);
        if (!t) { SM.Spr.hide(); continue; }
        SM.Spr.push(cx, yy, t, T11((flip ? 0x83EF : 0x83BF) + ai));
      }
    }
    exhaust(sx, sy);
  }
  // $8283: llama del motor
  function exhaust(sx, sy) {
    var v = T11(0x8379 + ram[0xCB]);
    if (v >= 0x80 || !(ram[R.FRAME] & 8)) return;
    var dx = 0x30, at = 3, idx = v;
    if (ram[0xCE]) { dx = -0x10; at = 0x43; idx = (v + 4) & 0xFF; }
    var bx = sx + dx;
    for (var r = 0; r < 2; r++) {
      var yy = sy + (3 + r) * 8;
      if (!rowOk(yy)) { idx += 2; continue; }
      for (var c = 0; c < 2; c++, idx++) {
        var cx = bx + c * 8;
        if (!colOk(cx)) continue;
        var t = T11(0x8388 + idx);
        if (!t) { SM.Spr.hide(); continue; }
        SM.Spr.push(cx, yy, t, at);
      }
    }
  }
  // $81A2: la bola (5x5 tiles)
  function ball() {
    var sx = s16(ram[0xD8], ram[0xD7]) + s16(ram[R.PSCR_XH], ram[R.PSCR_X]);
    var sy = s16(ram[0xDA], ram[0xD9]) + s16(ram[R.PSCR_YH], ram[R.PSCR_Y]);
    if (sx >= SM.Spr.xmax || sy > 0xFF || sx + 32 < SM.Spr.xmin || sy + 32 < 0) return;
    var f = ram[R.FRAME] & 3, idx = T11(0x8398 + f), at = T11(0x839C + f);
    for (var r = 0; r < 5; r++) {
      var yy = sy + r * 8;
      if (!rowOk(yy)) { idx += 5; continue; }
      for (var c = 0; c < 5; c++, idx++) {
        var cx = sx + c * 8;
        if (!colOk(cx)) continue;
        var t = T11(0x85BB + idx);
        if (!t) { SM.Spr.hide(); continue; }
        SM.Spr.push(cx, yy, t, at);
      }
    }
  }
})();
