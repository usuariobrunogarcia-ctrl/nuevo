// Presentación "SOMARI TEAM PRESENTS" (banco fijo, estados $DD 3-4: $C1D7/$C300) y
// pantalla de título (banco $18, $8000). Todos los datos se leen del ROM.
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R;
  function T(a) { return SM.rom.b(a < 0xA000 ? 0x18 : 0x19, a); }
  function W(a) { return T(a) | (T(a + 1) << 8); }
  function t30(a) { return SM.rom.b(0x1E, a); }
  function w30(a) { return t30(a) | (t30(a + 1) << 8); }

  var TI = SM.Title = {};
  var nt0 = new Uint8Array(1024), nt2 = new Uint8Array(1024);
  var bgBanks, sprBanks, wait;

  // Paleta vía $3F00 con los espejos de $3F10/$14/$18/$1C
  function palWrite(i, v) {
    i &= 0x1F; if ((i & 0x13) === 0x10) i &= ~0x10;
    SM.Render.pal[i] = v & 0x3F;
  }

  // Valores de la protección: el cargador copia tríos (dir. alta, dir. baja, valor) desde la
  // CHR ($C32C lee PPU $1440, banco de 1 KB $B1) y constantes del código del banco 27.
  function protection() {
    var chr = SM.rom.chr, o = 0xB1 * 0x400 + 0x40;
    for (var y = 0; y < 0x80; y += 3) {
      var hi = chr[o + y];
      if (hi === 0xFF) break;
      var a = (hi << 8) | chr[o + y + 1];
      if (a < 0x800) ram[a] = chr[o + y + 2];
    }
    ram[0x120] = SM.rom.b(27, 0xBE2A);
    ram[0x121] = SM.rom.b(27, 0xBE2F);
  }

  // ---------- presentación ----------
  TI.start = function () {
    for (var i = 0; i < 0x800; i++) ram[i] = 0;
    ram[R.MUSIC] = 0; ram[R.IRQMODE] = 0;
    SM.Game.viewX = 0;
    protection();
    // $C1D7: cinco bloques de datos para la PPU (el primero es la paleta)
    nt0.fill(0xFF);
    for (var k = 0; k < 5; k++) {
      var p = w30(0xC221 + k * 2), addr = (t30(p) << 8) | t30(p + 1), n = t30(p + 2);
      for (var j = 0; j < n; j++, addr++) {
        var v = t30(p + 3 + j);
        if (addr >= 0x3F00) palWrite(addr, v);
        else nt0[(addr - 0x2000) & 0x3FF] = v;
      }
    }
    // $C278: sprites del texto
    SM.Spr.clear();
    for (var y = 0; y < 0x38; y += 4) {
      SM.Spr.push(t30(0xC2AD + y), t30(0xC2AA + y), t30(0xC2AB + y), t30(0xC2AC + y));
      ram[0x101] = t30(0xC2AC + y);
    }
    ram[0x02] = 0xFF;                                     // $C2A4: scroll X
    bgBanks = [0xB8, 0xB9, 0xBA, 0xBB];
    sprBanks = [0xB4, 0xB1, 0xB6, 0x07];
    SM.Game.scene = intro;
  };

  function drawStill(nt, banks, sb) {
    var Rn = SM.Render, ox = (Rn.W - 256) >> 1;
    Rn.clear();
    Rn.drawNTRows(nt, nt.subarray(960), banks, ram[0x02], 0, 240, ox, -1);
    Rn.drawSprites(sb, ox);
  }

  // $C300
  function intro() {
    SM.Game.nmi();
    drawStill(nt0, bgBanks, sprBanks);
    if (!ram[R.JOY] && !(ram[R.FRAME] & 0x0F)) return;
    ram[0x101]++;
    if (ram[0x101] >= 0x60) { wait = 14; SM.Game.scene = blank; }
  }
  // pantalla apagada mientras se prepara el título ($C349)
  function blank() {
    SM.Game.nmi();
    SM.Render.pal.fill(0x0F); SM.Render.clear();
    if (--wait === 0) title();
  }

  // $8304: nametable comprimido (RLE)
  function unpack(ptr, nt) {
    var p = ptr + 1, i = 0;
    for (;;) {
      var c = T(++p);
      if (c === 0xFF) return;
      if (c & 0x80) { for (c &= 0x7F; c; c--) nt[i++ & 0x3FF] = T(++p); }
      else { var v = T(++p); for (; c; c--) nt[i++ & 0x3FF] = v; }
    }
  }

  // ---------- título: $8000 ----------
  function title() {
    var prot = new Uint8Array(ram.subarray(0x100, 0x150));
    for (var i = 0; i < 0x800; i++) ram[i] = 0;
    ram.set(prot, 0x100);
    unpack(W(0x8B90), nt0);
    unpack(W(0x8B90), nt2);
    // $86DB: la otra pose de la mano en el segundo nametable
    for (i = 0; i < 4; i++) {
      nt2[0xC8 + i] = T(0x8727 + i); nt2[0xE8 + i] = T(0x872B + i); nt2[0x108 + i] = T(0x872F + i);
    }
    // $87D0: sprites fijos
    SM.Spr.clear();
    for (var e = 0; e < 0x10; e += 2) {
      var p = W(0x8842 + e), x0 = T(p), yy = T(p + 1), cols = T(p + 2), rows = T(p + 3), at = T(p + 4), q = p + 5;
      for (var r = 0; r < rows; r++, yy = (yy + 8) & 0xFF)
        for (var c = 0, xx = x0; c < cols; c++, xx = (xx + 8) & 0xFF) {
          var t = T(q++);
          if (t) SM.Spr.push(xx, yy, t, at);
        }
    }
    var b = ram[0x120];
    bgBanks = [b, b + 1, b + 2, b + 3];
    ram[R.ZONE_P] = ram[0x121];
    b = ram[0x10A];
    sprBanks = [b, b + 1, b + 2, b + 3];
    ram[0x601] = 0; ram[0x603] = 0x0C;
    ram[R.MUSIC] = 0x20;
    ram[0x332] = 0; ram[0x333] = 0;
    ram[R.NT_SEL] = 0;
    ram[R.IRQMODE] = 1;
    SM.Render.pal.fill(0x0F);
    SM.Game.scene = fadeIn;
  }

  // Pantalla del título con los cortes del IRQ modo 1 ($CA08): los bancos del fondo
  // cambian en la línea 74 y en la 128 (animación del agua según $06).
  function drawTitle() {
    var Rn = SM.Render, ox = (Rn.W - 256) >> 1, nt = ram[R.NT_SEL] ? nt2 : nt0, at = nt.subarray(960);
    var w = t30(0xCA5D + ((ram[R.FRAME] >> 3) & 3)), b = bgBanks[0] + 4;
    Rn.clear();
    Rn.drawNTRows(nt, at, bgBanks, 0, 0, 74, ox, 0xFF);
    Rn.drawNTRows(nt, at, [b, b + 1, b + 2, b + 3], 0, 74, 128, ox, 0xFF);
    Rn.drawNTRows(nt, at, [w, w + 1, w + 2, w + 3], 0, 128, 240, ox, 0xFF);
    Rn.drawSprites(sprBanks, ox);
  }

  function fadeIn() {                                     // $D4E1
    SM.Game.nmi();
    if (!(ram[R.FRAME] & 3)) SM.Game.palStep();
    drawTitle();
    if (ram[0x333] === 5) SM.Game.scene = loop;
  }

  // $808D
  function loop() {
    SM.Game.nmi();
    drawTitle();
    ram[R.NT_SEL] = (ram[R.FRAME] & 0x20) ? 0 : 2;
    if (ram[R.JOYP] & 0x10) {
      // $81EB: zona/acto de la tabla $82E2 y desvanecimiento
      ram[R.ZONE] = T(0x82E2); ram[R.ACT] = T(0x82E3);
      ram[R.MUSIC] = 0; ram[R.SFX] = 0;
      ram[0x333] = 5;
      SM.Game.scene = fadeOut;
    }
  }
  function fadeOut() {
    SM.Game.nmi();
    if (!(ram[R.FRAME] & 3)) SM.Game.palStep();
    drawTitle();
    if (ram[0x333] === 9) {
      ram[R.IRQMODE] = 0xFF;
      SM.Game.newGame(ram[R.ZONE], ram[R.ACT]);
    }
  }

  // ---------- pantalla de continuación ($CFD4) ----------
  var cnt = new Uint8Array(1024);
  TI.continueScreen = function () {
    ram[R.IRQMODE] = 2; ram[R.MUSIC] = 0;
    ram[0x02] = 0; ram[0x03] = 0; ram[0x34D] = 0;
    cnt.fill(0xFF);
    for (var k = 0; k < 5; k++) {                         // $D080: cinco textos
      var p = w30(0xD0B3 + k * 2), addr = (t30(p) << 8) | t30(p + 1);
      for (var j = p + 2; t30(j) !== 0xFF; j++, addr++) cnt[(addr - 0x2000) & 0x3FF] = t30(j);
    }
    // paleta 9 de la tabla $D5CC, completa
    ram[R.ZONE_P] = 9; ram[0x332] = 0; ram[0x333] = 4; SM.Game.palStep();
    ram[0x606] = 1;
    ram[R.CHR0] = 0x70; ram[R.CHR1] = 0x72;
    ram[R.CHR2] = 0x70; ram[R.CHR3] = 0x71; ram[R.CHR4] = 0x72; ram[R.CHR5] = 0x73;
    SM.Game.scene = contStep;
  };
  function contStep() {
    SM.Game.nmi();
    var j = ram[R.JOYP];
    if (j & 0x08) ram[0x606] = 1;
    else if (j & 0x04) ram[0x606] = 0;
    var Rn = SM.Render, ox = (Rn.W - 256) >> 1;
    SM.Spr.clear();
    SM.Spr.push(0x70, ram[0x606] ? 0xA0 : 0xA8, 0x68, 0);
    Rn.clear();
    Rn.drawNTRows(cnt, cnt.subarray(960), [0x70, 0x71, 0x72, 0x73], 0, 0, 240, ox, 0xFF);
    Rn.drawSprites([0x70, 0x71, 0x72, 0x73], ox);
    if (!(j & 0xC0)) return;
    if (!ram[0x606]) return TI.start();                   // NO: reinicio
    ram[0xB3]--; ram[R.ACT] = 0; ram[R.LIVES] = 3;        // SÍ: acto 1 de la zona
    ram[R.MUSIC] = 0; ram[R.IRQMODE] = 2;
    SM.Game.startAct();
  }
})();
