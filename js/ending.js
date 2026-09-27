// Fin de acto: cápsula tras el jefe ($A452, banco $15), su dibujo ($D1F3), la secuencia
// $B5 ($D18E) y ediciones del fondo (la cápsula se abre modificando tiles del nametable).
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R, O = SM.O;
  function T15(a) { return SM.rom.b(0x15, a); }
  function T30(a) { return SM.rom.b(0x1E, a); }
  function s16(hi, lo) { var v = (hi << 8) | lo; return v >= 0x8000 ? v - 0x10000 : v; }

  // ---- ediciones del fondo: tiles sobrescritos en coordenadas del mundo (celdas de 8 px) ----
  var BE = SM.BgEdit = { map: {} };
  BE.clear = function () { this.map = {}; };
  BE.key = function (tx, ty) { return tx * 4096 + ty; };
  BE.get = function (tx, ty) { var v = this.map[tx * 4096 + ty]; return v === undefined ? -1 : v; };
  // bloque de w x h tiles en la posición (alineada a 16 px) del sensor $63-$66
  function block(w, h, tiles) {
    var x = ((ram[R.SX_HI] << 8) | ram[R.SX_LO]) & ~15;
    var y = (ram[R.SY_HI] * 240 + ram[R.SY_LO]) & ~15;
    for (var r = 0; r < h; r++) for (var c = 0; c < w; c++)
      BE.map[BE.key((x >> 3) + c, (y >> 3) + r)] = tiles[r * w + c];
  }

  var E = SM.Ending = {};

  // ---- $A452 ----
  E.capsuleSequence = function () {
    var d = ((ram[0x681] << 8) | ram[0x680]) - ((ram[R.NX_HI] << 8) | ram[R.NX_LO]);
    ram[0x684] = d & 0xFF; ram[0x685] = (d >> 8) & 0xFF;
    if (ram[0x685] !== 0 && ram[0x685] !== 0xFF) return;
    var bl = ram[0x682] - ram[R.NY_LO];
    ram[0x686] = bl & 0xFF;
    ram[0x687] = (ram[0x683] - ram[R.NY_HI] - (bl < 0 ? 1 : 0)) & 0xFF;
    var a;
    if (ram[0x687] === 0) a = 0xF0; else if (ram[0x687] === 0xFF) a = 0x10; else return;
    if (ram[0x683] !== ram[R.NY_HI]) {
      var s = a + ram[0x686], c = s > 0xFF ? 1 : 0;
      ram[0x686] = s & 0xFF;
      ram[0x687] = (a & 0x80) ? (ram[0x687] - 1 + c) & 0xFF : (ram[0x687] + c) & 0xFF;
    }
    switch (ram[0xB6]) {
      case 1: {                                           // $A4D3: la cámara avanza
        ram[R.CHR4] = T15(0xA527 + ram[R.ZONE]);
        ram[R.CHR1] = 0xE6;
        ram[R.DYING] = 1;
        var sx = (((ram[R.NX_HI] << 8) | ram[R.NX_LO]) - ((ram[R.CAM_XH] << 8) | ram[R.CAM_XL])) & 0xFFFF;
        ram[R.SX_LO] = sx & 0xFF; ram[R.SX_HI] = sx >> 8;
        var step;
        if (ram[R.SX_HI] !== 0) step = 8;
        else {
          var t = ram[R.SX_LO] - 0x40;
          if (t < 0) step = -1; else step = t < 8 ? t : 8;
        }
        if (step < 0) { ram[R.NCAM_XL] = ram[R.CAM_XL]; ram[R.NCAM_XH] = ram[R.CAM_XH]; }
        else {
          var v = ram[R.CAM_XL] + step;
          ram[R.NCAM_XL] = v & 0xFF; ram[R.NCAM_XH] = (ram[R.CAM_XH] + (v > 0xFF ? 1 : 0)) & 0xFF;
        }
        if (ram[R.NCAM_XH] === ram[0x681]) { ram[0xB6]++; ram[0xB7] = 1; }
        return;
      }
      case 2: return solid();                              // $A52C
      case 3:                                              // $A537: camina solo
        ram[R.STATE] = 1; ram[R.GSPD] = 0x60; ram[R.PFLAGS] &= 0xBC;
        if (((ram[R.PX_HI] - ram[0x681]) & 0xFF) === 1) {
          ram[R.NX_LO] = 0xE0; ram[R.NX_HI] = ram[0x681];
          ram[R.STATE] = 0xFF; ram[0xB6]++;
        }
        return solid();
      case 4: {                                            // $A569
        var y = ram[R.OBJ_N];
        var x = ((ram[0x681] << 8) | ram[0x680]) - 0x0C;
        ram[O.XL + y] = x & 0xFF; ram[O.XH + y] = (x >> 8) & 0xFF;
        var yy = ((ram[0x683] << 8) | ram[0x682]) + 0x10;
        ram[O.YL + y] = yy & 0xFF; ram[O.YH + y] = (yy >> 8) & 0xFF;
        ram[O.P + y] = 0; ram[O.TYPE + y] = 0x60;
        ram[R.OBJ_N] = y + 1;
        ram[0xB6]++; ram[0xB1] = 2;
        return;
      }
      case 5:                                              // $A573
        if (ram[R.SEC_CNT] === 0) { ram[0xB1]--; if (!ram[0xB1]) ram[0xB6]++; }
        return;
      case 6: sensorAt(0x18); ram[0xB6]++;                 // $A57F: se borra la cápsula
        block(6, 4, [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
          0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
        return;
      case 7: {                                            // $A5AF: cápsula abierta
        ram[0xB6]++; sensorAt(0x38);
        ram[R.MUSIC] = 0x22; ram[0x688] = 0x10;
        var tl = []; for (var i = 0; i < 12; i++) tl.push(T15(0xA82A + i));
        block(6, 2, tl);
        return;
      }
      case 8:                                              // $A5F4: salen los animalitos
        if (ram[R.FRAME] & 0x0F) return;
        var s = ram[R.OBJ_N];
        if (s >= 0x17) return;
        ram[O.XL + s] = ram[0x680]; ram[O.XH + s] = ram[0x681];
        var q = ram[0x682] + 0x40;
        ram[O.YL + s] = q & 0xFF; ram[O.YH + s] = (ram[0x683] + (q > 0xFF ? 1 : 0)) & 0xFF;
        ram[O.TYPE + s] = (ram[0x688] & 1) ? 0x18 : 0x19;
        ram[O.P + s] = T15(0xA641 + ram[0x688]);
        ram[R.OBJ_N] = s + 1;
        ram[0x688]--;
        if (ram[0x688] & 0x80) ram[0xB6]++;
        return;
      case 9: ram[0xB5] = 1; ram[0xB6] = 0; return;         // $A5EB
    }
  };
  function sensorAt(dy) {
    var x = ((ram[0x681] << 8) | ram[0x680]) - 0x0C;
    ram[R.SX_LO] = x & 0xFF; ram[R.SX_HI] = (x >> 8) & 0xFF;
    var y = ram[0x682] + dy, h = ram[0x683] + (y > 0xFF ? 1 : 0);
    y &= 0xFF;
    if (y >= 0xF0) { y = (y + 0x10) & 0xFF; h++; }
    ram[R.SY_LO] = y; ram[R.SY_HI] = h & 0xFF;
  }
  // $A651: la cápsula es sólida
  function solid() {
    ram[0x9F] = 0x18; ram[0xA0] = 0x30;
    if (!(ram[0x687] & 0x80)) return;
    var y = 0;
    if (ram[0x686] < 0xFB) { if (ram[0x686] < 0xD0) return; y = 1; }
    ram[0x9E] = y;
    if (!(ram[0x685] & 0x80)) { if (ram[0x684] >= 8) return; }
    else { var s = ram[0x684] + ram[0x9F]; if (s <= 0xFF && s + 8 <= 0xFF) return; }
    if (y === 0) {                                          // $A727: encima
      if (ram[R.PFLAGS] & 0x0C) return push(false);
      ram[R.NY_LO] = ram[0x682]; ram[R.NY_HI] = ram[0x683];
      ram[0x687] = 0; ram[0x686] = 0; ram[R.VSPD] = 0;
      var g = ram[R.GSPD] - 2; ram[R.GSPD] = (g & 0x80) ? 0 : g;
      if (ram[0xB6] < 3) { ram[0xB6]++; ram[0xB7] = 0; }
      return;
    }
    push(true);
  }
  // $A696 / $A6FC
  function push(stop) {
    var cx = (ram[0x681] << 8) | ram[0x680], n;
    if (!(ram[0x685] & 0x80)) {
      if (stop && ram[R.PFLAGS] === 0 && (ram[R.JOY] & 1)) { ram[R.STATE] = 0x0D; ram[R.GSPD] = 0; }
      n = cx - 7;
    } else {
      if (stop && (ram[R.PFLAGS] & 0x0F) === 3 && (ram[R.JOY] & 2)) { ram[R.STATE] = 0x0D; ram[R.GSPD] = 0; }
      n = cx + ram[0x9F] + 7;
    }
    ram[R.NX_LO] = n & 0xFF; ram[R.NX_HI] = (n >> 8) & 0xFF;
    var d = (cx - n) & 0xFFFF;
    ram[0x684] = d & 0xFF; ram[0x685] = d >> 8;
  }

  // ---- $D1F3: botón de la cápsula (3x3) ----
  E.drawCapsule = function () {
    if (ram[0xB6] >= 4) return;
    var sx = s16(ram[0x685], ram[0x684]) + s16(ram[R.PSCR_XH], ram[R.PSCR_X]);
    var sy = s16(ram[0x687], ram[0x686]) + s16(ram[R.PSCR_YH], ram[R.PSCR_Y]);
    if (sx >= SM.Spr.xmax || sy > 0xFF || sx + 16 < SM.Spr.xmin || sy + 16 < 0) return;
    var idx = (ram[R.FRAME] & 0x20) ? 0 : 9;
    for (var r = 0; r < 3; r++) {
      var y = sy + r * 8;
      if (y < 1 || y > 0xFF) { idx += 3; continue; }
      for (var c = 0; c < 3; c++, idx++) {
        var x = sx + c * 8;
        if (x === 0 || !SM.Spr.visX(x)) continue;
        var t = T30(0xD2DD + idx);
        if (!t) { SM.Spr.hide(); continue; }
        SM.Spr.push(x, y, t, T30(0xD2EF + idx));
      }
    }
  };

  // ---- $D18E: fin del acto ($B5) ----
  E.actEnd = function () {
    switch (ram[0xB5]) {
      case 1: case 4: ram[0xB1] = 6; ram[0xB5]++; return;                 // $D1AD
      case 2: case 5:                                                     // $D1B4
        if (ram[R.SEC_CNT] === 0) {
          ram[0xB1]--;
          if (ram[0xB1] & 0x80) { ram[0xB5]++; ram[0x333] = 5; }
        }
        return;
      case 3:                                                             // $D1C5
        SM.Game.palFade();
        if (ram[0x333] === 9) { ram[0xB5] = 0; ram[0xB2] = 4; }
        return;
      case 6:                                                             // $D1DA
        SM.Game.palFade();
        if (ram[0x333] === 9) { ram[R.MUSIC] = 0; ram[0xB5] = 0; ram[0xB9] = 0; ram[0xB8] = 0; ram[0xB2] = 5; }
        return;
    }
  };
})();
