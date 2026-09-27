// Cámara: port de la rutina $A067 del banco $19 (zona muerta, límites, caída al vacío),
// más la recolección de anillos por el centro del jugador ($AEE8) y el cambio de banco de
// CHR del fondo según la posición (Green Hill, $A0B3).
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R;
  function t19(a) { return SM.rom.b(0x19, a); }
  var C = SM.Camera = {};

  C.update = function () {
    if (!(ram[R.WATER] && !(ram[R.FRAME] & 1))) {
      if (ram[R.DYING] === 0) follow(); else frozen();
      vDelta(); hDelta(); vApply(); hApply();
      ram[R.PX_HI] = ram[R.NX_HI]; ram[R.PX_LO] = ram[R.NX_LO];
      ram[R.PY_HI] = ram[R.NY_HI]; ram[R.PY_LO] = ram[R.NY_LO];
      ram[R.CAM_XH] = ram[R.NCAM_XH]; ram[R.CAM_XL] = ram[R.NCAM_XL];
      ram[R.CAM_YH] = ram[R.NCAM_YH]; ram[R.CAM_YL] = ram[R.NCAM_YL];
    }
    if (ram[R.PREV_STATE] !== 9) ringPickup();
    if (ram[R.ZONE] === 0 && ram[0xB6] === 0) {
      ram[R.CHR4] = t19(0xA0D0 + ((t19(0xA0CD + ram[R.ACT]) + ram[R.NCAM_XH]) & 0xFF));
    }
  };

  function neg(v) { return ((v ^ 0xFF) + 1) & 0xFF; }

  // $ACD8
  function follow() {
    ram[R.PSCR_XH] = 0;
    var d = ram[R.NX_LO] - ram[R.CAM_XL];
    var lo = d & 0xFF;
    var hi = (ram[R.NX_HI] - ram[R.CAM_XH] - (d < 0 ? 1 : 0)) & 0xFF;
    if (hi & 0x80) lo = neg(lo);
    var v;
    if (lo < 0x60) {
      ram[R.PSCR_X] = 0x60;
      v = ram[R.NX_LO] - 0x60;
      ram[R.NCAM_XL] = v & 0xFF;
      ram[R.NCAM_XH] = (ram[R.NX_HI] - (v < 0 ? 1 : 0)) & 0xFF;
      if (ram[R.NCAM_XH] & 0x80) ram[R.NCAM_XL] = neg(ram[R.NCAM_XL]);
      if (ram[R.BND_L] === ram[R.NCAM_XH]) {
        ram[R.NCAM_XH] = (ram[R.BND_L] + 1) & 0xFF;
        ram[R.NCAM_XL] = 0;
        ram[R.PSCR_X] = ram[R.NX_LO];
        if (ram[R.PSCR_X] < 0x10) {
          ram[R.NX_LO] = 0x10; ram[R.PSCR_X] = 0x10;
          ram[R.NX_HI] = (ram[R.BND_L] + 1) & 0xFF;
          ram[R.GSPD] = 0;
        }
      }
    } else if (lo >= 0x90) {
      ram[R.PSCR_X] = 0x90;
      v = ram[R.NX_LO] - 0x90;
      ram[R.NCAM_XL] = v & 0xFF;
      ram[R.NCAM_XH] = (ram[R.NX_HI] - (v < 0 ? 1 : 0)) & 0xFF;
      if (ram[R.NCAM_XH] & 0x80) ram[R.NCAM_XL] = neg(ram[R.NCAM_XL]);
      if (ram[R.BND_R] === ram[R.NCAM_XH]) {
        ram[R.NCAM_XL] = 0;
        ram[R.PSCR_X] = ram[R.NX_LO];
        if (ram[R.PSCR_X] >= 0xF0) {
          ram[R.NX_LO] = 0xF0; ram[R.PSCR_X] = 0xF0; ram[R.GSPD] = 0;
        }
      }
    } else {
      ram[R.PSCR_X] = lo;
      ram[R.NCAM_XH] = ram[R.CAM_XH]; ram[R.NCAM_XL] = ram[R.CAM_XL];
    }
    // $AD92: vertical
    var e = ram[R.NY_LO] - ram[R.CAM_YL];
    var b = e & 0xFF;
    var eh = (ram[R.NY_HI] - ram[R.CAM_YH] - (e < 0 ? 1 : 0)) & 0xFF;
    if (eh & 0x80) b = neg(b);
    if (ram[R.NY_HI] !== ram[R.CAM_YH]) b = (b - 0x10) & 0xFF;
    if (b < 0x70) {
      ram[R.PSCR_Y] = 0x70;
      v = ram[R.NY_LO] - 0x70;
      ram[R.NCAM_YL] = v & 0xFF;
      ram[R.NCAM_YH] = (ram[R.NY_HI] - (v < 0 ? 1 : 0)) & 0xFF;
      if (ram[R.NCAM_YH] & 0x80) ram[R.NCAM_YL] = neg(ram[R.NCAM_YL]);
      if (ram[R.BND_T] === ram[R.NCAM_YH]) {
        ram[R.NCAM_YH] = 0; ram[R.NCAM_YL] = 0;
        ram[R.PSCR_Y] = ram[R.NY_LO];
      }
      fixCamY();
    } else if (b >= 0xA0) {
      ram[R.PSCR_Y] = 0xA0;
      v = ram[R.NY_LO] - 0xA0;
      ram[R.NCAM_YL] = v & 0xFF;
      ram[R.NCAM_YH] = (ram[R.NY_HI] - (v < 0 ? 1 : 0)) & 0xFF;
      if (ram[R.NCAM_YH] & 0x80) { ram[R.NCAM_YL] = neg(ram[R.NCAM_YL]); ram[R.NCAM_YH] = neg(ram[R.NCAM_YH]); }
      if (ram[R.BND_B] === ram[R.NCAM_YH]) {
        ram[R.NCAM_YL] = 0;
        ram[R.PSCR_Y] = ram[R.NY_LO];
        ram[R.PSCR_YH] = (ram[R.NY_HI] - ram[R.NCAM_YH]) & 0xFF;
        if (ram[R.PSCR_YH] !== 0 || ram[R.PSCR_Y] >= 0xF0) { fell(); return; }
      }
      fixCamY();
    } else {
      ram[R.PSCR_Y] = b;
      ram[R.NCAM_YH] = ram[R.CAM_YH]; ram[R.NCAM_YL] = ram[R.CAM_YL];
    }
  }
  function fixCamY() {   // $AE50
    if (ram[R.NCAM_YH] !== ram[R.NY_HI]) ram[R.NCAM_YL] = (ram[R.NCAM_YL] - 0x10) & 0xFF;
  }
  // $AE5E: cámara fija (muerte / fin de acto)
  function frozen() {
    var d = ram[R.NX_LO] - ram[R.NCAM_XL];
    ram[R.PSCR_X] = d & 0xFF;
    ram[R.PSCR_XH] = (ram[R.NX_HI] - ram[R.NCAM_XH] - (d < 0 ? 1 : 0)) & 0xFF;
    if (ram[R.PSCR_XH] === 0) {
      var clamp = -1;
      if (ram[R.PSCR_X] < 0x10) clamp = 0x10;
      else if (ram[0xB7] && ram[R.PSCR_X] >= 0xF0) clamp = 0xF0;
      if (clamp >= 0) {
        ram[R.PSCR_X] = clamp;
        var s = ram[R.NCAM_XL] + clamp;
        ram[R.NX_LO] = s & 0xFF;
        ram[R.NX_HI] = (ram[R.NCAM_XH] + (s > 0xFF ? 1 : 0)) & 0xFF;
        ram[R.GSPD] = 0;
      }
    }
    var e = ram[R.NY_LO] - ram[R.NCAM_YL];
    ram[R.PSCR_Y] = e & 0xFF;
    ram[R.PSCR_YH] = (ram[R.NY_HI] - ram[R.NCAM_YH] - (e < 0 ? 1 : 0)) & 0xFF;
    if (ram[R.NY_HI] !== ram[R.NCAM_YH]) {
      var f = ram[R.PSCR_Y] - 0x10;
      ram[R.PSCR_Y] = f & 0xFF;
      ram[R.PSCR_YH] = (ram[R.PSCR_YH] - (f < 0 ? 1 : 0)) & 0xFF;
    }
    if (ram[R.PSCR_YH] === 1) fell();
  }
  // $AEC3: cayó fuera de la pantalla
  function fell() {
    if (ram[R.PREV_STATE] === 9) return;
    ram[R.STATE] = 9; ram[R.VSPD] = 0x50; ram[R.GSPD] = 0; ram[R.PFLAGS] |= 4;
    ram[R.DYING] = 1; ram[R.SFX] = 5; ram[R.HURT] = 0; ram[R.SHIELD] = 0;
  }
  // $ABD7 / $AB0C: diferencias de scroll ($0347/$0348)
  function hDelta() {
    var d = ram[R.NCAM_XL] - ram[R.CAM_XL];
    var lo = d & 0xFF, hi = (ram[R.NCAM_XH] - ram[R.CAM_XH] - (d < 0 ? 1 : 0)) & 0xFF;
    ram[0x347] = (hi & 0x80) ? (neg(lo) | 0x80) : lo;
  }
  function vDelta() {
    var d = ram[R.NCAM_YL] - ram[R.CAM_YL];
    var lo = d & 0xFF, hi = (ram[R.NCAM_YH] - ram[R.CAM_YH] - (d < 0 ? 1 : 0)) & 0xFF;
    ram[0x348] = (hi & 0x80) ? (neg(lo) | 0x80) : lo;
    if (ram[R.NCAM_YH] !== ram[R.CAM_YH]) ram[0x348] &= 0x9F;
  }
  // $AB5E / $AC8F: registros de scroll de la PPU ($02/$03/$5A)
  function hApply() {
    var d = ram[0x347];
    if (!(d & 0x80)) ram[0x02] = (ram[0x02] + d) & 0xFF;
    else { ram[0x347] = d & 0x7F; ram[0x02] = (ram[0x02] - (d & 0x7F)) & 0xFF; }
  }
  function vApply() {
    var d = ram[0x348], a;
    if (!(d & 0x80)) {
      a = ram[0x03] + d;
      if (a > 0xFF) { ram[0x03] = a & 0xFF; ram[R.NT_SEL] ^= 2; }
      else if (a >= 0xF0) { ram[0x03] = (a + 0x10) & 0xFF; ram[R.NT_SEL] ^= 2; }
      else ram[0x03] = a;
    } else {
      a = ram[0x03] - (d & 0x1F);
      if (a < 0) { ram[0x03] = a & 0xFF; ram[R.NT_SEL] ^= 2; }
      else if (a >= 0xF0) { ram[0x03] = (a - 0x10) & 0xFF; ram[R.NT_SEL] ^= 2; }
      else ram[0x03] = a;
    }
  }
  // $AEE8: anillo en el centro del jugador (16 px por encima de los pies)
  function ringPickup() {
    ram[R.SX_LO] = ram[R.NX_LO]; ram[R.SX_HI] = ram[R.NX_HI];
    if (ram[R.LOOP] === 0x25) {
      ram[R.SY_HI] = ram[R.NY_HI];
      var a = (ram[R.NY_LO] + 0x10) & 0xFF;
      ram[R.SY_LO] = a;
      if (a >= 0xF0) ram[R.SY_HI] = (ram[R.SY_HI] + 1) & 0xFF;
    } else {
      var b = ram[R.NY_LO] - 0x10;
      ram[R.SY_LO] = b & 0xFF;
      ram[R.SY_HI] = (ram[R.NY_HI] - (b < 0 ? 1 : 0)) & 0xFF;
      // (si hubo préstamo el original vuelve a calcular $11-$10: no corrige la página)
    }
    var m = SM.Level.metatileRaw(ram[R.SX_HI], ram[R.SX_LO], ram[R.SY_HI], ram[R.SY_LO]);
    if (m < 0xE0) return;
    ram[R.COL_TYPE] = m;
    var x = m & 0x1F;
    var y = (t19(0xBF00 + x) + ram[R.RINGBASE]) & 0xFF;
    if (!(ram[R.RINGS_BITS + y] & t19(0xBF20 + x))) return;
    ram[R.RINGS_BITS + y] &= t19(0xBF40 + x);
    SM.Collision.addRing();
    ram[R.AGAIN] = 0;
  }
})();
