// Jugador (Somari): port de la lógica del banco $1D del ROM.
//   estado/controles ($A190/$A2EF), gravedad ($A2C4), movimiento ($AAEE),
//   colisión con el escenario ($AC82 -> collision.js), animación ($A1D0/$A785) y
//   armado del metasprite ($A7B2/$A840).
// Las constantes numéricas (velocidades, tablas) son las del juego original; las tablas
// se leen directamente del ROM.
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R;
  function t1D(a) { return SM.rom.b(0x1D, a); }      // tablas del banco $1D ($A000-$BFFF)
  function t1C(a) { return SM.rom.b(0x1C, a); }      // tablas del banco $1C ($8000-$9FFF)
  // Lectura con los bancos que están mapeados mientras corre este código.
  function cpu(a) {
    a &= 0xFFFF;
    if (a < 0x800) return ram[a];
    if (a >= 0x8000 && a < 0xA000) return SM.rom.b(0x1C, a);
    if (a >= 0xA000 && a < 0xC000) return SM.rom.b(0x1D, a);
    if (a >= 0xC000 && a < 0xE000) return SM.rom.b(0x1E, a);
    if (a >= 0xE000) return SM.rom.b(0x1F, a);
    return 0;
  }
  var DIRF = function (x) { return t1D(0xAAEA + x); };   // bits de dirección por botón
  function joy() { return ram[R.JOY]; }
  function joyp() { return ram[R.JOYP]; }

  var P = SM.Player = {};

  // ---- $A190: lógica por cuadro (antes de mover la cámara) ----
  P.update = function () {
    if (SM.Tails && SM.Tails.update()) return;   // Tails volando (no es del original)
    if (!(ram[R.STATE] & 0x80)) {
      stateLogic();
      if (ram[0xAF]) {                           // se acabó el tiempo
        if (ram[R.PREV_STATE] !== 9) {
          ram[R.STATE] = 9; ram[R.VSPD] = 0x50; ram[R.GSPD] = 0;
          ram[R.PFLAGS] |= 4; ram[R.DYING] = 1; ram[R.SFX] = 5; ram[R.HURT] = 0;
        }
      }
      if (!(ram[R.WATER] && !(ram[R.FRAME] & 1))) gravity();
    }
    SM.Player.move();
  };

  // ---- $A2EF ----
  function stateLogic() {
    var y = ram[R.PREV_STATE];
    if (y !== 0) ram[R.IDLE] = 0;
    else if (ram[R.SEC_CNT] === 0) {
      ram[R.IDLE]++;
      if (ram[R.IDLE] > 0x10) ram[R.IDLE] = 0x10;
    }
    switch (y) {
      case 0x07: ram[R.SFX] = 1; return skid();
      case 0x06: return st06();
      case 0x08: return air();
      case 0x20: return rolling();
      case 0x0A: return hurt();
      case 0x2B: return st2B();
      case 0x09: return dying();
      case 0x2C: return st2C();
    }
    if (ram[R.GSPD] === 0) return standing();
    return moving();
  }

  // $A396
  function moving() {
    if (joyp() >= 0x10) return jump();
    if (joyp() & 4) { ram[R.STATE] = 0x20; return; }
    if (joy() & 3) return holdDir();
    ram[R.STATE] = ram[R.PREV_STATE];
  }
  // $A3BB
  function jump() {
    var loop = ram[R.LOOP];
    if (loop === 0x14) {                          // $A3F8
      ram[R.STATE] = 8; ram[R.GSPD] = 0x30;
      if (!(ram[R.ANGLE] & 0x40)) ram[R.PFLAGS] |= 1; else ram[R.PFLAGS] &= 0xFC;
      ram[R.PFLAGS] &= 0xF3; ram[R.LOCK] = 0x32; ram[R.SFX] = 3;
      return;
    }
    if (loop >= 0x19 && (ram[R.ANGLE] & 0x80)) {  // $A3E5
      ram[R.STATE] = 8; ram[R.VSPD] = 0x20; ram[R.PFLAGS] &= 0xF3; ram[R.SFX] = 3;
      return;
    }
    if (ram[R.VSPD] < 4) {
      ram[R.STATE] = 8; ram[R.VSPD] = 0x44; ram[R.PFLAGS] |= 4; ram[R.SFX] = 3;
    }
  }
  // $A424
  function holdDir() {
    var loop = ram[R.LOOP];
    if (loop === 0x14) {
      var a = ram[R.ANGLE], j = joy(), f = ram[R.PFLAGS];
      if (a === 0) {            // $A492
        if (j & 1) { if (f & 4) ram[R.VSPD] += 2; }
        else if ((j & 2) && (f & 4)) { ram[R.PFLAGS] = f & 0xFC; ram[R.VSPD] = 0x10; }
      } else if (a === 0x80) {  // $A4BC
        if (j & 2) { ram[R.PFLAGS] = f & 0xF3; ram[R.VSPD] += 2; }
      } else if (a === 0x40) {  // $A4CE
        if (j & 2) { if (f & 4) ram[R.VSPD] += 2; }
        else if ((j & 1) && (f & 4)) { ram[R.PFLAGS] = f & 0xFC; ram[R.VSPD] = 0x10; }
      } else if (a === 0xC0) {  // $A4F8
        if (j & 1) { ram[R.PFLAGS] = f & 0xF3; ram[R.VSPD] += 2; }
      }
      return;
    }
    if (loop >= 0x19 && (ram[R.ANGLE] & 0x80)) return;
    var x = joy() & 3;                             // $A452
    if (((ram[R.PFLAGS] & 0x43) ^ DIRF(x)) === 0) {
      ram[R.GSPD] += 4;
      if (ram[R.GSPD] > 0xF8) ram[R.GSPD] = 0xF8;
      return;
    }
    if (ram[R.LOCK]) return;
    if (ram[R.GSPD] > 0x30) { ram[R.GSPD] = 0x30; ram[R.STATE] = 7; return; }
    ram[R.PFLAGS] = (ram[R.PFLAGS] & 0xBC) | DIRF(x);
    ram[R.STATE] = 1;
  }
  // $A54F
  function standing() {
    if (ram[R.PREV_STATE] === 0x1F) {             // $A5D9: soltar el spindash
      if (joy() & 4) { ram[R.STATE] = 0x1F; return; }
      ram[R.STATE] = 0x20; ram[R.GSPD] = 0xF0; return;
    }
    if (joyp() & 0xC0) {                           // $A586
      if (ram[R.PREV_STATE] === 0x0B) {
        ram[R.SFX] = 8; ram[R.STATE] = 0x1F;
        if (ram[R.PFLAGS] & 0x40) ram[R.PFLAGS] |= 1; else ram[R.PFLAGS] &= 0xFE;
        return;
      }
      if (ram[R.VSPD] < 4) {
        ram[R.STATE] = 8; ram[R.VSPD] = 0x44; ram[R.PFLAGS] |= 4; ram[R.SFX] = 3;
      }
      return;
    }
    var y = joy();
    if (y & 3) {                                   // $A5C1
      var x = y & 3;
      ram[R.PFLAGS] = (ram[R.PFLAGS] & 0xBC) | DIRF(x);
      ram[R.STATE] = 1; ram[R.GSPD] = 4; return;
    }
    if (y & 0x84) { ram[R.STATE] = 0x0B; return; }
    if (y & 0x08) { ram[R.STATE] = 0x0C; return; }
    ram[R.STATE] = 0;
  }
  // $A5EE: derrape
  function skid() {
    if (ram[R.FRAME] & 3) return;
    var x = joy() & 3;
    if (x !== 0 && x !== 3) {
      if (((ram[R.PFLAGS] & 0x43) ^ DIRF(x)) === 0) { ram[R.STATE] = 1; ram[R.GSPD] = 2; return; }
      ram[R.GSPD] -= 4;
    }
    ram[R.GSPD]--;
    if (!(ram[R.GSPD] & 0x80)) { ram[R.PREV_STATE] = 7; return; }
    ram[R.PFLAGS] = (ram[R.PFLAGS] & 0xBC) | DIRF(x);
    ram[R.STATE] = 1; ram[R.GSPD] = 1;
  }
  // $A634
  function st06() {
    if (!(ram[R.PFLAGS] & 4)) { ram[R.GSPD] = 0x10; ram[R.STATE] = 1; return; }
    ram[R.STATE] = 6;
    if (ram[R.GSPD] >= 5) {
      if (!(ram[R.PFLAGS] & 3)) ram[R.PFLAGS] &= 0xBF; else ram[R.PFLAGS] |= 0x40;
      return;
    }
    if (joy() & 3) {
      var x = joy() & 3;
      ram[R.PFLAGS] = (ram[R.PFLAGS] & 0xBC) | DIRF(x);
      ram[R.GSPD] = 1;
    }
  }
  // $A677: en el aire
  function air() {
    if ((ram[R.PFLAGS] & 4) || ram[R.VSPD] !== 0) {
      ram[R.STATE] = 8; ram[R.PFLAGS2] |= 4;
    } else {
      ram[R.PFLAGS2] &= 0xFB;
      ram[R.STATE] = ram[R.GSPD] ? 1 : 0;
    }
    if (!(joy() & 3)) return;
    var x = joy() & 3;
    if (((ram[R.PFLAGS] ^ DIRF(x)) & 0x43) === 0) {
      var a = (ram[R.GSPD] + 2) & 0xFF;
      if (a >= 0xF8) a = 0xF7;
      ram[R.GSPD] = a;
      return;
    }
    ram[R.PFLAGS] = (ram[R.PFLAGS] & 0x3C) | DIRF(x);
    ram[R.GSPD] = 0;
  }
  // $A6CB
  function hurt() {
    if ((ram[R.PFLAGS] & 0x0C) || ram[R.VSPD] !== 0) { ram[R.STATE] = 0x0A; return; }
    ram[R.GSPD] = 0; ram[R.STATE] = 0;
  }
  // $A6E1
  function st2B() {
    if (ram[R.VSPD] >= 4) ram[R.STATE] = 1; else ram[R.STATE] = 0x2B;
    if (joyp() >= 0x10) jump();
  }
  // $A6FD: rodando
  function rolling() {
    if (ram[R.GSPD] === 0) { ram[R.STATE] = 0; ram[R.PFLAGS2] &= 0xFB; return; }
    ram[R.STATE] = 0x20; ram[R.PFLAGS2] |= 4; ram[R.GSPD]++;
  }
  // $A719: muriendo
  function dying() {
    ram[R.PFLAGS2] = 0; ram[R.STATE] = 9;
    if (ram[R.PFLAGS] & 4) return;
    if (ram[R.PSCR_YH] !== 1) return;
    ram[R.WATER] = 0;
    ram[R.NX_HI] = ram[R.CAM_XH]; ram[R.NX_LO] = ram[R.CAM_XL];
    ram[R.NY_HI] = ram[R.CAM_YH]; ram[R.NY_LO] = ram[R.CAM_YL];
    ram[R.VSPD] = 0; ram[R.GSPD] = 0;
    if (ram[0xB0]) return;
    ram[0xB0] = 1;
    for (var y = 0; y < 0x17; y++) ram[SM.O.TYPE + y] = 0;
  }
  // $A75C
  function st2C() {
    if (ram[0xEA]) { ram[0xEA]--; ram[R.GSPD] = 0; ram[R.VSPD] = 0; ram[R.STATE] = 0x2C; return; }
    ram[R.STATE] = 0;
  }
  // ---- $A2C4: gravedad ----
  function gravity() {
    if (ram[R.PFLAGS] & 4) {
      var a = (ram[R.VSPD] - 2) & 0xFF;
      if (a === 0 || a >= 0xF8) { ram[R.PFLAGS] &= 0x73; a = 8; }
      ram[R.VSPD] = a;
      return;
    }
    ram[R.VSPD] += 2;
    if (ram[R.VSPD] >= 0xF8) ram[R.VSPD] = 0xF8;
  }

  // ---- $AAEE: movimiento + colisión ----
  P.move = function () {
    if (ram[R.STATE] & 0x80) return;
    var y = ram[R.GSPD] >> 4, d;
    d = ram[R.GSPD] ? t1D(0xAC52 + y) : 0;
    if (ram[R.WATER]) d = ram[R.GSPD] ? t1D(0xAC42 + y) : 0;
    var x16 = (ram[R.PX_HI] << 8) | ram[R.PX_LO];
    if (d) x16 = (ram[R.PFLAGS] & 1) ? x16 - d : x16 + d;
    ram[R.NX_HI] = (x16 >> 8) & 0xFF; ram[R.NX_LO] = x16 & 0xFF;
    var dy = t1D(0xAC62 + (ram[R.VSPD] >> 4));
    if (ram[R.WATER] && !(ram[R.FRAME] & 1)) dy = 0;
    if (dy === 0) {
      ram[R.NY_HI] = ram[R.PY_HI]; ram[R.NY_LO] = ram[R.PY_LO];
    } else if (ram[R.PFLAGS] & 4) {
      var lo = ram[R.PY_LO] - dy, hi = ram[R.PY_HI];
      if (lo < 0) { lo += 256; hi = (hi - 1) & 0xFF; }
      if (lo >= 0xF0) lo -= 0x10;
      ram[R.NY_LO] = lo; ram[R.NY_HI] = hi;
    } else {
      var lo2 = ram[R.PY_LO] + dy, hi2 = ram[R.PY_HI];
      if (lo2 > 0xFF) { lo2 -= 256; hi2 = (hi2 + 1) & 0xFF; }
      if (lo2 >= 0xF0) { lo2 = (lo2 + 0x10) & 0xFF; hi2 = (hi2 + 1) & 0xFF; }
      ram[R.NY_LO] = lo2; ram[R.NY_HI] = hi2;
    }
    if (ram[R.STATE] !== 9) SM.Collision.player();
    clampStep();
  };

  // Como P.move, pero con el desplazamiento vertical dado en píxeles (negativo = arriba).
  // Lo usa el vuelo de Tails, que no sigue la tabla de velocidades de $AC62.
  P.moveBy = function (dy) {
    var y = ram[R.GSPD] >> 4, d = ram[R.GSPD] ? t1D((ram[R.WATER] ? 0xAC42 : 0xAC52) + y) : 0;
    var x16 = (ram[R.PX_HI] << 8) | ram[R.PX_LO];
    if (d) x16 = (ram[R.PFLAGS] & 1) ? x16 - d : x16 + d;
    ram[R.NX_HI] = (x16 >> 8) & 0xFF; ram[R.NX_LO] = x16 & 0xFF;
    var lo = ram[R.PY_LO], hi = ram[R.PY_HI];
    if (dy < 0) {
      lo += dy;
      if (lo < 0) { lo += 256; hi = (hi - 1) & 0xFF; }
      if (lo >= 0xF0) lo -= 0x10;
    } else if (dy > 0) {
      lo += dy;
      if (lo > 0xFF) { lo -= 256; hi = (hi + 1) & 0xFF; }
      if (lo >= 0xF0) { lo = (lo + 0x10) & 0xFF; hi = (hi + 1) & 0xFF; }
    }
    ram[R.NY_LO] = lo; ram[R.NY_HI] = hi;
    SM.Collision.player();
    clampStep();
  };

  // $ABB3: el desplazamiento por cuadro se limita a 7 px en cada eje
  function clampStep() {
    var dx = (((ram[R.NX_HI] << 8) | ram[R.NX_LO]) - ((ram[R.PX_HI] << 8) | ram[R.PX_LO])) & 0xFFFF;
    var neg = dx & 0x8000, lo = dx & 0xFF, x16;
    if (neg) {
      if ((((lo ^ 0xFF) + 1) & 0xFF) >= 7) {
        x16 = (((ram[R.PX_HI] << 8) | ram[R.PX_LO]) - 7) & 0xFFFF;
        ram[R.NX_HI] = x16 >> 8; ram[R.NX_LO] = x16 & 0xFF;
      }
    } else if (lo >= 7) {
      x16 = (((ram[R.PX_HI] << 8) | ram[R.PX_LO]) + 7) & 0xFFFF;
      ram[R.NX_HI] = x16 >> 8; ram[R.NX_LO] = x16 & 0xFF;
    }
    // eje Y (páginas de 240)
    var dlo = (ram[R.NY_LO] - ram[R.PY_LO]) & 0xFF;
    var borrow = ram[R.NY_LO] < ram[R.PY_LO] ? 1 : 0;
    var dhi = (ram[R.NY_HI] - ram[R.PY_HI] - borrow) & 0xFF;
    var l, h;
    if (dhi & 0x80) {
      if ((((dlo ^ 0xFF) + 1) & 0xFF) >= 7) {
        l = ram[R.PY_LO] - 7; h = ram[R.PY_HI];
        if (l < 0) { l += 256; h = (h - 1) & 0xFF; }
        if (l >= 0xF0) l -= 0x10;
        ram[R.NY_LO] = l; ram[R.NY_HI] = h;
      }
    } else if (dlo >= 7) {
      l = ram[R.PY_LO] + 7; h = ram[R.PY_HI];
      if (l > 0xFF) { l -= 256; h = (h + 1) & 0xFF; }
      if (l >= 0xF0) { l = (l + 0x10) & 0xFF; h = (h + 1) & 0xFF; }
      ram[R.NY_LO] = l; ram[R.NY_HI] = h;
    }
  }

  // ---- $A1D0: animación y dibujo (después de la cámara) ----
  P.animate = function () {
    P.bodyFrom = ram[0x3C] >> 2;
    var st = ram[R.STATE];
    if (st & 0x80) return;
    if (st !== 8 && st !== 0x20) ram[R.PFLAGS2] &= 0xFB;
    var a;
    if (st !== ram[R.PREV_STATE]) {
      if (st === 1) {
        var x = ram[R.GSPD] >> 4;
        a = ram[R.WATER] ? t1D(0xA50A + x) : (t1D(0xA51A + x) + ram[R.LOOP]) & 0xFF;
      } else a = st;
      ram[R.ANIM] = a; ram[R.ANIM_FRAME] = 0; loadFrame();
    } else {
      var y = null;
      if (st === 0) {
        if (ram[R.GSPD] !== 0) { ram[R.STATE] = 1; st = 1; }
        else {
          a = t1D(0xA54A + ((ram[R.IDLE] >> 2) & 7));
          if (a !== ram[R.ANIM]) { ram[R.ANIM] = a; ram[R.ANIM_FRAME] = 0; loadFrame(); }
          st = -1;
        }
      }
      if (st === 1) {
        var x2 = ram[R.GSPD] >> 4;
        y = ram[R.WATER] ? t1D(0xA50A + x2) : (t1D(0xA51A + x2) + ram[R.LOOP]) & 0xFF;
      } else if (st !== -1) y = st;
      if (y !== null && y !== ram[R.ANIM]) { ram[R.ANIM] = y; loadFrame(); }
    }
    ram[R.PREV_STATE] = ram[R.STATE];
    // $A772
    if (ram[R.ANIM_TIMER] & 0x80) { ram[R.ANIM_FRAME]++; loadFrame(); }
    else if (!(ram[R.WATER] && !(ram[R.FRAME] & 1))) ram[R.ANIM_TIMER]--;
    setupSprite();
    if (ram[R.SHIELD]) P.drawShield();
    if (ram[R.PFLAGS2] & 2) P.drawStars();
    P.bodyFrom = ram[0x3C] >> 2;               // primera entrada del cuerpo (para Tails)
    if (ram[R.HURT] && !(ram[R.FRAME] & 4)) return;
    drawSprite();
  };

  // $A785
  function loadFrame() {
    for (var guard = 0; guard < 64; guard++) {
      var y = (ram[R.ANIM_FRAME] << 2) & 0xFF;
      var ai = (ram[R.ANIM] << 1) & 0xFF;
      var p = t1C(0x802D + ai) | (t1C(0x802E + ai) << 8);
      ram[R.AFP_LO] = cpu(p + y);
      ram[R.AFP_HI] = cpu(p + y + 1);
      var a = cpu(p + y + 2);
      if (a & 0x80) { ram[R.ANIM_FRAME] = a & 0x7F; continue; }
      ram[R.ANIM_TIMER] = a;
      return;
    }
  }
  P.loadFrame = loadFrame;
  // $C400-$C406: primer dibujo del jugador al empezar el acto
  P.drawInitial = function () { loadFrame(); setupSprite(); drawSprite(); };

  // $A7B2: calcula posición, tiles y banco de CHR del cuadro actual
  var frameData = 0, attrTable = 0;
  function setupSprite() {
    if (joyp() & 0x20) ram[R.PSCR_Y] += 7;
    var x = ram[R.ANIM];
    var a = (ram[R.LOOP] ? ram[R.ANGLE] : ram[R.PFLAGS]) & t1C(0x8000 + x);
    ram[0x23] = a;
    var y = ((a & 0x80) ? 4 : 0) | ((a & 0x40) ? 2 : 0);
    var fp = (ram[R.AFP_HI] << 8) | ram[R.AFP_LO];
    frameData = cpu(fp + y) | (cpu(fp + y + 1) << 8);
    ram[0x3A] = cpu(frameData);
    ram[0x3B] = cpu(frameData + 1);
    var xb = (cpu(frameData + 2) << 1) & 0xFF;
    ram[R.CHR0] = xb;
    if (xb === 0x44) xb = 0x10;
    attrTable = t1C(0x84B3 + xb) | (t1C(0x84B4 + xb) << 8);
    ram[0x24] = 0;
    var ox = cpu(frameData + 3), oy = cpu(frameData + 4);
    // posición en pantalla de 16 bits ($1F/$20, $21/$22)
    var sx = (ram[R.PSCR_XH] << 8 | ram[R.PSCR_X]) + (ox < 128 ? ox : ox - 256);
    var sy = (ram[R.PSCR_YH] << 8 | ram[R.PSCR_Y]) + (oy < 128 ? oy : oy - 256);
    ram[R.SPR_X] = sx & 0xFF; ram[R.SPR_XH] = (sx >> 8) & 0xFF;
    ram[R.SPR_Y] = sy & 0xFF; ram[R.SPR_YH] = (sy >> 8) & 0xFF;
  }

  // $A840: emite los sprites del metasprite. Las coordenadas se mantienen en 16 bits
  // (la vista puede ser más ancha que 256 px).
  function drawSprite() {
    var cols = ram[0x3A], rows = ram[0x3B];
    var sx = s16(ram[R.SPR_XH], ram[R.SPR_X]), sy = s16(ram[R.SPR_YH], ram[R.SPR_Y]);
    var i = 5;
    for (var r = 0; r < rows; r++) {
      var yy = sy + r * 8;
      if (yy < 0 || yy >= 0xFF) { i += cols; continue; }   // ($FF = marca de fuera de pantalla)
      for (var c = 0; c < cols; c++, i++) {
        var t = cpu(frameData + i);
        if (t === 0xFF) continue;
        var at = cpu(attrTable + t) | ram[0x23];
        if (!SM.Spr.visX(sx + c * 8) || sx + c * 8 === 0xFF) continue;
        SM.Spr.push(sx + c * 8, yy, (t | ram[0x24]) & 0xFF, at);
      }
    }
  }
  function s16(hi, lo) { var v = (hi << 8) | lo; return v >= 0x8000 ? v - 0x10000 : v; }

  // $A8FF: escudo
  P.drawShield = function () {
    var y = ram[R.FRAME] & 0x0F;
    var bx = s16(ram[R.PSCR_XH], ram[R.PSCR_X]), by = s16(ram[R.PSCR_YH], ram[R.PSCR_Y]) - 0x10;
    function sb(v) { return v < 128 ? v : v - 256; }
    SM.Spr.push(bx + sb(t1D(0xAABA + y)), by + sb(t1D(0xAACA + y)), 0x70, 1);
    y ^= 8;
    SM.Spr.push(bx + sb(t1D(0xAABA + y)), by + sb(t1D(0xAACA + y)), 0x70, 1);
    y = (y >> 1) & 7;
    SM.Spr.push(bx + sb(t1D(0xAADA + y)), by + sb(t1D(0xAAE2 + y)), 0x71, 1);
    y ^= 4;
    SM.Spr.push(bx + sb(t1D(0xAADA + y)), by + sb(t1D(0xAAE2 + y)), 0x71, 1);
  };
  // $A9A5: estrellas de invencibilidad
  P.drawStars = function () {
    var f = ram[R.FRAME];
    if (f & 8) return;
    var y = (f << 1) & 0x0C;
    var tiles = [t1D(0xAA14 + y), t1D(0xAA15 + y), t1D(0xAA16 + y), t1D(0xAA17 + y)];
    var k = (y >> 2) & 3;
    var ox = t1D(0xAA24 + k), at = t1D(0xAA28 + k);
    var x = s16(ram[R.PSCR_XH], ram[R.PSCR_X]) + (ox < 128 ? ox : ox - 256);
    var y0 = s16(ram[R.PSCR_YH], ram[R.PSCR_Y]);
    SM.Spr.push(x, y0 - 0x20, tiles[0], at);
    SM.Spr.push(x, y0 - 0x18, tiles[1], at);
    SM.Spr.push(x, y0 - 0x10, tiles[2], at);
    SM.Spr.push(x, y0 - 0x08, tiles[3], at);
  };
})();
