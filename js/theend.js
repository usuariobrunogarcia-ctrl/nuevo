// Pantalla final "THE END / I WILL BE BACK" (banco $18, $959A): el villano hace
// malabares con cinco pelotas. En el original es el final del juego; este port la
// muestra al terminar Green Hill Zone (el Mundo 1).
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R;
  function T(a) { return SM.rom.b(a < 0xA000 ? 0x18 : 0x19, a); }
  var E = SM.TheEnd = {};
  var nt = new Uint8Array(1024), wait;

  E.start = function () {
    ram[R.IRQMODE] = 2; ram[R.MUSIC] = 0;
    ram[0x02] = 0; ram[0x03] = 0; ram[0x34D] = 0;
    nt.fill(0xFF);
    var i;
    for (i = 0; i < 32; i++) SM.Render.pal[i] = T(0x999A + i) & 0x3F;   // $9607
    SM.Render.mirrorPal();
    for (i = 0; i < 14; i++) {                                            // $97CD
      nt[0x249 + i] = T(0x981C + i); nt[0x269 + i] = T(0x982A + i); nt[0x2A9 + i] = T(0x9838 + i);
    }
    ram[0xD1] = 0; ram[0xCB] = 0; ram[0xB9] = 0;
    ram[R.CHR0] = 0xF8; ram[R.CHR1] = 0xFA;
    ram[R.CHR2] = 0xF8; ram[R.CHR3] = 0xF9; ram[R.CHR4] = 0xFA; ram[R.CHR5] = 0xFB;
    ram[R.MUSIC] = 0x22;
    wait = 3;
    SM.Game.scene = step;
  };

  // $9687: cinco pelotas de 2x2 tiles en una trayectoria tabulada
  function balls() {
    var dd = ram[0xD1];
    for (var n = 0; n < 5; n++, dd++) {
      var x, y;
      if (ram[0xB9] < 2) { x = 0x68 + T(0x971F + dd); y = 0x4F + T(0x972E + dd); }
      else { x = 0x68 + T(0x973D + dd); y = 0x4F + T(0x974C + dd); }
      x &= 0xFF; y &= 0xFF;
      for (var k = 0; k < 4; k++)
        SM.Spr.push((x + (k & 1) * 8) & 0xFF, (y + (k >> 1) * 8) & 0xFF, T(0x9717 + k), T(0x971B + k));
    }
  }
  // $975B: el villano (6x7 tiles), cuadro $CB
  function villain() {
    var q = T(0x9846 + ram[0xCB]);
    for (var r = 0; r < 7; r++)
      for (var c = 0; c < 6; c++, q++) {
        var t = T(0x984A + q);
        if (t) SM.Spr.push(0x68 + c * 8, 0x4F + r * 8, t, T(0x98F2 + q));
      }
  }

  // $9622
  function step() {
    SM.Game.nmi();
    var Rn = SM.Render, ox = (Rn.W - 256) >> 1;
    if (wait) { wait--; Rn.clear(); return; }
    switch (ram[0xB9]) {
      case 0: case 2:                                     // $963B
        ram[0xCB] = ram[0xB9] & 3;
        if (!(ram[R.FRAME] & 7)) { ram[0xD1]++; ram[R.SFX] = 2; }
        if (ram[0xD1] >= 9) { ram[0xB9]++; ram[0xB1] = 0x28; }
        break;
      case 1:                                             // $965F
        if (!--ram[0xB1]) { ram[0xB9]++; ram[0xD1] = 0; }
        ram[0xCB] = 1;
        break;
      case 3:                                             // $9673
        if (!--ram[0xB1]) { ram[0xB9] = 0; ram[0xD1] = 0; }
        ram[0xCB] = 3;
        break;
    }
    SM.Spr.clear();
    villain();
    balls();
    Rn.clear();
    Rn.drawNTRows(nt, nt.subarray(960), [ram[R.CHR2], ram[R.CHR3], ram[R.CHR4], ram[R.CHR5]], 0, 0, 240, ox, 0xFF);
    Rn.drawSprites([ram[R.CHR0], ram[R.CHR0] + 1, ram[R.CHR1], ram[R.CHR1] + 1], ox);
    // el original queda aquí para siempre; en el port START vuelve al título (como un reset)
    if (ram[R.JOYP] & 0x10) SM.Title.start();
  }
})();
