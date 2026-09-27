// Pantalla de resultados del acto (banco $18, $918D): puntaje, anillos y bonus por tiempo,
// que se suman al puntaje; al final decide el acto siguiente ($9516).
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R;
  var ZC = SM.ZoneCard, T = ZC.T, W = ZC.W;
  var RS = SM.Results = {};
  var nt = new Uint8Array(1024);

  // $8304: nametable comprimido (RLE)
  function unpack(ptr, out) {
    var p = ptr + 1, i = 0;
    for (;;) {
      var c = T(++p);
      if (c === 0xFF) return;
      if (c & 0x80) { for (c &= 0x7F; c; c--) out[i++ & 0x3FF] = T(++p); }
      else { var v = T(++p); for (; c; c--) out[i++ & 0x3FF] = v; }
    }
  }
  RS.unpack = unpack;

  // Búfer de la PPU ($0307-$0313) que el NMI sube a una fila del nametable ($C862)
  var buf = new Uint8Array(9), bufAddr = 0;
  function flush() {
    if (!bufAddr) return;
    for (var i = 0; i < 8; i++) nt[(bufAddr + i) & 0x3FF] = buf[i];
    bufAddr = 0;
  }
  // Números con ceros a la izquierda en blanco (tile $9A = '0')
  function digits(src, n, pad, addr) {
    var y = 0, x, started = false;
    for (x = 0; x < pad; x++) buf[y++] = 0xFF;
    for (x = 0; x < n; x++) {
      var d = ram[src + x];
      if (!started && d === 0) buf[y++] = 0xFF;
      else { started = true; buf[y++] = 0x9A + d; }
    }
    if (!started) buf[y - 1] = 0x9A;
    bufAddr = addr;
  }
  function drawScore() {                                    // $9417
    // (el original arma 9 dígitos desde $0379; el NMI sube sólo 8)
    var y = 0, x, started = false;
    for (x = 0; x < 9; x++) {
      var d = ram[0x379 + x];
      if (!started && d === 0) buf[y++] = 0xFF;
      else { started = true; buf[y++] = 0x9A + d; }
    }
    if (!started) { /* el '0' cae en el noveno byte, que no se sube */ }
    bufAddr = 0x272;
  }
  function drawRings() { digits(0x336, 3, 5, 0x2B2); }     // $9458
  function drawBonus() { digits(0x612, 4, 4, 0x2F2); }     // $94A7

  // $933F: bonus por tiempo. El original lee $39/$3A de página cero (no el reloj en
  // $0339/$033A); $39 nunca se escribe durante el juego, así que el bonus sale 5000.
  function timeBonus() {
    ram[0x613] = 0; ram[0x614] = 0; ram[0x615] = 0;
    var a = ram[0x39], y = 0;
    if (a === 0) y = 5;
    else if (a === 1) y = ram[0x3A] < 3 ? 4 : 3;
    else if (a === 2 && ram[0x3A] < 3) y = 2;
    ram[0x612] = y;
  }

  // $924B: cuenta regresiva (un paso por cuadro, repartido en 4 fases)
  // (el NMI sube el búfer antes de que se dibuje el cuadro siguiente)
  function count() {
    step3();
    flush();
  }
  function step3() {
    switch (ram[R.FRAME] & 3) {
      case 0: return tick();
      case 1: return drawRings();
      case 2: return drawBonus();
    }
    drawScore();
    if (!ram[0x336] && !ram[0x337] && !ram[0x338] && !ram[0x612] && !ram[0x613]) {
      ram[0x86]++; ram[0x603] = 3;
    }
  }
  // $937C: resta 1 de anillos (y luego 10 del bonus) y suma al puntaje
  function tick() {
    if (--ram[0x338] & 0x80) {
      ram[0x338] = 9;
      if (--ram[0x337] & 0x80) {
        ram[0x337] = 9;
        if (--ram[0x336] & 0x80) {
          ram[0x336] = 0; ram[0x337] = 0; ram[0x338] = 0;
          if (--ram[0x613] & 0x80) {
            ram[0x613] = 9;
            if (--ram[0x612] & 0x80) { ram[0x612] = 0; ram[0x613] = 0; return; }
          }
        }
      }
    }
    for (var i = 0x37E; i >= 0x379; i--) {                 // $93B8
      ram[i]++;
      if (ram[i] < 10) break;
      ram[i] = 0;
    }
    ram[R.SFX] = 2;
  }


  RS.start = function (cb) {
    ram[0xE9] = ram[0x336];
    nt.fill(0xFF);
    unpack(W(0x8B94), nt);
    // $9286: textos
    var i, p = W(0x893C + T(0x933B + ram[0xB4]));
    for (i = 0; i < 22; i++) nt[0xC4 + i] = T(p + i);
    for (i = 0; i < 22; i++) nt[0xE4 + i] = T(p + 22 + i);
    p = W(0x893C + T(0x933D + ram[0xB4]));
    for (i = 0; i < 22; i++) nt[0x124 + i] = T(p + i);
    for (i = 0; i < 22; i++) nt[0x144 + i] = T(p + 22 + i);
    for (i = 0; i < 32; i++) SM.Render.pal[i] = T(0x94F6 + i) & 0x3F;
    SM.Render.mirrorPal();
    timeBonus();
    drawScore(); flush();
    drawRings(); flush();
    drawBonus(); flush();
    ram[0x02] = 0xF0; ram[0x03] = 0; ram[0x34D] = 0;
    // pantalla apagada mientras se prepara (esperas de vblank y descompresión)
    var wait = 8;
    SM.Game.scene = function () {
      SM.Game.nmi();
      SM.Render.clear();
      if (--wait) return;
      ZC.run(nt, nt.subarray(960), count, function () {
        nextAct();
        // $CEB6
        ram[R.MUSIC] = 0; ram[0x02] = 0; ram[0x03] = 0;
        cb();
      });
      ram[R.CHR5] = 0x73;
    };
  };

  // $9516: acto siguiente; con 100 anillos o más (y no en el acto 3) va a la etapa especial
  function nextAct() {
    if (ram[0xB4]) {
      ram[0xB4] = 0; ram[0xE9] = 0;
      ram[R.ZONE] = ram[0xE8]; ram[R.ACT] = ram[0xE7];
      ram[0xE7] = 0; ram[0xE8] = 0;
      return;
    }
    var special = ram[R.ACT] !== 2 && ram[0xE9];
    if (special) { ram[0xE9] = 0; ram[0xB4] = 1; } else ram[0xB4] = 0;
    if (++ram[R.ACT] >= 3) {
      ram[R.ACT] = 0;
      if (++ram[R.ZONE] >= 5) ram[R.ZONE] = 6;
    }
    if (special) {
      ram[0xE7] = ram[R.ACT]; ram[0xE8] = ram[R.ZONE];
      ram[R.ZONE] = 7; ram[R.ACT] = 0;
    }
  }
})();
