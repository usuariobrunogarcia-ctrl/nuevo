// Objetos: port de la lógica de los bancos $14/$15 (actualización) del ROM.
//   - generador por chunks ($A029), bucle ($A27C), compactación ($A3ED)
//   - comportamiento de cada tipo usado en Green Hill
// 23 ranuras de objetos con la misma distribución que en RAM ($0500-$05FC).
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R, O = SM.O;
  var TYPE = O.TYPE, XL = O.XL, XH = O.XH, YL = O.YL, YH = O.YH, P = O.P, SRC = O.SRC;
  var SXL = O.SXL, SXH = O.SXH, SYL = O.SYL, SYH = O.SYH;
  var W9F = 0x9F, WA0 = 0xA0, K9E = 0x9E;
  function t14(a) { return SM.rom.b(a < 0xA000 ? 0x14 : 0x15, a); }
  function tZ(a) { return SM.rom.b(SM.ram[R.ZBANK], a); }

  var Obj = SM.Objects = {};
  // Margen extra (en px) para el modo panorámico: los objetos se mantienen activos
  // mientras sean visibles en una vista más ancha que la original.
  Obj.extra = 0;

  // ---- utilidades de posición ----
  function addX(x, d) {
    var v = ((ram[XH + x] << 8) | ram[XL + x]) + d;
    ram[XL + x] = v & 0xFF; ram[XH + x] = (v >> 8) & 0xFF;
  }
  // y en páginas de 240 (el patrón "ADC ; CMP #$F0 ; +$10 ; INC")
  function addY(x, d) {
    var l = ram[YL + x] + d, h = ram[YH + x];
    if (d >= 0) {
      if (l > 0xFF) { l -= 256; h++; }
      if (l >= 0xF0) { l = (l + 0x10) & 0xFF; h++; }
    } else {
      if (l < 0) { l += 256; h--; }
      if (l >= 0xF0) l -= 0x10;
    }
    ram[YL + x] = l; ram[YH + x] = h & 0xFF;
  }
  // suma/resta de 16 bits sin la corrección de página (como hacen algunos objetos)
  function addYraw(x, d) {
    var v = ((ram[YH + x] << 8) | ram[YL + x]) + d;
    ram[YL + x] = v & 0xFF; ram[YH + x] = (v >> 8) & 0xFF;
  }

  // Posición relativa al jugador ($05A1-$05E6) — patrón repetido en todos los objetos.
  // Devuelve false si el objeto quedó fuera de rango (el llamador lo elimina).
  function relPos(x) {
    var dx = (((ram[XH + x] << 8) | ram[XL + x]) - ((ram[R.NX_HI] << 8) | ram[R.NX_LO])) & 0xFFFF;
    ram[SXL + x] = dx & 0xFF; ram[SXH + x] = dx >> 8;
    if (ram[SXH + x] !== 0 && ram[SXH + x] !== 0xFF) {
      if (!Obj.extra) return false;
      var sdx = dx >= 0x8000 ? dx - 0x10000 : dx;
      if (sdx < -256 - Obj.extra || sdx >= 256 + Obj.extra) return false;
    }
    var bl = ram[YL + x] - ram[R.NY_LO];
    ram[SYL + x] = bl & 0xFF;
    var hy = (ram[YH + x] - ram[R.NY_HI] - (bl < 0 ? 1 : 0)) & 0xFF;
    ram[SYH + x] = hy;
    var a;
    if (hy === 0) a = 0xF0; else if (hy === 0xFF) a = 0x10; else return false;
    if (ram[YH + x] !== ram[R.NY_HI]) {
      var s = a + ram[SYL + x];
      ram[SYL + x] = s & 0xFF;
      var c = s > 0xFF ? 1 : 0;
      ram[SYH + x] = (a & 0x80) ? (ram[SYH + x] - 1 + c) & 0xFF : (ram[SYH + x] + c) & 0xFF;
    }
    return true;
  }
  Obj.relPos = relPos;

  // $81D3: elimina y permite que vuelva a aparecer
  function despawn(x) {
    ram[TYPE + x] = 0;
    var y = ram[SRC + x];
    var k = SM.rom.b(0x15, 0xB273 + y);
    ram[R.OBJ_SPAWNED + k] &= SM.rom.b(0x15, 0xB373 + y);
  }
  Obj.despawn = despawn;
  function remove(x) { ram[TYPE + x] = 0; }       // $8CC8

  // $8A31: contacto con el jugador; $9F/$A0 = tamaño, $9E = tipo de contacto
  function touch(x) {
    if (!(ram[SXH + x] & 0x80)) { if (ram[SXL + x] >= 8) return; }
    else {
      var s = ram[SXL + x] + ram[W9F];
      if (s <= 0xFF && (s + 8) <= 0xFF) return;
    }
    if (!(ram[SYH + x] & 0x80)) return;
    var t = ram[SYL + x] + ram[WA0];
    if (t <= 0xFF && (t + 0x18) <= 0xFF) return;
    switch (ram[K9E]) {
      case 0: return enemyHit(x);
      case 1: return ringPickup(x);
      case 2: return hazard(x);
      case 3: if (ram[R.SHIELD]) return enemyHit(x); return hazard(x);
    }
  }
  // $887D
  function enemyHit(x) {
    if (ram[R.SHIELD] || ram[R.PFLAGS2] >= 4) return killEnemy(x);
    hurtBy(x);
  }
  // $888D
  function hazard(x) {
    if (ram[R.SHIELD]) return;
    if (ram[R.PFLAGS2] >= 8) return;
    hurtBy(x);
  }
  // $889C: enemigo destruido
  function killEnemy(x) {
    ram[TYPE + x] = 0x1D; ram[P + x] = 5;
    if (!(ram[R.PFLAGS] & 0x0C) && !ram[R.SHIELD]) { ram[R.VSPD] = 0x30; ram[R.PFLAGS] |= 0x0C; }
    // puntaje: 6 dígitos BCD en $0379-$037E
    for (var a = 0x37E; a >= 0x379; a--) {
      ram[a]++;
      if (ram[a] < 10) break;
      ram[a] = 0;
    }
    ram[R.SFX] = 5;
  }
  // $891F: el objeto hiere al jugador
  function hurtBy(x) {
    if (ram[R.PREV_STATE] === 9) return;
    if (ram[R.HURT]) return;
    ram[R.STATE] = 0x0A; ram[R.GSPD] = 0x30; ram[R.VSPD] = 0x30;
    ram[R.PFLAGS] = (ram[R.PFLAGS] ^ 3) | 0x0C;
    ram[R.HURT] = 3;
    var y = ram[R.PFLAGS2];
    if (y & 2) { ram[R.PFLAGS2] = y & 0xFD; return; }
    // $894E
    var n = 3;
    if (ram[R.RING_H] === 0 && ram[R.RING_T] === 0) {
      if (ram[R.RING_O] === 0) return die();
      if (ram[R.RING_O] < 3) n = ram[R.RING_O];
    }
    var s = ram[R.OBJ_N];
    for (var i = 0; i < 3; i++) {
      ram[TYPE + s + i] = i < n ? 0x16 : 0;
      ram[XL + s + i] = ram[XL + x]; ram[XH + s + i] = ram[XH + x];
      ram[YL + s + i] = ram[YL + x]; ram[YH + s + i] = ram[YH + x];
    }
    ram[P + s] = 1;
    ram[P + s + 1] = 0x91;
    ram[R.OBJ_N] = (s + n) & 0xFF;
    ram[R.RING_H] = ram[R.RING_T] = ram[R.RING_O] = 0;
    ram[R.SFX] = 4;
  }
  Obj.hurtBy = hurtBy;
  // $89FF
  function die() {
    ram[R.STATE] = 9; ram[R.VSPD] = 0x50; ram[R.GSPD] = 0;
    ram[R.PFLAGS] |= 4; ram[R.DYING] = 1; ram[R.SFX] = 5; ram[R.HURT] = 0;
  }
  Obj.die = die;
  // $8A1E: recoger un anillo que rebota
  function ringPickup(x) {
    if (ram[R.STATE] === 0x0A) return;
    ram[TYPE + x] = 0;
    ram[R.RING_O]++;                 // (el original no propaga el acarreo aquí)
    ram[R.SFX] = 2;
  }

  // Patrones de salida comunes
  function relTouch(x, w, h, k) {        // $9ECA
    if (!relPos(x)) return despawn(x);
    ram[W9F] = w; ram[WA0] = h; ram[K9E] = k;
    touch(x);
  }
  function relTouchTmp(x, w, h, k) {     // $9F2F (proyectiles: sin marca de aparición)
    if (!relPos(x)) return remove(x);
    ram[W9F] = w; ram[WA0] = h; ram[K9E] = k;
    touch(x);
  }
  function inRange(x) { return relPos(x); }   // $9F94 (Z=0 -> en rango)

  var U = {};
  // ---- $8000: tipo 01 (cangrejo caminando) ----
  U[0x01] = function (x) {
    addX(x, (ram[P + x] & 0x80) ? 2 : -2);
    if ((ram[XL + x] & 0x0F) === 0) {
      var old = ram[P + x];
      ram[P + x] = (old + 8) & 0xFF;
      if ((ram[P + x] ^ old) & 0x80) ram[P + x] &= 0xFE;
    }
    if (!relPos(x)) return despawn(x);
    var y = ram[P + x];
    if (!(y & 1)) {
      var a = (ram[SXL + x] ^ ram[SYL + x]) & 0xF0;
      if (a === 0 || a === 0xF0) { ram[TYPE + x] = 2; ram[P + x] = y | 1; }
    }
    ram[W9F] = 0x20; ram[WA0] = 0x18; ram[K9E] = 0;
    touch(x);
  };
  // ---- $80DE: tipo 02 (cangrejo disparando) ----
  U[0x02] = function (x) {
    if ((ram[R.FRAME] & 0x1F) === 0) {
      var t = (ram[P + x] + 2) & 0xFF;
      if ((t & 6) === 0) {
        ram[P + x] &= 0xF9; ram[TYPE + x] = 1;
      } else if ((t & 6) === 2) {
        var y = ram[R.OBJ_N];
        ram[P + x] = t | 4;
        {
          ram[P + y] = t & 0x80;
          var d = (t & 0x80) ? 0x14 : 4;
          var xx = ((ram[XH + x] << 8) | ram[XL + x]) + d;
          ram[XL + y] = xx & 0xFF; ram[XH + y] = (xx >> 8) & 0xFF;
          var yy = ((ram[YH + x] << 8) | ram[YL + x]) + 0x1C;
          ram[YL + y] = yy & 0xFF; ram[YH + y] = (yy >> 8) & 0xFF;
          ram[TYPE + y] = 0x1A;
          ram[R.OBJ_N] = y + 1;
        }
      }
    }
    relTouch(x, 0x20, 0x18, 0);
  };
  // ---- $81EB: tipo 03 (pez que salta) ----
  U[0x03] = function (x) {
    var p = (ram[P + x] + 2) & 0xFF;
    ram[P + x] = p;
    var v = t14(0x8246 + (p >> 4));
    if (!(p & 0x80)) {
      var a = ram[YL + x] - v;
      if (a < 0) { ram[YL + x] = (a - 0x10) & 0xFF; ram[YH + x] = (ram[YH + x] - 1) & 0xFF; }
      else ram[YL + x] = a;
    } else {
      var b = (ram[YL + x] + v) & 0xFF;
      ram[YL + x] = b;
      if (b >= 0xF0) { ram[YL + x] = (b + 0x10) & 0xFF; ram[YH + x]++; }
    }
    relTouch(x, 0x20, 0x18, 0);
  };
  // ---- $8256: tipo 1A (bala del cangrejo) ----
  U[0x1A] = function (x) {
    var p = ram[P + x];
    if (!(p & 0x80)) {
      if (p < 0x10) { ram[P + x] = p + 1; return relTouchTmp(x, 8, 8, 2); }
      addX(x, -2);
    } else {
      if (p < 0x90) { ram[P + x] = p + 1; return relTouchTmp(x, 8, 8, 2); }
      addX(x, 2);
    }
    addYraw(x, 2);
    relTouchTmp(x, 8, 8, 2);
  };
  // ---- $82BA: tipo 04 (motobug) ----
  U[0x04] = function (x) {
    var tick = true;
    if (ram[R.FRAME] & 2) {
      var p = ram[P + x];
      if (!(p & 0x80)) { if (p < 0x70) addX(x, -1); tick = false; }
      else if (p >= 0xF0) tick = false;
      else addX(x, 1);
    }
    if (tick && (ram[R.FRAME] & 7) === 0) {
      var q = ram[P + x] + 8;
      if (q > 0xFF) q = q & 0xFE;
      ram[P + x] = q & 0xFF;
    }
    if (!relPos(x)) return despawn(x);
    if (!(ram[P + x] & 1)) {
      var d = ram[SXL + x];
      var near = (ram[SXH + x] & 0x80) ? d < 0xB8 : d < 0x40;
      if (near) { ram[TYPE + x] = 5; ram[P + x] |= 1; }
    }
    ram[W9F] = 0x20; ram[WA0] = 0x18; ram[K9E] = 0;
    touch(x);
  };
  // ---- $839E: tipo 05 (disparando dos balas) ----
  U[0x05] = function (x) {
    if ((ram[R.FRAME] & 0x1F) === 0) {
      var t = (ram[P + x] + 2) & 6;
      ram[0x25] = t;
      if (t === 0) { ram[P + x] &= 0xF9; ram[TYPE + x] = 4; }
      else if (t === 2) {
        var y = ram[R.OBJ_N];
        ram[P + x] = (ram[P + x] & 0xF9) | 4;
        {
          ram[P + y] = 0x88; ram[P + y + 1] = 0x08;
          ram[XH + y] = ram[XH + x]; ram[XL + y] = ram[XL + x];
          var xx = ((ram[XH + x] << 8) | ram[XL + x]) + 0x10;
          ram[XL + y + 1] = xx & 0xFF; ram[XH + y + 1] = (xx >> 8) & 0xFF;
          ram[YL + y] = ram[YL + y + 1] = ram[YL + x];
          ram[YH + y] = ram[YH + y + 1] = ram[YH + x];
          ram[TYPE + y] = ram[TYPE + y + 1] = 0x1B;
          ram[R.OBJ_N] = y + 2;
        }
      } else ram[P + x] = (ram[P + x] & 0xF9) | t;
    }
    relTouch(x, 0x20, 0x18, 0);
  };
  // ---- $8432: tipos 1B/1C (balas en arco) ----
  // ---- $86B8: tipo 1C (bala recta) ----
  U[0x1C] = function (x) {
    addX(x, (ram[P + x] & 0x80) ? 2 : -2);
    relTouchTmp(x, 8, 8, 2);
  };
  U[0x1B] = U[0x0F] = function (x) {
    var sp = ram[TYPE + x] === 0x1B ? 1 : 2;
    addX(x, (ram[P + x] & 0x80) ? -sp : sp);
    var k = ram[P + x] & 0x1F, y = k;
    if (ram[TYPE + x] !== 0x1B) y |= 0x20;
    var v = t14(0x84D8 + y);
    if (k < 0x10) addYraw(x, -v); else addYraw(x, v);
    if (!(ram[R.FRAME] & 1)) {
      var n = k + 1; if (n >= 0x1F) n = 0x1E;
      ram[P + x] = (ram[P + x] & 0xE0) | n;
    }
    relTouchTmp(x, 8, 8, 2);
  };
  // ---- $8518: tipos 06/07 (camaleón que aparece y dispara) ----
  U[0x06] = U[0x07] = function (x) {
    if (!relPos(x)) return despawn(x);
    var p = ram[P + x] & 0x7F;
    if (p === 0) {
      if (!(ram[SXH + x] & 0x80)) { if (ram[SXL + x] < 0x90) ram[P + x] = 4; }
      else if (ram[SXL + x] >= 0x60) ram[P + x] = 0x84;
      if (ram[TYPE + x] !== 6) ram[TYPE + x] = 8;
      return;
    }
    var y = p;
    if ((ram[R.FRAME] & 0x0F) === 0) y++;
    if (y === 0x0C) {
      var q = (y + 4) & 0xFF;
      var s = ram[R.OBJ_N];
      {
        ram[P + s] = ram[P + x];
        if (!(ram[P + x] & 0x80)) {
          var xx = ((ram[XH + x] << 8) | ram[XL + x]) + 0x10;
          ram[XL + s] = xx & 0xFF; ram[XH + s] = (xx >> 8) & 0xFF;
        } else { ram[XL + s] = ram[XL + x]; ram[XH + s] = ram[XH + x]; }
        var yy = ((ram[YH + x] << 8) | ram[YL + x]) + 0x10;
        ram[YL + s] = yy & 0xFF; ram[YH + s] = (yy >> 8) & 0xFF;
        ram[TYPE + s] = 0x1C;
        ram[R.OBJ_N] = s + 1;
      }
      ram[P + x] = ((ram[SXH + x] & 0x80) ? 0x80 : 0) | q;
      return;
    }
    if (y >= 0x1C) return despawn(x);
    ram[P + x] = ((ram[SXH + x] & 0x80) ? 0x80 : 0) | y;
  };
  // ---- $8630: tipo 08 (camaleón que se lanza) ----
  U[0x08] = function (x) {
    var y = ram[P + x] & 0x7F;
    if ((ram[R.FRAME] & 7) === 0) y++;
    if (y < 0x10) {
      if (y >= 8 && !(ram[R.FRAME] & 2)) addYraw(x, 1);
      ram[P + x] = (ram[SXH + x] & 0x80) | y;
      ram[W9F] = 0x18; ram[WA0] = 0x20;
    } else {
      ram[W9F] = 0x20; ram[WA0] = 0x10;
      if (!(ram[P + x] & 0x80)) { addX(x, -2); ram[P + x] = 0x11; }
      else { addX(x, 2); ram[P + x] = 0x91; }
    }
    ram[K9E] = 0;
    if (!relPos(x)) return despawn(x);
    touch(x);
  };
  // ---- $8166: tipos 10-15 (monitores) ----
  U[0x10] = U[0x11] = U[0x12] = U[0x13] = U[0x14] = U[0x15] = function (x) {
    if (!relPos(x)) return despawn(x);
    ram[W9F] = 0x19; ram[WA0] = 0x19;
    monitor(x);
  };
  // $8A89
  function monitor(x) {
    if (!(ram[SYH + x] & 0x80)) return;
    var y = 0, d = ram[SYL + x];
    if (d < 0xF9) { if (d < 0xE8) return; y = 1; }
    ram[K9E] = y;
    if (!(ram[SXH + x] & 0x80)) { if (ram[SXL + x] >= 8) return; }
    else {
      var s = ram[SXL + x] + ram[W9F];
      if (s <= 0xFF && (s + 8) <= 0xFF) return;
    }
    if (ram[R.ANIM] === 8) {                 // rodando/saltando: se rompe
      if (ram[R.PFLAGS] & 0x0C) return boxSide(x);
      ram[R.VSPD] = 0x30; ram[R.PFLAGS] |= 0x0C; ram[R.SFX] = 5;
      var t = ram[TYPE + x];
      ram[TYPE + x] = 0;
      if (t === 0x10) {                      // +10 anillos
        var a = ram[R.RING_T] + 1;
        if (a >= 10) { ram[R.RING_H]++; a = 0; }
        ram[R.RING_T] = a;
      } else if (t === 0x12) {               // vida extra
        ram[R.LIVES]++;
        if (ram[R.LIVES] >= 10) ram[R.LIVES] = 9;
      } else if (t === 0x13) ram[0x9C] = 0x0F;
      else if (t === 0x14) { ram[R.SHIELD] = 0x0F; ram[R.MUSIC] = 0x21; }
      else if (t === 0x15) ram[R.PFLAGS2] |= 2;
      return;
    }
    if (ram[K9E] === 0) return boxTop(x);
    boxPush(x);
  }
  // $8B32
  function boxPush(x) {
    if (!(ram[SXH + x] & 0x80)) {
      if (ram[R.GSPD] && !(ram[R.PFLAGS] & 3)) { ram[R.STATE] = 0x0D; ram[R.GSPD] = 0; }
      setNX(x, -8);
    } else {
      if (ram[R.GSPD] && (ram[R.PFLAGS] & 3)) { ram[R.STATE] = 0x0D; ram[R.GSPD] = 0; }
      setNX(x, 0x20);
    }
  }
  // $8B8E
  function boxSide(x) {
    if (!(ram[SXH + x] & 0x80)) setNX(x, -8); else setNX(x, 0x20);
  }
  function setNX(x, d) {
    var v = (((ram[XH + x] << 8) | ram[XL + x]) + d) & 0xFFFF;
    ram[R.NX_LO] = v & 0xFF; ram[R.NX_HI] = v >> 8;
    var dx = (((ram[XH + x] << 8) | ram[XL + x]) - v) & 0xFFFF;
    ram[SXL + x] = dx & 0xFF; ram[SXH + x] = dx >> 8;
  }
  // $8BB7: pararse encima
  function boxTop(x) {
    ram[R.NY_LO] = ram[YL + x]; ram[R.NY_HI] = ram[YH + x];
    ram[SYH + x] = 0; ram[SYL + x] = 0; ram[R.VSPD] = 0;
    var a = ram[R.GSPD] - 2;
    ram[R.GSPD] = (a & 0x80) ? 0 : a;
  }
  // ---- $877D: tipo 16 (anillo que rebota) ----
  U[0x16] = function (x) {
    if (!(ram[R.FRAME] & 1)) {
      var p = ram[P + x];
      addX(x, (p & 0x80) ? -3 : 3);
      var y = p & 0x0F;
      var v = t14(0x8842 + y);
      if (y < 8) {
        addYraw(x, -v);
        if (solidAt(x)) p ^= 0x80;
      } else {
        addYraw(x, v);
        if (solidAt(x)) {
          p = (p + 0x10) & 0xFF;
          var k = t14(0x883A + ((p & 0x70) >> 4));
          if (k & 0x80) { ram[TYPE + x] = 0; return; }
          ram[P + x] = (p & 0xF0) | k;
          return relTouchTmp(x, 0x10, 0x10, 1);
        }
      }
      if (!(ram[R.FRAME] & 3)) {
        var n = (p & 0x0F) + 1; if (n >= 0x10) n = 0x0F;
        ram[P + x] = (p & 0xF0) | n;
      }
    }
    relTouchTmp(x, 0x10, 0x10, 1);
  };
  // $AFC5: ¿hay suelo sólido en la posición del objeto?
  function solidAt(x) {
    var yi = (ram[R.ROWS + ram[YH + x]] + ram[XH + x]) & 0xFF;
    var L = SM.Level, cid = L.layout[yi];
    var cb = (cid & 0x20) ? L.chunkB : L.chunkA;
    var m = cb[(cid & 0x1F) * 256 + ((ram[YL + x] & 0xF0) | (ram[XL + x] >> 4))];
    return SM.rom.b(0x15, 0xB173 + L.mtCol[m]);
  }
  Obj.solidAt = solidAt;
  // ---- $86F3: tipos 18/19 (animalitos liberados) ----
  U[0x18] = U[0x19] = function (x) {
    var p = ram[P + x];
    if ((p & 0x10) && solidAt(x)) p = 0x80;
    if (p & 0x80) { addX(x, -2); }
    var y = p & 0x1F;
    var v = t14(0x84D8 + y);
    if (y < 0x10) {
      var a = ram[YL + x] - v;
      if (a < 0) { ram[YL + x] = (a - 0x10) & 0xFF; ram[YH + x] = (ram[YH + x] - 1) & 0xFF; }
      else ram[YL + x] = a;
    } else {
      var b = (ram[YL + x] + v) & 0xFF;
      ram[YL + x] = b;
      if (b >= 0xF0) { ram[YL + x] = (b + 0x10) & 0xFF; ram[YH + x]++; }
    }
    if (ram[R.FRAME] & 1) y++;
    if (y >= 0x1E) y = 0x1E;
    ram[P + x] = (p & 0x80) | y;
    if (!inRange(x)) ram[TYPE + x] = 0;
  };
  // ---- $8852: tipo 1D (explosión) ----
  U[0x1D] = function (x) {
    ram[P + x] += 2;
    if (ram[P + x] >= 0x30) {
      ram[TYPE + x] = (ram[R.FRAME] & 1) ? 0x18 : 0x19;
      ram[P + x] = 0;
    }
    if (!inRange(x)) remove(x);
  };
  // ---- $8BD7: tipo 2B (plataforma móvil horizontal) ----
  U[0x2B] = function (x) {
    ram[W9F] = 0x20;
    rel9127(x);
    if (!(ram[P + x] & 0x80)) {
      addX(x, 1);
      var e = ((ram[XH + x] << 8) | ram[XL + x]) + ram[W9F];
      ram[0xA7] = e & 0xFF; ram[0xA8] = (e >> 8) & 0xFF;
      ram[0x40] = 0;
    } else {
      addX(x, -1);
      ram[0xA7] = ram[XL + x]; ram[0xA8] = ram[XH + x];
      ram[0x40] = 1;
    }
    ram[0x41] = 1; ram[0x48] = 0; ram[0x49] = 0;
    ram[0xA9] = ram[YL + x]; ram[0xAA] = ram[YH + x];
    if (solidAtA7()) ram[P + x] ^= 0x80;
    ride(x);
  };
  // $B032
  function solidAtA7() {
    var yi = (ram[R.ROWS + ram[0xAA]] + ram[0xA8]) & 0xFF;
    var L = SM.Level, cid = L.layout[yi];
    var cb = (cid & 0x20) ? L.chunkB : L.chunkA;
    var m = cb[(cid & 0x1F) * 256 + ((ram[0xA9] & 0xF0) | (ram[0xA7] >> 4))];
    return SM.rom.b(0x15, 0xB173 + L.mtCol[m]);
  }
  // $9127: posición relativa a la posición confirmada del jugador
  function rel9127(x) {
    var dx = (((ram[XH + x] << 8) | ram[XL + x]) - ((ram[R.PX_HI] << 8) | ram[R.PX_LO])) & 0xFFFF;
    ram[SXL + x] = dx & 0xFF; ram[SXH + x] = dx >> 8;
    relY(x, ram[R.PY_LO], ram[R.PY_HI]);
  }
  function relY(x, pl, ph) {
    var bl = ram[YL + x] - pl;
    ram[SYL + x] = bl & 0xFF;
    ram[SYH + x] = (ram[YH + x] - ph - (bl < 0 ? 1 : 0)) & 0xFF;
    if (ram[YH + x] !== ph) {
      var v = (ram[SYH + x] << 8) | ram[SYL + x];
      v = (ram[SYH + x] & 0x80) ? v + 0x10 : v - 0x10;
      ram[SYL + x] = v & 0xFF; ram[SYH + x] = (v >> 8) & 0xFF;
    }
  }
  // $920C: el jugador viaja sobre una plataforma
  function ride(x) {
    if (ram[R.PREV_STATE] === 9) return;
    var onTop = false;
    if (ram[SYH + x] === 0) {
      var h = ram[SXH + x];
      if (h === 0) onTop = ram[SXL + x] < 8;
      else if (h === 0xFF) { var s = ram[SXL + x] + ram[W9F]; onTop = s > 0xFF || s + 8 > 0xFF; }
      if (onTop && ram[SYL + x] === 0) {
        // mover al jugador junto con la plataforma
        if (ram[0x48]) {
          var a = (ram[0x49] + ram[R.NY_LO]) & 0xFF;
          if (ram[0x49] + ram[R.NY_LO] > 0xFF) { /* sin efecto: el original ignora el acarreo */ }
          ram[R.NY_LO] = a;
          if (a >= 0xF0) { ram[R.NY_LO] = (a + 0x10) & 0xFF; ram[R.NY_HI]++; }
        } else {
          var b = ram[R.NY_LO] - ram[0x49];
          ram[R.NY_LO] = b & 0xFF;
          if ((b & 0xFF) >= 0xF0) { ram[R.NY_LO] = ((b & 0xFF) - 0x10) & 0xFF; ram[R.NY_HI] = (ram[R.NY_HI] - 1) & 0xFF; }
        }
        var n = (ram[R.NX_HI] << 8) | ram[R.NX_LO];
        n = ram[0x40] ? n - ram[0x41] : n + ram[0x41];
        ram[R.NX_LO] = n & 0xFF; ram[R.NX_HI] = (n >> 8) & 0xFF;
      }
    }
    if (!onTop) return far9326(x);
    // $9290
    var dx = (((ram[XH + x] << 8) | ram[XL + x]) - ((ram[R.NX_HI] << 8) | ram[R.NX_LO])) & 0xFFFF;
    ram[SXL + x] = dx & 0xFF; ram[SXH + x] = dx >> 8;
    relY(x, ram[R.NY_LO], ram[R.NY_HI]);
    var hit;
    if (!(ram[SXH + x] & 0x80)) hit = ram[SXL + x] < 8;
    else { var q = ram[SXL + x] + ram[W9F]; hit = q > 0xFF || q + 8 > 0xFF; }
    if (!hit || ram[SYH + x] !== 0xFF) return;
    ram[R.NY_LO] = ram[YL + x]; ram[R.NY_HI] = ram[YH + x];
    ram[SYL + x] = 0; ram[SYH + x] = 0; ram[R.VSPD] = 0;
    var g = ram[R.GSPD] - 2;
    ram[R.GSPD] = g < 0 ? 0 : g;
  }
  // $9326
  function far9326(x) {
    var dx = (((ram[XH + x] << 8) | ram[XL + x]) - ((ram[R.NX_HI] << 8) | ram[R.NX_LO])) & 0xFFFF;
    ram[SXL + x] = dx & 0xFF; ram[SXH + x] = dx >> 8;
    var h = ram[SXH + x];
    if (!(h & 0x80) ? h >= 2 : h < 0xFE) {
      if (!Obj.extra || Math.abs(dx >= 0x8000 ? dx - 0x10000 : dx) > 512 + Obj.extra) return despawn(x);
    }
    relY(x, ram[R.NY_LO], ram[R.NY_HI]);
    var v = ram[SYH + x];
    if (!(v & 0x80) ? v >= 2 : v < 0xFE) return despawn(x);
  }
  // ---- $8C49: tipo 2E (cartel de meta) ----
  U[0x2E] = function (x) {
    if (!inRange(x)) return despawn(x);
    var p = ram[P + x];
    if (p) {
      ram[R.SFX] = 0x0A;
      ram[P + x] = p + 1;
      if (ram[P + x] >= 0xB4) {
        ram[TYPE + x] = 0x2F;
        var y = 0;
        if (ram[R.RING_H] === 0 && ram[R.RING_T] < 5) y = 0x80;
        ram[P + x] = y;
      }
      return;
    }
    var h = ram[SXH + x];
    if (h === 0) { ram[R.BND_L] = (ram[XH + x] - 2) & 0xFF; return; }
    if (h === 0xFF && ram[SXL + x] < 0xE8) { ram[P + x] = 1; ram[R.BND_L]++; }
  };
  // ---- $8CA3: tipo 2F (fin del acto) ----
  U[0x2F] = function (x) {
    if (!inRange(x)) return despawn(x);
    if (ram[0xB5] === 0) { ram[R.MUSIC] = 0x22; ram[0xB5] = 1; }
  };
  // ---- $AB36: tipo 54 (activa al jefe) ----
  U[0x54] = function (x) {
    if (!inRange(x)) return despawn(x);
    if (ram[SXH + x] === 0 && ram[SXL + x] < 0x90) {
      ram[R.BND_L] = (ram[XH + x] - 2) & 0xFF;
      ram[0xB8] = 1;
      ram[TYPE + x] = 0;
    }
  };
  Obj.U = U;

  // ---- $A029: aparición de objetos de los 8 chunks vecinos ----
  Obj.spawn = function () {
    var zone = ram[R.ZONE], act = ram[R.ACT];
    if (zone >= 5) return;
    var L = SM.Level, w = ram[R.ROWW];
    var y = (ram[R.ROWS + ram[R.PY_HI]] + ram[R.PX_HI]) & 0xFF;
    var idx = L.objIdx;
    var e = [0, 0, 0, 0, 0, 0, 0, 0], cx = [0, 0, 0, 0, 0, 0, 0, 0];
    e[3] = idx[(y - 1) & 0xFF];
    e[4] = idx[(y + 1) & 0xFF];
    var y2 = (y + 1 + w) & 0xFF;
    e[7] = idx[y2]; e[6] = idx[(y2 - 1) & 0xFF]; e[5] = idx[(y2 - 2) & 0xFF];
    var y3 = (y2 - 2 - w - w) & 0xFF;
    e[0] = idx[y3]; e[1] = idx[(y3 + 1) & 0xFF]; e[2] = idx[(y3 + 2) & 0xFF];
    var px = ram[R.PX_HI];
    cx[1] = cx[6] = px; cx[0] = cx[3] = cx[5] = (px - 1) & 0xFF; cx[2] = cx[4] = cx[7] = (px + 1) & 0xFF;
    var base = 0x9000 + act * 0x200;
    for (var k = 0; k < 8; k++) {
      var X = e[k];
      if (!X) continue;
      for (; X < 256; X++) {
        if (tZ(base + 0x80 + X) !== cx[k]) break;
        var t = tZ(base + X);
        if (!t) continue;
        if (SM.rom.b(0x15, 0xA381 + t) && Obj.onScreen(tZ(base + 0x80 + X), tZ(base + 0x40 + X), tZ(base + 0x100 + X), tZ(base + 0xC0 + X))) continue;
        var byte = SM.rom.b(0x15, 0xB273 + X), bit = SM.rom.b(0x15, 0xB2F3 + X);
        if (ram[R.OBJ_SPAWNED + byte] & bit) continue;
        ram[R.OBJ_SPAWNED + byte] |= bit;
        var s = ram[R.OBJ_N];
        ram[XH + s] = tZ(base + 0x80 + X); ram[XL + s] = tZ(base + 0x40 + X);
        ram[TYPE + s] = t;
        ram[YL + s] = tZ(base + 0xC0 + X); ram[YH + s] = tZ(base + 0x100 + X);
        ram[P + s] = tZ(base + 0x140 + X);
        ram[SRC + s] = X;
        ram[R.OBJ_N] = ++s;
        if (s >= 0x17) return;
      }
    }
  };
  // Condición del original: el objeto está en la misma "pantalla" que la cámara
  Obj.onScreen = function (xh, xl, yh, yl) {
    var dx = ((xh << 8) | xl) - ((ram[R.CAM_XH] << 8) | ram[R.CAM_XL]);
    var dyh = (yh - ram[R.CAM_YH] - (yl < ram[R.CAM_YL] ? 1 : 0)) & 0xFF;
    if (dyh !== 0) return false;
    if (!Obj.extra) return (dx >> 8) === 0;
    return dx >= -Obj.extra && dx < 256 + Obj.extra;
  };

  // ---- $A27C: actualizar objetos ----
  Obj.update = function () {
    Obj.spawn();
    for (var x = 0; x < ram[R.OBJ_N]; x++) {
      ram[R.OBJ_I] = x;
      var t = ram[TYPE + x];
      if (!t) break;
      var f = U[t];
      if (f) f(x); else if (!Obj.warned[t]) { Obj.warned[t] = 1; console.warn('objeto sin portar', t.toString(16)); }
    }
    if (ram[R.WATER] >= 0x3C && ram[R.STATE] !== 9) die();
    if (ram[0xB6]) SM.Ending.capsuleSequence();
    Obj.compact();
  };
  Obj.warned = {};
  // $A3ED
  Obj.compact = function () {
    var n = ram[R.OBJ_N], x = 0;
    while (x < n && ram[TYPE + x]) x++;
    if (x >= n) return;
    for (var y = x + 1; y < n; y++) {
      if (!ram[TYPE + y]) continue;
      var arrs = [XL, XH, YL, YH, SXL, SXH, SYL, SYH, TYPE, P, SRC];
      for (var i = 0; i < arrs.length; i++) ram[arrs[i] + x] = ram[arrs[i] + y];
      ram[TYPE + y] = 0;
      x++;
    }
    ram[R.OBJ_N] = x;
  };
})();
