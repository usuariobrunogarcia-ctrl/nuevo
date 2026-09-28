// Tails como personaje jugable (no existe en el original). Se mueve con la misma física
// que Somari (la original o la de Sonic 3) y además puede volar como en Sonic 3
// (Tails_Test_For_Flight / Tails_Move_FlySwim). Con la física de Sonic 3 el vuelo lo
// hace s3.js; aquí está el de la física original y el dibujo del personaje, que usa
// los cuadros de tails.png (js/tailsgfx.js) en lugar del metasprite de Somari.
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R;
  var T = SM.Tails = {};

  T.active = function () { return !!(SM.settings && SM.settings.tails); };

  // ---------- vuelo con la física original ----------
  // La velocidad vertical se lleva en unidades de Sonic 3 (1/256 px por cuadro) con un
  // acumulador de subpíxeles; la horizontal es el control en el aire de Somari ($A677).
  var F = { fly: 0, time: 0, yv: 0, acc: 0, vs: 0, fl: 0 };
  T.reset = function () { F.fly = 0; };
  T.flying = function () {
    if (SM.S3.enabled && !SM.S3.somari) return SM.S3.flying();
    return F.fly ? (F.time ? 1 : 2) : 0;
  };

  function blocked() {
    var st = ram[R.PREV_STATE];
    return (ram[R.STATE] & 0x80) || st === 9 || st === 0x0A || ram[0xAF] || ram[0xB6] >= 3 ||
      ram[0xEA] || ram[R.ZONE] === 7 || ram[0xB0];
  }

  // Llamado al principio de Player.update; devuelve true si ya movió al jugador.
  T.update = function () {
    if (!T.active() || SM.S3.enabled || blocked()) { F.fly = 0; return false; }
    if (F.fly) {
      // un objeto (resorte, monitor, jefe...) cambió la velocidad: termina el vuelo
      if (ram[R.VSPD] !== F.vs || (ram[R.PFLAGS] & 0x0C) !== F.fl) { F.fly = 0; return false; }
    } else {
      // Tails_Test_For_Flight: A/B en el aire después de un salto
      if (ram[R.PREV_STATE] !== 8 || !(ram[R.PFLAGS2] & 4) || !(ram[R.JOYP] & 0xC0)) return false;
      var dy0 = SM.rom.b(0x1D, 0xAC62 + (ram[R.VSPD] >> 4));
      F.yv = ((ram[R.PFLAGS] & 4) ? -dy0 : dy0) * 256;
      F.acc = 0; F.fly = 1; F.time = (8 * 60) >> 1;
    }
    fly();
    return true;
  };

  function dirf(x) { return SM.rom.b(0x1D, 0xAAEA + x); }

  function fly() {
    var joy = ram[R.JOY];
    // Tails_Move_FlySwim
    if ((ram[R.FRAME] & 1) && F.time) F.time--;
    if (F.fly !== 1) {
      if (F.yv >= -0x100) { F.yv -= 0x20; if (++F.fly === 0x20) F.fly = 1; } else F.fly = 1;
    } else {
      if ((ram[R.JOYP] & 0xC0) && F.yv >= -0x100 && F.time) F.fly = 2;
      F.yv += 8;
    }
    var feet = ram[R.PY_HI] * 240 + ram[R.PY_LO];
    if (feet <= 0x28 && F.yv < 0) F.yv = 0;           // borde superior del nivel
    // control horizontal en el aire ($A677)
    if (joy & 3) {
      var x = joy & 3;
      if (((ram[R.PFLAGS] ^ dirf(x)) & 0x43) === 0) {
        var a = ram[R.GSPD] + 2;
        ram[R.GSPD] = a >= 0xF8 ? 0xF7 : a;
      } else {
        ram[R.PFLAGS] = (ram[R.PFLAGS] & 0x3C) | dirf(x);
        ram[R.GSPD] = 0;
      }
    }
    F.acc += F.yv;
    var dy = F.acc >> 8;
    F.acc -= dy * 256;
    if (ram[R.WATER]) dy = (ram[R.FRAME] & 1) ? dy : 0;
    // mientras vuela no ataca (no es una bola) y el estado 6 evita el cuadro de bola
    ram[R.STATE] = 6; ram[R.PFLAGS2] &= 0xFB;
    if (dy < 0) ram[R.PFLAGS] |= 0x0C; else ram[R.PFLAGS] &= 0xF3;
    ram[R.VSPD] = 0x20;
    var up = dy < 0;
    SM.Player.moveBy(dy);
    if (ram[R.VSPD] === 0 && !up) {                   // aterrizó
      F.fly = 0;
      ram[R.STATE] = ram[R.GSPD] ? 1 : 0;
      ram[R.PFLAGS] &= 0xF3;
      return;
    }
    if (up && !(ram[R.PFLAGS] & 4)) F.yv = 0;          // golpe contra el techo
    F.vs = ram[R.VSPD]; F.fl = ram[R.PFLAGS] & 0x0C;
  }

  // ---------- gráficos ----------
  var G = SM.TailsGfx, cache = {}, colors = null, info = [];
  function rgba(hex) {
    var v = parseInt(hex.slice(1), 16);
    return (0xFF000000 | ((v & 0xFF) << 16) | (v & 0xFF00) | ((v >> 16) & 0xFF)) >>> 0;
  }
  // Recuadro de lo dibujado y centro de la bola (ventana de 24x24 con más píxeles)
  function frameInfo(f) {
    if (info[f]) return info[f];
    var w = G.frames[f][0], h = G.frames[f][1], s = G.frames[f][2];
    var x0 = w, x1 = 0, y0 = h, y1 = 0, x, y;
    var sum = new Int32Array((w + 1) * (h + 1));
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var o = s.charCodeAt(y * w + x) !== 46 ? 1 : 0;
      if (o) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
      sum[(y + 1) * (w + 1) + x + 1] = o + sum[y * (w + 1) + x + 1] + sum[(y + 1) * (w + 1) + x] - sum[y * (w + 1) + x];
    }
    var B = 24, best = -1, bx = w / 2, by = h / 2;
    for (y = 0; y + B <= h; y++) for (x = 0; x + B <= w; x++) {
      var n = sum[(y + B) * (w + 1) + x + B] - sum[y * (w + 1) + x + B] - sum[(y + B) * (w + 1) + x] + sum[y * (w + 1) + x];
      if (n > best) { best = n; bx = x + B / 2; by = y + B / 2; }
    }
    return (info[f] = { w: w, h: h, x0: x0, x1: x1, y0: y0, y1: y1, bx: bx, by: by });
  }
  // Cuadro espejado (hf) y girado k cuartos de vuelta en sentido antihorario
  function image(f, hf, k) {
    var key = f * 8 + (hf ? 4 : 0) + k;
    if (cache[key]) return cache[key];
    if (!colors) colors = G.pal.map(rgba);
    var w = G.frames[f][0], h = G.frames[f][1], s = G.frames[f][2];
    var W = (k & 1) ? h : w, H = (k & 1) ? w : h, px = new Uint32Array(W * H);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var c = s.charCodeAt(y * w + x);
      if (c === 46) continue;
      var p = pt(hf ? w - 1 - x : x, y, w, h, k, 1);
      px[p[1] * W + p[0]] = colors[c - 97];
    }
    return (cache[key] = { w: W, h: H, px: px });
  }
  // Transforma un punto; e = 1 para índices de píxel, 0 para coordenadas continuas
  function pt(x, y, w, h, k, e) {
    for (var i = 0; i < k; i++) { var t = x; x = y; y = w - e - t; t = w; w = h; h = t; }
    return [x, y];
  }

  // Cuadros de la hoja (en el orden de js/tailsgfx.js)
  // La fila "IDLE / LOOK UP" son 5 cuadros de espera (la cola se mueve) y el de mirar
  // arriba; "DUCK / WAITING" es agacharse y la impaciencia: de frente, 7-8 cuatro veces
  // (la marca "x4" de la hoja) y el saludo. Ordenar los recuadros por su borde superior
  // deja el de agacharse (más bajo) en el índice 10, después de los de impaciencia.
  var A = {
    idle: [0, 1, 2, 3, 4], wait: [6, 7, 8, 7, 8, 7, 8, 7, 8, 9], duck: [10], up: [5],
    walk: [11, 12, 13, 14, 15, 16, 17, 18], run: [19, 20],
    walk45: [22, 23, 24, 25, 26, 27, 28, 29], run45: [30, 31], skid: [32],
    push: [33, 34, 35, 36], fly: [37, 38], tired: [39, 40], hit: [41], dead: [42],
    fall: [43, 44, 45, 46], rise: [47, 48, 49, 50], roll: [51, 52, 53, 54],
    dash: [56, 57, 58], spring: [21], turn: [51]
  };
  var BALL = { fall: 1, rise: 1, roll: 1, dash: 1, turn: 1 };
  var cur = null, idx = 0, tim = 0;

  function pick() {
    var st = ram[R.STATE], g = ram[R.GSPD], f = T.flying();
    if (st === 9) return ['dead', 99];
    if (st === 0x0A) return ['hit', 99];
    if (f) return f === 2 ? ['tired', 8] : ['fly', ram[R.PFLAGS] & 4 ? 2 : 4];
    if (st === 8) return [ram[R.PFLAGS] & 4 ? 'rise' : 'fall', 3];
    if (st === 0x20) return ['roll', Math.max(1, 5 - (g >> 6))];
    if (st === 0x1F) return ['dash', 2];
    if (st === 0x0B) return ['duck', 99];
    if (st === 0x0C) return ['up', 99];
    if (st === 7) return ['skid', 99];
    if (st === 0x0D) return ['push', 10];
    if (st === 6) return ['spring', 99];
    if (st === 1 || g) {
      var rot = ram[R.LOOP] === 0x19 || ram[R.LOOP] === 0x20;
      if (g >= 0xC0) return [rot ? 'run45' : 'run', 2];
      return [rot ? 'walk45' : 'walk', Math.max(2, 8 - (g >> 5))];
    }
    return ram[R.IDLE] >= 0x0C ? ['wait', 16] : ['idle', 8];
  }

  // Inclinación (grados, antihorario) y hacia dónde mira según los cuadros girados de
  // Somari: LOOP $19/$20 = 45° mirando a la derecha/izquierda, $14 = 90°; los bits de
  // $23 los espejan (horizontal: t -> -t; vertical: t -> 180 - t).
  function orient() {
    var L = ram[R.LOOP], fl = ram[0x23], t = 0, left = false;
    // la bola de Somari (animación 8, salto) es simétrica y su máscara en $8000 no deja
    // pasar el bit de orientación a $23: se toma de donde lo tomaría el juego
    if (!(SM.rom.b(0x1C, 0x8000 + ram[R.ANIM]) & 0x40) && ram[R.STATE] !== 9)
      fl |= (L ? ram[R.ANGLE] : ram[R.PFLAGS]) & 0x40;
    if (L === 0x19) t = 45;
    else if (L === 0x20) { t = 45; left = true; }
    else if (L === 0x14) t = 90;
    if (fl & 0x40) { t = -t; left = !left; }
    if (fl & 0x80) { t = 180 - t; left = !left; }
    return [((t % 360) + 360) % 360, left];
  }

  function s16(hi, lo) { var v = (hi << 8) | lo; return v >= 0x8000 ? v - 0x10000 : v; }

  // Reemplaza las entradas [from, to) del metasprite de Somari por el cuadro de Tails.
  T.replace = function (from, to) {
    if (!T.active() || to <= from) return;
    var S = SM.Spr, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, i;
    for (i = from; i < to; i++) {
      if (!S.on[i]) continue;
      x0 = Math.min(x0, S.x[i]); x1 = Math.max(x1, S.x[i] + 8);
      y0 = Math.min(y0, S.y[i]); y1 = Math.max(y1, S.y[i] + 8);
      S.on[i] = 0;
    }
    if (x0 > x1) return;
    var p = pick();
    // entre subir y caer se usa el primer cuadro de rodar para girar (nota de la hoja)
    if (p[0] === 'fall' && cur === 'rise') p = ['turn', 4];
    else if (p[0] === 'fall' && cur === 'turn' && tim > 1) p = ['turn', 4];
    if (p[0] !== cur) { cur = p[0]; idx = 0; tim = p[1]; }
    else if (--tim <= 0) { idx++; tim = p[1]; }
    var seq = A[cur], fr = seq[idx % seq.length];
    var o = orient(), t = o[0], left = o[1], hf, k, fi = info[fr] || frameInfo(fr);
    var rot45 = cur === 'walk45' || cur === 'run45';
    if (t % 90 === 0 && !rot45) { hf = left; k = t / 90; }
    else if (rot45 && t % 90 === 45) { hf = left; k = (((left ? t + 45 : t - 45) / 90) + 4) & 3; }
    else { hf = left; k = Math.round(t / 90) & 3; }
    var img = image(fr, hf, k), ax, ay, dx, dy;
    if (BALL[cur]) { ax = fi.bx; ay = fi.by; }
    else if (t || rot45) { ax = (fi.x0 + fi.x1) / 2; ay = (fi.y0 + fi.y1) / 2; }
    // los recuadros de 40 px de ancho (el paso más largo de caminar) tienen el cuerpo en
    // los 32 px de la izquierda: centrar en w/2 lo movía 4 px en ese cuadro
    else { ax = Math.min(fi.w, 32) / 2; ay = fi.y1; }
    if (hf) ax = fi.w - ax;
    var q = pt(ax, ay, fi.w, fi.h, k, 0);
    if (BALL[cur] || t) { dx = (x0 + x1) / 2; dy = (y0 + y1) / 2 + 1; }
    else { dx = s16(ram[R.PSCR_XH], ram[R.PSCR_X]); dy = s16(ram[R.PSCR_YH], ram[R.PSCR_Y]) + 1; }
    S.img = { i: from, im: img, x: Math.round(dx - q[0]), y: Math.round(dy - q[1]) };
  };
})();
