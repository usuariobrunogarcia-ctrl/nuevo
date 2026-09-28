// Colisión del jugador con el escenario: port de $AC82 (banco $1D) y de los manejadores por
// tipo de metatile de los bancos $16 (tipos $00-$7F) y $17 (tipos $80-$FF).
// Cada metatile tiene un "tipo de colisión" (tabla $8500 del banco de zona). El tipo elige un
// manejador; las tablas de alturas que usan se leen del ROM.
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R;
  var T16 = function (a) { return SM.rom.b(0x16, a); };
  var T17 = function (a) { return SM.rom.b(0x17, a); };
  var SX_HI = R.SX_HI, SX_LO = R.SX_LO, SY_HI = R.SY_HI, SY_LO = R.SY_LO;
  var GSPD = R.GSPD, VSPD = R.VSPD, FL = R.PFLAGS, TY = R.COL_TYPE, ROW = R.COL_ROW, HIT = R.COL_HIT;
  var T25 = R.T25, AGAIN = R.AGAIN, LOOP = R.LOOP, ANG = R.ANGLE;

  // ---- utilidades que se repiten en el código original ----
  function xl() { return ram[SX_LO] & 0x0F; }
  function yl() { return ram[SY_LO] & 0x0F; }
  function snapY(v) { ram[SY_LO] = (ram[SY_LO] & 0xF0) | v; }
  function snapX(v) { ram[SX_LO] = (ram[SX_LO] & 0xF0) | v; }
  // $66 = ($66 - $10) | $0F ; $65 -= préstamo
  function rowUp(fixF0) {
    var a = ram[SY_LO] - 0x10, b = a < 0 ? 1 : 0;
    ram[SY_LO] = (a & 0xFF) | 0x0F;
    ram[SY_HI] = (ram[SY_HI] - b) & 0xFF;
    if (fixF0 && ram[SY_LO] >= 0xF0) ram[SY_LO] -= 0x10;
  }
  // $66 = ($66 + $10) & $F0 ; $65 += acarreo
  function rowDown() {
    var a = ram[SY_LO] + 0x10;
    ram[SY_LO] = a & 0xF0;
    ram[SY_HI] = (ram[SY_HI] + (a > 0xFF ? 1 : 0)) & 0xFF;
  }
  function colLeft() {   // $64 = ($64 - $10) | $0F ; $63 -= préstamo
    var a = ram[SX_LO] - 0x10, b = a < 0 ? 1 : 0;
    ram[SX_LO] = (a & 0xFF) | 0x0F;
    ram[SX_HI] = (ram[SX_HI] - b) & 0xFF;
  }
  function colRight() {  // $64 = ($64 + $10) & $F0 ; $63 += acarreo
    var a = ram[SX_LO] + 0x10;
    ram[SX_LO] = a & 0xF0;
    ram[SX_HI] = (ram[SX_HI] + (a > 0xFF ? 1 : 0)) & 0xFF;
  }
  function fric(n) {      // a = $14 - n ; si a >= $F8 -> 0
    var a = (ram[GSPD] - n) & 0xFF;
    if (a >= 0xF8) a = 0;
    ram[GSPD] = a;
  }
  function addClamp(n, max) {  // a = $14 + n (8 bits) ; si a >= max -> max
    var a = (ram[GSPD] + n) & 0xFF;
    if (a >= max) a = max;
    ram[GSPD] = a;
  }
  // a = $14 - n ; si a >= $F8 o a == 0 -> "se detuvo" ; si no, despega de la pendiente
  function slideUp(n) {
    var a = (ram[GSPD] - n) & 0xFF;
    if (a >= 0xF8 || a === 0) return false;
    ram[GSPD] = a;
    if (!(ram[FL] & 4)) { ram[FL] |= 4; ram[VSPD] = 3; } else ram[VSPD] += 4;
    return true;
  }
  function h99C7() { fric(1); }
  function h99D5() { rowUp(true); ram[AGAIN] = 1; ram[VSPD] = 0; }
  // Empuja el sensor al borde del metatile donde está el jugador ($888B/$8A4E)
  function pushBack() {
    if (((ram[R.PX_LO] ^ ram[SX_LO]) & 0xF0) !== 0) {
      ram[AGAIN] = 1;
      var d = ((ram[R.PX_HI] << 8) | ram[R.PX_LO]) - ((ram[SX_HI] << 8) | ram[SX_LO]);
      if (!(d & 0x8000) && d >= 0) { ram[SX_LO] = ram[R.PX_LO] & 0xF0; }
      else ram[SX_LO] = ram[R.PX_LO] | 0x0F;
      ram[SX_HI] = ram[R.PX_HI];
    }
    if (((ram[R.PY_LO] ^ ram[SY_LO]) & 0xF0) !== 0) {
      ram[AGAIN] = 1;
      var e = ((ram[R.PY_HI] << 8) | ram[R.PY_LO]) - ((ram[SY_HI] << 8) | ram[SY_LO]);
      if (e >= 0) ram[SY_LO] = ram[R.PY_LO] & 0xF0;
      else ram[SY_LO] = ram[R.PY_LO] | 0x0F;
      ram[SY_HI] = ram[R.PY_HI];
    }
    ram[HIT] = 1;
  }

  // =================== Banco $16 (tipos $00-$7F) ===================
  var B16 = {};
  // $809E: piso con alturas ($80E8)
  B16[0x809E] = function () {
    ram[ANG] = 0; ram[LOOP] = 0; ram[HIT] = 1;
    if (!(ram[FL] & 4)) {
      var v = T16(0x80E8 + ((xl() | ram[ROW]) & 0x7F));
      ram[T25] = v;
      if (v !== 0xFF) {
        ram[LOOP] = 0; ram[ANG] = 0;
        if (yl() >= v) { snapY(v); ram[VSPD] = 0; }
      }
    }
    fric(1);
  };
  // $8168
  B16[0x8168] = function () {
    ram[HIT] = 1; ram[LOOP] = 0; ram[ANG] = 0;
    if (ram[FL] & 4) {
      // (el original usa BCC aquí: si no hay préstamo el resultado es 0)
      var a = ram[GSPD] - 2;
      ram[GSPD] = a < 0 ? (a & 0xFF) : 0;
      return;
    }
    var v = T16(0x81C8 + ((xl() | ram[ROW]) & 0x7F));
    ram[T25] = v;
    if (v !== 0xFF && yl() >= v) { snapY(v); ram[VSPD] = 0; }
    var n = (ram[FL] & 1) ? 6 : 2;
    var b = ram[GSPD] - n;
    ram[GSPD] = b < 0 ? 0 : b;
  };
  // $8238
  B16[0x8238] = function () {
    ram[HIT] = 1; ram[LOOP] = 0; ram[ANG] = 0;
    if (ram[FL] & 4) { fric(1); return; }
    var v = T16(0x829C + ((xl() | ram[ROW]) & 0xFF));
    ram[T25] = v;
    if (v !== 0xFF && yl() >= v) { snapY(v); ram[VSPD] = 0; }
    fric((ram[FL] & 1) ? 2 : 8);
  };
  // $836C: pendiente (se pega al suelo si no está en el aire)
  B16[0x836C] = function () {
    ram[HIT] = 1;
    ram[ROW] = T16(0x92BF + (ram[TY] & 3));
    var v = T16(0x83CB + ((xl() | ram[ROW]) & 0xFF));
    ram[T25] = v;
    if ((ram[FL] & 4) || ram[VSPD] >= 0x10) {
      if (yl() < v) { h99C7(); return; }
    }
    snapY(v); ram[VSPD] = 0;
    var a;
    if (!(ram[FL] & 1)) { a = ram[GSPD] + 2; if (a >= 0xF0) a = 0xF0; }
    else { a = (ram[GSPD] - 2) & 0xFF; if (a >= 0xF8) a = 0; }
    ram[GSPD] = a;
  };
  // $83FB: pendiente (subida)
  B16[0x83FB] = function () {
    ram[HIT] = 1;
    ram[ROW] = T16(0x92BF + (ram[TY] & 3));
    var v = T16(0x8454 + ((xl() | ram[ROW]) & 0xFF));
    ram[T25] = v;
    if (yl() < v) { h99C7(); return; }
    snapY(v); ram[VSPD] = 0;
    var a;
    if (ram[FL] & 1) { a = ram[GSPD] + 2; if (a >= 0xF0) a = 0xF0; }
    else { a = (ram[GSPD] - 2) & 0xFF; if (a >= 0xF8) a = 0; }
    ram[GSPD] = a;
  };
  // $8484
  B16[0x8484] = function () {
    ram[HIT] = 1; ram[LOOP] = 0; ram[ANG] = 0;
    var a = ram[GSPD] - 1; ram[GSPD] = a < 0 ? 0 : a;
    if (ram[FL] & 4) return;
    var v = T16(0x84E7 + ((xl() | ram[ROW]) & 0xFF));
    ram[T25] = v;
    if (v === 0xF0) { rowUp(true); ram[AGAIN] = 1; ram[VSPD] = 0; return; }
    if (yl() >= v) { snapY(v); ram[VSPD] = 0; }
  };
  // $8577
  B16[0x8577] = function () {
    ram[HIT] = 1;
    if (!(ram[FL] & 4)) {
      var v = T16(0x85B5 + ((xl() | ram[ROW]) & 0x7F));
      ram[T25] = v;
      if (v !== 0xFF && yl() >= v) { snapY(v); ram[VSPD] = 0; }
    }
    fric(1);
  };
  // $8635 / $86CD: pendientes pronunciadas (cambian el set de animación $90)
  function steep(table, upWhenRight) {
    ram[HIT] = 1;
    ram[ROW] = T16(0x92BF + (ram[TY] & 7));
    var v = T16(table + ((xl() | ram[ROW]) & 0x7F));
    ram[T25] = v;
    if (v === 0xF0) { h99D5(); return false; }
    if (table === 0x8750 && !(ram[FL] & 4) && ram[VSPD] < 0x10) {
      if (v === 0xFF) ram[T25] = 0x0F;
    } else if (v === 0xFF || yl() < v) { h99C7(); return false; }
    snapY(ram[T25]); ram[VSPD] = 0;
    var a, up = upWhenRight ? !(ram[FL] & 1) : (ram[FL] & 1);
    if (up) { a = (ram[GSPD] + 2) & 0xFF; if (a >= 0xF8) a = 0xF8; }
    else {
      a = (ram[GSPD] - 2) & 0xFF;
      if (a >= 0xF8) { ram[FL] ^= 1; a = 0; }
    }
    ram[GSPD] = a;
    return true;
  }
  B16[0x8635] = function () {
    if (!steep(0x8750, true)) return;
    if (!(ram[FL] & 0x40)) { ram[LOOP] = 0x20; ram[ANG] = 0x40; }
    else { ram[LOOP] = 0; ram[ANG] = 0; }
  };
  B16[0x86CD] = function () {
    if (!steep(0x87A0, false)) return;
    if (!(ram[FL] & 0x40)) { ram[LOOP] = 0; ram[ANG] = 0; }
    else { ram[LOOP] = 0x20; ram[ANG] = 0; }
  };
  // $87F0
  B16[0x87F0] = function () {
    if (ram[TY] === 0x40) {
      if (!(ram[FL] & 4) && yl() < 8) { rowUp(true); ram[AGAIN] = 1; ram[VSPD] = 0; }
      return;
    }
    ram[AGAIN] = 1; ram[LOOP] = 0; ram[ANG] = 0; ram[VSPD] = 0;
    rowUp(true);
  };
  // $8853
  B16[0x8853] = function () {
    var t = ram[TY];
    if (t === 0x44) {
      if (ram[R.COL_8B] === 0) { ram[TY] = 0x4C; return B16[0x8970](); }
      ram[TY] = 0x75; return B16[0x8E67]();
    }
    if (t === 0x45) {
      if (ram[R.COL_8B] === 0) { ram[TY] = 0x41; return B16[0x87F0](); }
      return h99C7();
    }
    if (ram[R.COL_8B] === 0) { ram[TY] = 0x1D; return B16[0x83FB](); }
    h99C7();
  };
  // $888B: bloque sólido
  B16[0x888B] = function () {
    ram[LOOP] = 0; ram[ANG] = 0;
    if (ram[HIT] === 0) { ram[HIT] = 0; return; }
    ram[AGAIN] = 1;
    pushBack();
  };
  // $88FF: bloque sólido que detiene
  B16[0x88FF] = function () {
    ram[LOOP] = 0; ram[ANG] = 0; ram[AGAIN] = 1; ram[VSPD] = 0; ram[GSPD] = 0;
    pushBack();
  };
  // $8970
  B16[0x8970] = function () {
    if (ram[TY] === 0x4D) return h89F6();
    ram[LOOP] = 0; ram[ANG] = 0;
    if (!(ram[FL] & 4)) { ram[SY_LO] &= 0xF0; ram[VSPD] = 0; }
    var a = (ram[GSPD] - 1) & 0xFF;
    if (a >= 0xF8) a = 0;
    else if (ram[TY] !== 0x4C && a >= 0x30) a = 0x30;
    ram[GSPD] = a;
  };
  function h89F6() {
    ram[LOOP] = 0; ram[ANG] = 0;
    if (!(ram[FL] & 4)) {
      ram[AGAIN] = 1; ram[VSPD] = 0;
      var a = ram[SY_LO] - 0x10;
      var v = (a & 0xFF) | 0x0F;
      if (a < 0) { v = (v - 0x10) & 0xFF; ram[SY_HI] = (ram[SY_HI] - 1) & 0xFF; }
      ram[SY_LO] = v;
    }
    fric(1);
  }
  // $8A2C: sólido según la capa ($8B)
  B16[0x8A2C] = function () {
    var solid = (ram[TY] & 1) ? ram[R.COL_8B] === 0 : ram[R.COL_8B] !== 0;
    if (!solid) { ram[T25] = 0; ram[AGAIN] = 0; return; }
    pushBack();
  };
  // $8AAF: tramos de loop (piso/pared)
  B16[0x8AAF] = function () {
    ram[HIT] = 1;
    if (ram[R.COL_CHUNK] >= 0x3D && ram[R.COL_8B] !== 0) return;
    var x = 0x14;
    if (ram[TY] < 0x54) {
      x = 0x19; if (ram[FL] & 0x40) x = 0x20;
      ram[LOOP] = x; ram[ANG] = 0;
    } else if (ram[TY] !== 0x55) {
      ram[LOOP] = x;
      ram[ANG] = (ram[FL] & 0x40) ? 0x80 : 0;
    }
    h8BD0();
    var v = ram[T25];
    if (v === 0xFF) return;
    if (v === 0xF0) { ram[AGAIN] = 0xF0; return; }
    h8AFE();
  };
  function h8AFE() {
    var t = ram[TY] & 7, a;
    if (t === 0) {
      ram[VSPD] = 0;
      if (ram[FL] & 1) addClamp(5, 0xE0);
      else fric(5);
      return;
    }
    if (t < 5) {
      if (ram[FL] & 1) { addClamp(5, 0xE0); return; }
      a = (ram[GSPD] - 5) & 0xFF;
      if (a >= 0xF8) { ram[FL] |= 1; ram[GSPD] = 2; return; }
      ram[GSPD] = a;
      if (a === 0) { ram[FL] |= 1; ram[GSPD] = 2; return; }
      if (!(ram[FL] & 4)) { ram[FL] |= 4; ram[VSPD] = 3; return; }
      ram[VSPD] += 8; return;
    }
    if (t === 5) {
      ram[VSPD] += ram[GSPD] >> 1; ram[GSPD] = 2; ram[FL] &= 0xFC; return;
    }
    h8B82();
  }
  function h8B82() {
    if (ram[VSPD] !== 0) {
      if (ram[FL] & 4) ram[FL] |= 1; else ram[FL] &= 0xFC;
      addClamp(8, 0xE0);
    } else ram[GSPD] = 0;
  }
  function h8BAC() {
    if (ram[VSPD] !== 0) {
      if (ram[FL] & 4) ram[FL] &= 0xFC; else ram[FL] |= 1;
      ram[GSPD] += 0x0A;
    } else ram[GSPD] = 0;
  }
  // $8BD0 / $8F47: alturas de loop (tabla $8FCF / $923F)
  function loopHeights(table, xDirSnapRight) {
    var x = ram[TY] & 7, v, d;
    ram[ROW] = T16(0x92BF + x);
    if (x < 2) {
      v = T16(table + ((xl() | ram[ROW]) & 0xFF));
      ram[T25] = v;
      if (v < 0x80) {
        d = yl() - v;
        if (d < 0 && ((d & 0xFF) ^ 0xFF) >= 3) { ram[T25] = 0xFF; return; }
        snapY(v); return;
      }
      if (v === 0xFF) { ram[T25] = 0xFF; return; }
      rowUp(false); return;
    }
    v = T16(table + ((yl() | ram[ROW]) & 0xFF));
    ram[T25] = v;
    if (v < 0x80) {
      if (xDirSnapRight ? (xl() >= v) : (xl() < v)) { ram[T25] = 0xFF; return; }
      snapX(v); return;
    }
    if (v === 0xFF) { ram[T25] = 0xFF; return; }
    if (xDirSnapRight) colRight(); else colLeft();
  }
  function h8BD0() { loopHeights(0x8FCF, false); }
  function h8F47() { loopHeights(0x923F, true); }
  // $8C58: parte superior de loop
  B16[0x8C58] = function () {
    ram[HIT] = 1;
    var a = ram[TY] & 7;
    if (ram[R.COL_CHUNK] < 0x3D) a += 0x0A;
    else if (ram[R.COL_8B] !== 0) a += 5;
    ram[ROW] = T16(0x92BF + a);
    var v = T16(0x904F + ((xl() | ram[ROW]) & 0xFF));
    ram[T25] = v;
    if (v < 0x80) {
      if (yl() < v) { ram[T25] = 0xFF; return; }
      snapY(v);
      fric(3);
      ram[FL] &= 0x7F; ram[LOOP] = 0;
      return;
    }
    if (v === 0xFF) { ram[T25] = 0xFF; return; }
    ram[AGAIN] = v; rowUp(false);
  };
  // $8CC9: techo de loop
  B16[0x8CC9] = function () {
    ram[HIT] = 1;
    var a = ram[TY] & 7;
    if (ram[R.COL_CHUNK] < 0x3D) a += 0x0C;
    else if (ram[R.COL_8B] !== 0) a += 6;
    var r = T16(0x8D52 + a);
    if (r >= 0x80) { ram[T25] = 0xFF; return; }
    ram[ROW] = r;
    var v = T16(0x913F + ((xl() | r) & 0xFF));
    ram[T25] = v;
    if (v >= 0x80) {
      if (v === 0xFF) { ram[T25] = 0xFF; return; }
      ram[AGAIN] = v; rowDown(); return;
    }
    if (yl() >= v) { ram[T25] = 0xFF; return; }
    snapY(v);
    if ((ram[TY] & 7) >= 3) {
      ram[LOOP] = (ram[FL] & 1) ? 0x19 : 0x20;
      ram[ANG] = 0xC0; h8BAC();
    } else {
      ram[LOOP] = (ram[FL] & 1) ? 0x20 : 0x19;
      ram[ANG] = 0x80; h8B82();
    }
  };
  // $8D64
  B16[0x8D64] = function () {
    ram[HIT] = 1;
    var a = ram[TY] & 7;
    if (ram[R.COL_CHUNK] < 0x3D) a = T16(0x8DDE + a);
    else if (ram[R.COL_8B] !== 0) a += 5;
    ram[ROW] = T16(0x8DD2 + a);
    var v = T16(0x919F + ((xl() | ram[ROW]) & 0xFF));
    ram[T25] = v;
    if (v >= 0x80) {
      if (v === 0xFF) { ram[T25] = 0xFF; return; }
      ram[AGAIN] = v; rowDown(); return;
    }
    if (yl() >= v) { ram[T25] = 0xFF; return; }
    snapY(v);
    ram[LOOP] = 0x25;
    ram[ANG] = (ram[FL] & 1) ? 0xC0 : 0x80;
    // $8DE4
    var t = ram[TY] & 7;
    if (t === 0) return h8B82();
    if (t === 1) {
      if (!(ram[FL] & 1)) { ram[VSPD] = 2; ram[FL] &= 0xFB; return; }
      if (ram[FL] & 4) {
        var s = ((ram[VSPD] >> 1) + ram[GSPD]) & 0xFF;
        ram[GSPD] = s >= 0xA0 ? 0xA0 : s;
      }
      return;
    }
    if (t === 2) {
      ram[R.COL_8B] = ram[FL] & 1;
      var s2 = ((ram[VSPD] >> 1) + ram[GSPD]) & 0xFF;
      if (s2 >= 0xA0) s2 = 0xA0;
      ram[GSPD] = s2; ram[VSPD] = 4; ram[FL] |= 4;
      return;
    }
    if (t === 3) return;
    h8BAC();
  };
  // $8E4A: cambia de capa
  B16[0x8E4A] = function () {
    ram[HIT] = 0;
    ram[R.COL_8B] = (ram[TY] & 1) ? 1 : 0;
    fric(2);
  };
  // $8E67: pared de loop
  B16[0x8E67] = function () {
    ram[HIT] = 1;
    if (ram[R.COL_CHUNK] >= 0x3D && ram[R.COL_8B] === 0) return;
    var x = 0x14;
    if (ram[TY] < 0x74) {
      x = 0x20; if (ram[FL] & 0x40) x = 0x19;
      ram[LOOP] = x; ram[ANG] = 0x40;
    } else {
      ram[LOOP] = x;
      ram[ANG] = (ram[FL] & 0x40) ? 0x40 : 0xC0;
    }
    h8F47();
    var v = ram[T25];
    if (v === 0xFF) return;
    if (v === 0xF0) { ram[AGAIN] = 0xF0; return; }
    // $8EB2
    var t = ram[TY] & 7, a;
    if (t === 0) {
      ram[VSPD] = 0;
      if (!(ram[FL] & 1)) addClamp(7, 0xE0);
      else fric(5);
      return;
    }
    if (t < 5) {
      if (!(ram[FL] & 1)) { addClamp(7, 0xE0); return; }
      a = (ram[GSPD] - 8) & 0xFF;
      if (a === 0 || a >= 0xF8) { ram[FL] &= 0xF0; ram[GSPD] = 2; return; }
      ram[GSPD] = a;
      if (!(ram[FL] & 4)) { ram[FL] |= 0x0C; ram[VSPD] = 5; return; }
      ram[VSPD] += 0x0A; return;
    }
    if (t === 5) {
      ram[VSPD] += ram[GSPD] >> 1; ram[GSPD] = 2; ram[FL] |= 1; return;
    }
    h8BAC();
  };
  // $97EC
  B16[0x97EC] = function () { ram[HIT] = 1; fric(1); };
  // $97FE
  B16[0x97FE] = function () {
    ram[HIT] = 1;
    // $9897
    var x = ram[TY] & 7;
    ram[ROW] = T16(0x92BF + x);
    var v = T16(0x98D9 + ((xl() | ram[ROW]) & 0xFF));
    ram[T25] = v;
    if (v < 0x80) {
      if (yl() < v) { ram[T25] = 0xFF; return; }
      snapY(v);
    } else {
      if (v === 0xFF) return;
      rowUp(false);
    }
    if (ram[T25] === 0xF0) { ram[AGAIN] = 0xF0; return; }
    // $9817
    var lt2 = (ram[TY] & 7) < 2, left = ram[FL] & 1;
    if (lt2 ? !left : left) { ram[GSPD] += 2; return; }
    if (slideUp(5)) return;
    if (lt2) ram[FL] &= 0xFE; else ram[FL] |= 1;
    ram[GSPD] = 0;
  };

  // =================== Banco $17 (tipos $80-$FF) ===================
  var B17 = {};
  B17[0x809D] = function () { };
  // $809E: paredes con altura ($81F9)
  B17[0x809E] = function () {
    ram[HIT] = 1;
    // $8188
    var k = ram[TY] & 7; ram[R.T28] = k;
    ram[ROW] = T17(0x8B79 + k);
    var v = T17(0x81F9 + ((yl() | ram[ROW]) & 0xFF));
    ram[T25] = v;
    if (v < 0x80) {
      if (k < 3) { if (xl() >= v) { ram[T25] = 0xFF; return; } }
      else { if (xl() < v) { ram[T25] = 0xFF; return; } }
      snapX(v);
    } else {
      if (v === 0xFF) return;
      if (k < 3) colRight(); else colLeft();
    }
    if (ram[T25] === 0xF0) { ram[AGAIN] = 0xF0; return; }
    // $80BB
    var t = ram[TY] & 7;
    if (t === 0) {
      if (!(ram[FL] & 4)) ram[VSPD] = ram[GSPD];
      else ram[VSPD] += ram[GSPD] >> 2;
      ram[GSPD] = 0; ram[FL] |= 1;
    } else if (t < 3) {
      if (!(ram[FL] & 1)) ram[GSPD] += 2;
      else if (!slideUp(5)) { ram[FL] &= 0xFE; ram[GSPD] = 0; }
    } else if (t === 5) {
      ram[VSPD] += ram[GSPD] >> 2; ram[GSPD] = 0; ram[FL] &= 0xFE;
    } else {
      if (ram[FL] & 1) ram[GSPD] += 2;
      else if (!slideUp(4)) { ram[FL] |= 1; ram[GSPD] = 0; }
    }
    ram[AGAIN] = 0;
  };
  // $8259: resorte hacia arriba (tile)
  B17[0x8259] = function () {
    if (!(ram[FL] & 4) && ram[VSPD] >= 0x10 && ((ram[R.NX_LO] ^ ram[SX_LO]) & 0xF0) === 0) {
      snapY(6);
      ram[FL] |= 4;
      ram[VSPD] = ram[TY] === 0x88 ? 0x80 : 0xB0;
      ram[T25] = 0; ram[GSPD] = 1; ram[R.STATE] = 6;
      return;
    }
    if (ram[TY] !== 0x88) return;
    ram[AGAIN] = 1;
    if (!(ram[FL] & 4) && ram[VSPD] < 3 && ram[GSPD] >= 2) ram[R.STATE] = 0x0D;
    ram[AGAIN] = 1; ram[GSPD] = 1;
    if (ram[FL] & 1) colRight(); else colLeft();
    ram[HIT] = 1;
  };
  // $8309: resortes laterales
  B17[0x8309] = function () {
    var toLeft = ram[TY] === 0x8A;
    var cond = toLeft ? (ram[FL] & 1) : !(ram[FL] & 1);
    if (cond && ((ram[R.PY_LO] ^ ram[SY_LO]) & 0xF0) === 0) {
      snapX(0x0A);
      if (toLeft) ram[FL] &= 0xBC; else ram[FL] |= 0x41;
      ram[GSPD] = 0xF0; ram[R.LOCK] = 2; ram[T25] = 0;
      return;
    }
    if (yl() < 7) {
      ram[AGAIN] = 1; ram[VSPD] = 0;
      var a = ram[SY_LO] - 0x10, v = (a & 0xFF) | 0x0F;
      if (a < 0) { v = (v - 0x10) & 0xFF; ram[SY_HI] = (ram[SY_HI] - 1) & 0xFF; }
      ram[SY_LO] = v;
    }
    ram[HIT] = 1;
  };
  // $83B2
  B17[0x83B2] = function () {
    var c = ram[SX_LO] & 0xF0, p = ram[R.PX_LO] & 0xF0;
    if (p !== c) {
      if (p > c) ram[FL] &= 0xFE; else ram[FL] |= 1;
      if (ram[GSPD] < 0x20) ram[GSPD] = 0x20;
    }
    c = ram[SY_LO] & 0xF0; p = ram[R.PY_LO] & 0xF0;
    if (p !== c) {
      if (p > c) ram[FL] &= 0xFB; else ram[FL] |= 4;
      ram[VSPD] = 0x40;
      if (ram[GSPD] === 0) ram[GSPD] = 1;
    }
    ram[R.STATE] = 1;
  };
  // $840B: plataforma atravesable
  B17[0x840B] = function () {
    if (!(ram[FL] & 4) && ram[VSPD] < 0x18) {
      ram[VSPD] = 0;
      var a = (ram[SY_LO] + 0x10) & 0xFF;
      if (a >= 0xF0) { ram[SY_HI] = (ram[SY_HI] + 1) & 0xFF; a = (a + 0x10) & 0xFF; }
      ram[SY_LO] = a & 0xF0;
      ram[AGAIN] = 1;
      return;
    }
    fric(1);
  };
  // $8437 / $8474: paredes de un solo sentido
  function stopByWall() {
    if (!(ram[FL] & 4) && ram[VSPD] < 3 && ram[GSPD] >= 2) ram[R.STATE] = 0x0D;
    ram[GSPD] = 0; ram[AGAIN] = 1;
  }
  B17[0x8437] = function () {
    if (ram[FL] & 1) { colRight(); stopByWall(); } else ram[AGAIN] = 0;
  };
  B17[0x8474] = function () {
    if (!(ram[FL] & 1)) { colLeft(); stopByWall(); } else ram[AGAIN] = 0;
  };
  // $84B1: pared sólida / techo
  B17[0x84B1] = function () {
    if (ram[FL] & 4) {
      if (((ram[R.PX_LO] ^ ram[SX_LO]) & 0xF0) === 0) {
        var a = (ram[SY_LO] + 0x10) & 0xF0;
        if (a >= 0xF0) { a = 0; ram[SY_HI] = (ram[SY_HI] + 1) & 0xFF; }
        ram[SY_LO] = a;
        ram[VSPD] = 2; ram[FL] &= 0xFB;
        return;
      }
    } else if (ram[VSPD] < 3 && ram[GSPD] >= 2) ram[R.STATE] = 0x0D;
    ram[GSPD] = 0;
    if (ram[FL] & 1) ram[SX_LO] = ram[R.PX_LO] & 0xF0; else ram[SX_LO] = ram[R.PX_LO] | 0x0F;
    ram[SX_HI] = ram[R.PX_HI];
  };
  // $857C: techo
  B17[0x857C] = function () {
    if (!(ram[FL] & 4)) return;
    var a = ram[SY_LO] + 0x10;
    ram[SY_HI] = (ram[SY_HI] + (a > 0xFF ? 1 : 0)) & 0xFF;
    a &= 0xFF;
    if (a >= 0xF0) { ram[SY_HI] = (ram[SY_HI] + 1) & 0xFF; a = 0; }
    ram[SY_LO] = a & 0xF0;
    ram[FL] &= 0xF3; ram[VSPD] = 2;
  };
  // $85A8: agua
  B17[0x85A8] = function () {
    if (ram[TY] === 0x98) {
      if (ram[R.STATE] !== 9 && ram[R.WATER] === 0) ram[R.WATER]++;
    } else {
      ram[R.WATER] = 0;
      if (ram[0xB5] === 0) ram[R.MUSIC] = 0x26;
    }
    fric(1);
  };
  // $85CC: tobogán
  B17[0x85CC] = function () {
    ram[R.STATE] = 0x2B; ram[LOOP] = 0; ram[ANG] = 0;
    ram[ROW] = T17(0x8B79 + (ram[TY] & 1));
    if (ram[FL] & 4) { ram[R.STATE] = 8; fric(1); return; }
    ram[SY_LO] = (ram[SY_LO] & 0xF0) | T17(0x8619 + ((xl() | ram[ROW]) & 0xFF));
    if (ram[TY] === 0x9A) ram[FL] &= 0x32; else ram[FL] |= 0x41;
    ram[GSPD] = 0x90; ram[VSPD] = 0;
  };
  // $8639
  B17[0x8639] = function () {
    ram[GSPD] = 0; ram[LOOP] = 0; ram[ANG] = 0; ram[VSPD] = 0x60;
    ram[R.STATE] = 0x2B; ram[FL] &= 0xF3;
  };
  // $8650: tubo (fuerza rodar)
  B17[0x8650] = function () {
    ram[FL] &= 0xFC; ram[AGAIN] = 0;
    var x = ram[TY] & 7;
    ram[GSPD] = T17(0x86A3 + x); ram[VSPD] = T17(0x86AB + x);
    var v = T17(0x86B3 + ((xl() | T17(0x8B79 + x)) & 0xFF));
    ram[T25] = v;
    if (v < 0x80) snapY(v);
    else if (v !== 0xFF) { rowUp(false); ram[AGAIN] = 1; }
    ram[R.STATE] = 0x20;
  };
  // $8733
  B17[0x8733] = function () {
    ram[AGAIN] = 0;
    var r = T17(0x8B79 + ram[TY]);
    var v = T17(0x878E + ((xl() | r) & 0xFF));
    ram[T25] = v;
    if (v < 0x80) {
      snapY(v);
      var x = ram[TY] & 7;
      if (x !== 0) ram[FL] |= 1;
      ram[GSPD] = T17(0x8788 + x); ram[VSPD] = T17(0x878B + x);
    } else if (v !== 0xFF) { rowUp(false); ram[AGAIN] = 1; }
    ram[R.STATE] = 0x20;
  };
  // $87BE
  B17[0x87BE] = function () {
    ram[AGAIN] = 0;
    var x = ram[TY] & 7;
    if (x === 1) ram[FL] &= 0xFC;
    ram[GSPD] = T17(0x87F9 + x); ram[VSPD] = T17(0x8801 + x);
    var r = T17(0x8B79 + x);
    ram[SX_LO] = (ram[SX_LO] & 0xF0) | T17(0x8809 + ((yl() | r) & 0xFF));
    ram[R.STATE] = 0x20;
  };
  // $8B89
  B17[0x8B89] = function () {
    if (ram[TY] === 0xC4) {
      if (xl() < 4) return;
      snapX(3);
    } else {
      if (xl() >= 0x0C) return;
      snapX(0x0C);
    }
    ram[GSPD] = 0;
    if (!(ram[FL] & 4) && ram[VSPD] < 3) ram[R.STATE] = 0x0D;
  };
  // $8BC7
  B17[0x8BC7] = function () {
    if (ram[FL] & 4) return;
    var r = T17(0x8C05 + (ram[TY] & 3));
    var v = T17(0x8C09 + ((xl() | r) & 0xFF));
    if (v >= 0x80) return;
    ram[R.T2B] = v;
    if (yl() < v) return;
    snapY(8); ram[VSPD] = 0;
    var a = ram[GSPD] - 3;
    ram[GSPD] = (a & 0x80) ? 0 : a;
  };
  // $8C29: pinchos
  B17[0x8C29] = function () {
    if (yl() < 8) return;
    snapY(8);
    h8C3A();
  };
  B17[0x8C80] = function () {
    if (yl() >= 8) snapY(8);
    h8C3A();
  };
  function h8C3A() {
    if (ram[R.PFLAGS2] >= 8 || ram[R.HURT] !== 0) {
      if (!(ram[FL] & 4)) ram[VSPD] = 0;
      var a = ram[GSPD] - 2;
      ram[GSPD] = (a & 0x80) ? 0 : a;
      return;
    }
    hurtPlayer();
  }
  function hurtPlayer() {
    ram[R.STATE] = 0x0A; ram[GSPD] = 0x30; ram[VSPD] = 0x30;
    ram[FL] = (ram[FL] ^ 3) | 0x0C;
    ram[R.HURT] = 6;
    var y = ram[R.PFLAGS2];
    if (!(y & 2)) return loseRings();
    ram[R.PFLAGS2] = y & 0xFD;
  }
  // $8C93: pinchos en el techo
  B17[0x8C93] = function () {
    if (ram[R.HURT] !== 0 || !(ram[FL] & 4)) return;
    hurtPlayer();
  };
  // $8CC3: perder anillos (hasta 3 anillos rebotando) o morir
  function loseRings() {
    var n = 3;
    if (ram[R.RING_H] === 0 && ram[R.RING_T] === 0) {
      if (ram[R.RING_O] === 0) return SM.Collision.kill();
      if (ram[R.RING_O] < 3) n = ram[R.RING_O];
    }
    var y = ram[R.OBJ_N], O = SM.O;
    for (var i = 0; i < 3; i++) {
      {
        ram[O.TYPE + y + i] = i < n ? 0x16 : 0;
        ram[O.XL + y + i] = ram[R.PX_LO]; ram[O.XH + y + i] = ram[R.PX_HI];
        ram[O.YL + y + i] = ram[R.PY_LO]; ram[O.YH + y + i] = ram[R.PY_HI];
      }
    }
    ram[O.P + y] = 1;
    ram[O.P + y + 1] = 0x91;
    ram[R.OBJ_N] = (y + n) & 0xFF;
    ram[R.RING_H] = ram[R.RING_T] = ram[R.RING_O] = 0;
    ram[R.SFX] = 4;
  }
  SM.Collision = {};
  SM.Collision.hurt = hurtPlayer;
  SM.Collision.loseRings = loseRings;
  // $8D70: muerte
  SM.Collision.kill = function () {
    ram[R.STATE] = 9; ram[VSPD] = 0x50; ram[GSPD] = 0; ram[FL] |= 4;
    ram[R.DYING] = 1; ram[R.SFX] = 5; ram[R.HURT] = 0; ram[R.SHIELD] = 0;
  };
  // $8DC2
  B17[0x8DC2] = function () {
    ram[FL] ^= 1;
    if (ram[TY] === 0xD0) return;
    if (!(ram[FL] & 4)) ram[SX_LO] = (ram[SX_LO] + 0x10) & 0xF0;
    else ram[SX_LO] = ((ram[SX_LO] - 0x10) & 0xFF) | 0x0F;
    ram[GSPD] = 0x80;
  };
  // $8DF6: impulso vertical
  B17[0x8DF6] = function () {
    ram[VSPD] = 0xB0; ram[GSPD] = 0x40; ram[FL] |= 4; ram[R.STATE] = 8;
  };
  // $8E09: rampas de salto
  B17[0x8E09] = function () {
    var r = T17(0x8B79 + (ram[TY] & 3));
    ram[ROW] = r;
    var y2 = (xl() | r) & 0xFF;
    ram[R.T2B] = y2;
    var v = T17(0x8EF2 + y2);
    if (v >= 0x80) return;
    ram[T25] = v;
    if (ram[TY] < 0xDA) { if (yl() < v) return; }
    else if (yl() >= v) return;
    snapY(v);
    ram[FL] = (ram[FL] & 0xF0) | T17(0x8EEE + (ram[TY] & 3));
    var k = y2 & 0x1F;
    ram[GSPD] = T17(0x8F32 + k); ram[VSPD] = T17(0x8F52 + k);
  };
  // $8E62: lanzadores
  B17[0x8E62] = function () {
    ram[R.STATE] = 8;
    var t = ram[TY];
    if (t === 0xDC) {
      var a = ((ram[SY_LO] - 0x10) & 0xFF) | 0x0F;
      if (a >= 0xF0) { a -= 0x10; ram[SY_HI] = (ram[SY_HI] - 1) & 0xFF; }
      ram[SY_LO] = a;
      ram[FL] |= 4; ram[VSPD] = 0x60; ram[GSPD] = 0x20;
    } else if (t === 0xDD) {
      var b = (ram[SY_LO] + 0x10) & 0xF0;
      if (b >= 0xF0) { b = (b + 0x10) & 0xFF; ram[SY_HI] = (ram[SY_HI] + 1) & 0xFF; }
      ram[SY_LO] = b;
      ram[FL] &= 0xFB; ram[VSPD] = 0x60; ram[GSPD] = 0x20;
    } else if (t === 0xDE) {
      colLeft(); ram[FL] |= 1; ram[GSPD] = 0x80;
    } else {
      colRight(); ram[FL] &= 0xFE; ram[GSPD] = 0x80;
    }
  };
  // $8F72: anillo tocado por un sensor
  B17[0x8F72] = function () {
    var x = ram[TY] & 0x1F;
    var y = (T17(0x902D + x) + ram[R.RINGBASE]) & 0xFF;
    if (!(ram[R.RINGS_BITS + y] & T17(0x904D + x))) return;
    ram[R.RINGS_BITS + y] &= T17(0x906D + x);
    SM.Collision.addRing();
    ram[AGAIN] = 0;
  };
  SM.Collision.addRing = function () {
    ram[R.SFX] = 2;
    var o = ram[R.RING_O] + 1;
    if (o < 10) { ram[R.RING_O] = o; return; }
    ram[R.RING_O] = 0;
    var t = ram[R.RING_T] + 1;
    if (t < 10) { ram[R.RING_T] = t; return; }
    ram[R.RING_T] = 0;
    ram[R.RING_H]++;
  };

  // ---- Despacho ($8000 de cada banco) ----
  function dispatch() {
    var t = ram[TY];
    if (t & 0x80) {
      ram[ROW] = T17(0x8B79 + (t & 0x0F));
      var a = SM.rom.w(0x17, 0x801D + (t & 0x7E));
      var f = B17[a];
      if (f) f(); else console.warn('colisión $17 sin portar', a.toString(16));
    } else {
      ram[ROW] = T16(0x92BF + (t & 0x0F));
      var a2 = SM.rom.w(0x16, 0x801D + (t & 0x7E));
      var f2 = B16[a2];
      if (f2) f2(); else console.warn('colisión $16 sin portar', a2.toString(16));
    }
  }
  function probe() {
    for (var guard = 0; guard < 16; guard++) {
      ram[AGAIN] = 0;
      var m = SM.Level.metatileRaw(ram[SX_HI], ram[SX_LO], ram[SY_HI], ram[SY_LO]);
      ram[TY] = SM.Level.mtCol[m];
      if (SM.Collision.trace) SM.Collision.trace.push([ram[SX_HI], ram[SX_LO], ram[SY_HI], ram[SY_LO], m, ram[TY]]);
      dispatch();
      if (ram[AGAIN] === 0) return;
    }
  }
  SM.Collision.dispatch = dispatch;
  // $AC82: dos sensores en x+7 y x-7 a la altura de los pies
  SM.Collision.player = function () {
    var x = ((ram[R.NX_HI] << 8) | ram[R.NX_LO]) + 7;
    ram[SX_LO] = x & 0xFF; ram[SX_HI] = (x >> 8) & 0xFF;
    ram[SY_HI] = ram[R.NY_HI]; ram[SY_LO] = ram[R.NY_LO];
    probe();
    x = (((ram[SX_HI] << 8) | ram[SX_LO]) - 14) & 0xFFFF;
    ram[SX_LO] = x & 0xFF; ram[SX_HI] = x >> 8;
    probe();
    x = (((ram[SX_HI] << 8) | ram[SX_LO]) + 7) & 0xFFFF;
    ram[R.NX_LO] = x & 0xFF; ram[R.NX_HI] = x >> 8;
    ram[R.NY_HI] = ram[SY_HI]; ram[R.NY_LO] = ram[SY_LO];
  };
})();
