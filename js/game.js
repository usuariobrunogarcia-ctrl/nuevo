// Bucle principal del juego (port del banco fijo $1E: NMI $C58F y bucle $C452) y escenas.
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R;
  function t30(a) { return SM.rom.b(0x1E, a); }
  function t1D(a) { return SM.rom.b(0x1D, a); }

  var G = SM.Game = {
    scene: null,        // función que avanza un cuadro de la escena actual
    wide: false,        // modo panorámico
    viewW: 256,
    viewX: 0,           // x del mundo del borde izquierdo de la vista
    joy: 0              // botones actuales (formato del juego)
  };

  // ---------- paleta: $D4E1/$D557 ----------
  G.palStep = function () {
    var base = SM.rom.w(0x1E, 0xD5CC + ram[R.ZONE_P] * 2);
    var mask = SM.rom.w(0x1E, 0xD5C8 + ram[0x332] * 2);
    var sub = t30(0xD5BF + ram[0x333]);
    for (var y = 0; y < 32; y++) {
      var v;
      if (t30(mask + y) & 0x80) v = t30(base + y);
      else { v = t30(base + y) - sub; if (v < 0) v = 0xFF; }
      SM.Render.pal[y] = v & 0x3F;
    }
    SM.Render.mirrorPal();
    ram[0x333]++;
  };
  G.palFade = function () {          // $D557: un paso cada 4 cuadros
    if (ram[R.FRAME] & 3) return;
    G.palStep();
  };

  // ---------- NMI: controles, reloj ----------
  function nmi() {
    var prev = ram[0x304];
    ram[R.JOY] = G.joy;
    ram[R.JOYP] = (G.joy ^ prev) & G.joy;
    ram[0x304] = G.joy;
    if (!ram[0xEB]) {
      ram[R.SEC_CNT]++;
      if (ram[R.SEC_CNT] >= 0x3C) {
        ram[R.SEC_CNT] = 0;
        ram[R.TIME_S]++;
        if (ram[R.TIME_S] >= 10) {
          ram[R.TIME_S] = 0;
          ram[R.TIME_T]++;
          if (ram[R.TIME_T] >= 6) {
            ram[R.TIME_T] = 0;
            ram[R.TIME_M]++;
            if (ram[R.TIME_M] >= 10) {
              ram[R.TIME_M] = 9; ram[R.TIME_S] = 9; ram[R.TIME_T] = 5;
              ram[0xAF] = 5;
            }
          }
        }
      }
    }
    ram[0x3C] = 0;
    ram[R.FRAME]++;
    SM.Sound && SM.Sound.update();
  }
  G.nmi = nmi;
  G.nmiInput = function () {
    var prev = ram[0x304];
    ram[R.JOY] = G.joy;
    ram[R.JOYP] = (G.joy ^ prev) & G.joy;
    ram[0x304] = G.joy;
    ram[R.FRAME]++;
    SM.Sound && SM.Sound.update();
  };

  // ---------- $CD98: temporizadores por segundo ----------
  function perSecond() {
    if (ram[R.LOCK]) ram[R.LOCK]--;
    if (ram[R.SHIELD]) {
      ram[R.SHIELD]--;
      if (!ram[R.SHIELD]) ram[R.MUSIC] = t30(0xCDC9 + ram[R.ZONE]);
    }
    if (ram[R.WATER] && ram[R.WATER] < 0x3D) ram[R.WATER]++;
    ram[R.HURT]--; if (ram[R.HURT] & 0x80) ram[R.HURT] = 0;
    ram[0x9C]--; if (ram[0x9C] & 0x80) ram[0x9C] = 0;
  }

  // ---------- marcador: $A010 / $A10F ----------
  function hud() {
    var ox = -G.logicalOffset();
    var P = SM.Spr;
    if (ram[0x3C] < 0xDB) {
      P.push(0x18 + ox, 0x18, (ram[R.FRAME] & 0x20) ? 0x63 : 0x62, 2);
      P.push(0x28 + ox, 0x18, t1D(0xA000 + ram[R.RING_H]), 1);
      P.push(0x30 + ox, 0x18, t1D(0xA000 + ram[R.RING_T]), 1);
      P.push(0x38 + ox, 0x18, t1D(0xA000 + ram[R.RING_O]), 1);
      P.push(0x18 + ox, 0x20, t1D(0xA000), 1);
      P.push(0x20 + ox, 0x20, t1D(0xA000 + ram[R.TIME_M]), 1);
      P.push(0x28 + ox, 0x20, 0x6E, 1);
      P.push(0x30 + ox, 0x20, t1D(0xA000 + ram[R.TIME_T]), 1);
      P.push(0x38 + ox, 0x20, t1D(0xA000 + ram[R.TIME_S]), 1);
    }
    if (ram[0x3C] < 0xEB) {
      P.push(0x18 + ox, 0xC0, 0x7A, 0);
      P.push(0x20 + ox, 0xC0, 0x7E, 0);
      P.push(0x18 + ox, 0xC8, 0x7B, 0);
      P.push(0x20 + ox, 0xC8, 0x7F, 0);
      P.push(0x28 + ox, 0xC8, t1D(0xA000 + ram[R.LIVES]), 1);
    }
  }

  // ---------- vista (modo panorámico) ----------
  // La cámara lógica del juego sigue siendo de 256 px (así el comportamiento no cambia);
  // la vista se extiende a ambos lados y se ajusta a los límites del nivel.
  G.logicalX = function () { return (ram[R.CAM_XH] << 8) | ram[R.CAM_XL]; };
  G.computeView = function () {
    var W = SM.Render.W, cx = G.logicalX();
    var vx = cx - ((W - 256) >> 1);
    var minX = ((ram[R.BND_L] + 1) & 0xFF) << 8;
    if (ram[R.BND_L] === 0xFF) minX = 0;
    var maxX = (ram[R.BND_R] << 8) + 256 - W;
    var lvlMax = SM.Level.width * 256 - W;
    if (maxX > lvlMax) maxX = lvlMax;
    if (vx > maxX) vx = maxX;
    if (vx < minX) vx = minX;
    if (W > 256) {
      // nunca dejar fuera de la vista la pantalla lógica original
      if (vx > cx) vx = cx;
      if (vx + W < cx + 256) vx = cx + 256 - W;
    }
    G.viewX = vx;
    SM.Spr.xmin = W > 256 ? vx - cx : 0;
    SM.Spr.xmax = W > 256 ? vx - cx + W : 256;
    SM.Objects.extra = W > 256 ? (W - 256) : 0;
  };
  G.logicalOffset = function () { return G.logicalX() - G.viewX; };
  G.viewOffsetX = G.logicalOffset;

  // ---------- dibujo del cuadro ----------
  G.renderLevel = function () {
    var Rn = SM.Render;
    Rn.drawLevel(G.viewX, ram[R.CAM_YH], ram[R.CAM_YL]);
    G.drawSprites();
  };
  G.drawSprites = function () {
    var c0 = ram[R.CHR0], c1 = ram[R.CHR1];
    SM.Render.drawSprites([c0 & 0xFE, c0 | 1, c1 & 0xFE, c1 | 1], G.logicalOffset());
  };

  // ---------- inicio de partida / de acto ----------
  G.newGame = function (zone, act) {
    for (var i = 0; i < 0x800; i++) ram[i] = 0;
    ram[R.ZONE] = zone || 0; ram[R.ACT] = act || 0;
    ram[R.LIVES] = 5;
    G.startAct();
  };
  // $C3BC
  G.startAct = function () {
    resetVars();
    ram[0xEB] = 0;
    SM.ZoneCard.start(function () {
      SM.Level.init(SM.rom, ram[R.ZONE], ram[R.ACT]);
      // $C3FA: estado inicial del sprite del jugador
      ram[R.PSCR_X] = 0x80; ram[R.PSCR_Y] = 0x80;
      SM.Player.loadFrame();
      ram[R.ZONE_P] = ram[R.ZONE];
      ram[0x332] = 0; ram[0x333] = 0;
      ram[R.CAM_XL] = 0;
      ram[R.NCAM_XL] = 0;
      ram[R.CHR1] = ram[R.SPRBANK];
      ram[R.IRQMODE] = 0;
      G.computeView();
      SM.Spr.clear();
      SM.Player.drawInitial();
      G.scene = fadeIn;
    });
  };
  // $D10F
  function resetVars() {
    var z = [R.GSPD, R.VSPD, R.ANIM, R.ANIM_FRAME, R.ANIM_TIMER, R.PFLAGS, R.PFLAGS2, R.AFP_HI, R.AFP_LO,
      R.STATE, R.PREV_STATE, R.LOOP, R.ANGLE, R.SHIELD, R.WATER, R.HURT, 0x9C, R.LOCK, R.PSCR_XH, R.PSCR_YH,
      R.IDLE, R.TIME_M, R.TIME_T, R.TIME_S, R.RING_H, R.RING_T, R.RING_O,
      R.DYING, 0xB7, 0xAF, 0xB0, 0xB1, 0xB2, 0xB5, 0xB6, 0xE6, R.OBJ_N, 0xB8, 0xB9];
    for (var i = 0; i < z.length; i++) ram[z[i]] = 0;
    for (var y = 0; y < 0x17; y++) { ram[SM.O.TYPE + y] = 0; ram[SM.O.SXH + y] = 0x80; }
    for (y = 0; y < 0x10; y++) ram[R.OBJ_SPAWNED + y] = 0;
    SM.BgEdit && SM.BgEdit.clear();
  }

  // $D4E1: aparición gradual (el juego queda detenido)
  function fadeIn() {
    nmi();
    if (!(ram[R.FRAME] & 3)) G.palStep();
    G.renderLevel();
    if (ram[0x333] === 5 || ram[0x333] === 9) G.scene = play;
  }

  // ---------- $C452: un cuadro de juego ----------
  function play() {
    nmi();
    SM.Spr.clear();
    ram[0x9D] = 1;
    if (ram[R.JOYP] & 0x10) ram[0xEB] ^= 1;
    if (!ram[0xEB]) {
      if (ram[R.SEC_CNT] === 0) perSecond();
      SM.Player.update();
      SM.Objects.update();
      if (ram[0xB8]) SM.Boss.update();
      SM.Camera.update();
      G.computeView();
      SM.Player.animate();
      SM.ObjDraw.drawAll();
      if (ram[0xB6]) SM.Ending.drawCapsule();
      if (ram[0xB8] >= 4) SM.Boss.draw();
      if (ram[0x3C] < 0xDB) hud();
    }
    // $C557: animación del fondo
    ram[R.CHR5] = ram[R.BGANIM + ((ram[R.FRAME] >> 3) & 3)];
    ram[0x9D] = 0;
    if (ram[0xB0]) deathSequence();
    if (ram[0xB5]) SM.Ending.actEnd();
    G.renderLevel();
    if (ram[0xB2]) sceneChange();
  }
  G.play = play;

  // ---------- $CE1B: secuencia de muerte ----------
  function deathSequence() {
    switch (ram[0xB0]) {
      case 1:
        ram[R.LIVES]--;
        ram[0x601] = 0xFF; ram[0x600] = 0xD8; ram[0x603] = 1; ram[0x602] = 8; ram[0x604] = 0x20;
        ram[0xB0] = 2;
        if (ram[R.LIVES] === 0) { ram[R.MUSIC] = 0x2B; ram[0x605] = 8; return; }
        if (ram[0xAF]) { ram[0x605] = 0x10; return; }
        ram[0x605] = 0; ram[0xB1] = 2; ram[0xB0] = 3;
        return;
      case 2:                                     // $CEC8: el texto entra desde los lados
        overText();
        var a = ram[0x600] + 4; ram[0x600] = a & 0xFF; ram[0x601] = (ram[0x601] + (a > 0xFF ? 1 : 0)) & 0xFF;
        var b = ram[0x602] - 4; ram[0x602] = b & 0xFF; ram[0x603] = (ram[0x603] - (b < 0 ? 1 : 0)) & 0xFF;
        ram[0x604]--;
        if (ram[0x604] & 0x80) {
          ram[0xB0] = 3; ram[0xB1] = 6;
          if (ram[0x605] === 8) ram[0xB1] = 0x0C;
        }
        return;
      case 3:
        overText();
        if (ram[R.SEC_CNT] === 0) {
          ram[0xB1]--;
          if (ram[0xB1] & 0x80) { ram[0xB0] = 4; ram[0x333] = 5; }
        }
        return;
      case 4:
        overText();
        G.palFade();
        if (ram[0x333] === 9) {
          ram[0xB0] = 0;
          var y = 2;
          if (ram[R.LIVES] === 0) y = ram[0xB3] ? 1 : 3;
          ram[0xB2] = y;
        }
        return;
    }
  }
  // $CF04: "GAME OVER" / "TIME OVER"
  function overText() {
    if (!ram[0x605]) return;
    var ox = -G.logicalOffset();
    word(s16(ram[0x601], ram[0x600]), ram[0x605], ox);
    word(s16(ram[0x603], ram[0x602]), 0, ox);
    ram[R.CHR0] = 0x84;
  }
  function word(x, idx, ox) {
    for (var r = 0; r < 2; r++) {
      var y = r ? 0x78 : 0x70;
      for (var c = 0; c < 4; c++, idx++) {
        var cx = x + c * 8;
        if (cx <= 0 || cx > 0xFF) continue;
        SM.Spr.push(cx + ox, y, t30(0xCFBC + idx), 1);
      }
    }
  }
  function s16(hi, lo) { var v = (hi << 8) | lo; return v >= 0x8000 ? v - 0x10000 : v; }

  // ---------- $CDD1: cambio de escena ----------
  function sceneChange() {
    var k = ram[0xB2];
    ram[0xB2] = 0;
    switch (k) {
      case 1: SM.Title.continueScreen(); break;
      case 2: ram[R.MUSIC] = 0; G.startAct(); break;
      case 3: SM.Title.start(); break;
      case 4: SM.Results.start(function () { G.startAct(); }); break;
      case 5: SM.Results.zoneClear(); break;
    }
  }

  // ---------- ciclo de 60 Hz ----------
  G.frame = function () {
    if (G.scene) G.scene();
    SM.Render.present();
  };
})();
