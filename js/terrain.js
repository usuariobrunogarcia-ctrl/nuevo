// Terreno para la física de Sonic 3 (modo "física mejorada").
// Somari no guarda mapas de alturas: cada tipo de metatile tiene un manejador que corrige
// la posición de un sensor. Aquí se obtiene la forma sólida de cada metatile sondeando
// esos mismos manejadores (collision.js) píxel por píxel, y a partir de la máscara se
// arman bloques al estilo de Sonic 3: mapa de alturas (vertical), mapa de anchos
// (horizontal), ángulo y solidez superior / total. Hay dos capas (la de Somari en $8B),
// usadas por los loops.
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R;
  var T = SM.Terrain = {};

  // Manejadores que no son terreno sino efectos (se tratan aparte en s3.js)
  var FX = {
    '17:8f72': 'ring', '16:8e4a': 'layer', '17:8c29': 'spikes', '17:8c80': 'spikes', '17:8c93': 'spikesUp',
    '17:8259': 'spring', '17:8309': 'springSide', '17:8df6': 'launchUp', '17:8e62': 'launcher',
    '17:8e09': 'ramp', '17:8dc2': 'reverse', '17:8650': 'tube', '17:8733': 'tube', '17:87be': 'tube',
    '17:85a8': 'water', '17:85cc': 'slide', '17:8639': 'slide', '17:83b2': 'script'
  };
  function handlerOf(t) {
    var b = (t & 0x80) ? 0x17 : 0x16;
    return b.toString(16) + ':' + SM.rom.w(b, 0x801D + (t & 0x7E)).toString(16);
  }

  // Tramos de loop: Somari los resuelve con estados especiales, no con una curva; para la
  // física de S3 se usa la forma dibujada (la curva del gráfico) en la capa en que son sólidos.
  var LOOP = { '16:8aaf': 1, '16:8cc9': 1, '16:8d64': 1, '16:8e67': 1 };
  function gfxMask(m) {
    var L = SM.Level, banks = [ram[R.CHR2], ram[R.CHR3], ram[R.CHR4], ram[R.BGANIM]];
    var out = new Uint8Array(256);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var t = L.mtTiles[m * 4 + ((y & 8) ? 2 : 0) + ((x & 8) ? 1 : 0)];
      if (SM.rom.tile(banks[t >> 6], t)[(y & 7) * 8 + (x & 7)]) out[y * 16 + x] = 3;
    }
    return out;
  }
  // rellena píxeles sueltos que el sondeo deja vacíos dentro de una zona sólida
  function closeHoles(m) {
    for (var pass = 0; pass < 2; pass++) {
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var i = y * 16 + x;
        if (m[i]) continue;
        var l = x > 0 ? m[i - 1] : 0, r = x < 15 ? m[i + 1] : 0;
        var u = y > 0 ? m[i - 16] : 0, d = y < 15 ? m[i + 16] : 0;
        if (l && r) m[i] = l & r ? (l & r) : 1;
        else if (u && d) m[i] = u & d ? (u & d) : 1;
      }
    }
    return m;
  }

  var cache = {}, queue = [];
  // Al empezar un acto se encolan todos los bloques del mapa; se calculan de a poco
  // (T.idle, unos ms por cuadro) para que no haya tirones al llegar a zonas nuevas.
  T.reset = function () {
    cache = {}; queue = []; loopChunk = {}; edgeCache = {}; decoCache = {};
    var L = SM.Level, seen = {};
    if (!L.layout) return;
    for (var i = 0; i < 256; i++) {
      var cid = L.layout[i], cb = (cid & 0x20) ? L.chunkB : L.chunkA;
      for (var k = 0; k < 240; k++) {
        var m = cb[(cid & 0x1F) * 256 + k], key = m + ':' + (cid >= 0x3D ? 1 : 0);
        if (seen[key]) continue;
        seen[key] = 1; queue.push([m, cid]);
      }
    }
  };
  T.idle = function (ms) {
    var t0 = Date.now();
    while (queue.length && Date.now() - t0 < ms) {
      var q = queue.pop();
      T.block(q[0], q[1], 0); T.block(q[0], q[1], 1);
    }
  };

  // Sonda: pone el sensor en el píxel (x, y) del tile, con un contexto de movimiento, y
  // ejecuta el manejador original. Devuelve la reacción:
  //   0 = no hace nada; 'u' = empuja hacia arriba (suelo); 'd' = hacia abajo (techo);
  //   'l' = hacia la izquierda (pared a la derecha); 'r' = hacia la derecha.
  var BASE_X = 0x1000, BASE_Y = 0x10 * 240 + 0x80;   // tile de prueba (lejos del jugador)
  var zp = new Uint8Array(0x100), page3 = new Uint8Array(0x100);
  function probe(t, chunk, layer, x, y, ctx) {
    zp.set(ram.subarray(0, 0x100)); page3.set(ram.subarray(0x300, 0x400));
    ram[R.SX_HI] = BASE_X >> 8; ram[R.SX_LO] = (BASE_X & 0xFF) | x;
    ram[R.SY_HI] = 0x10; ram[R.SY_LO] = 0x80 | y;
    // "jugador" en otro tile para que los empujes hacia su lado se activen
    ram[R.PX_HI] = ram[R.SX_HI]; ram[R.PY_HI] = ram[R.SY_HI];
    ram[R.PX_LO] = ram[R.SX_LO]; ram[R.PY_LO] = ram[R.SY_LO];
    if (ctx === 0) { ram[R.PFLAGS] = 0; ram[R.VSPD] = 0x10; ram[R.PY_LO] = 0x60; }          // cayendo
    else if (ctx === 1) { ram[R.PFLAGS] = 4; ram[R.VSPD] = 0x10; ram[R.PY_LO] = 0xA0; }     // subiendo
    else if (ctx === 2) { ram[R.PFLAGS] = 0; ram[R.VSPD] = 0; ram[R.PX_LO] = (BASE_X & 0xFF) - 0x10; ram[R.PX_HI] = (BASE_X - 0x10) >> 8; } // hacia la derecha
    else { ram[R.PFLAGS] = 0x41; ram[R.VSPD] = 0; ram[R.PX_LO] = (BASE_X & 0xFF) + 0x10; }  // hacia la izquierda
    ram[R.GSPD] = 0x20; ram[R.HIT] = 1; ram[R.AGAIN] = 0;
    ram[R.HURT] = 1;                    // los pinchos no lastiman durante el sondeo
    ram[R.COL_TYPE] = t; ram[R.COL_CHUNK] = chunk; ram[R.COL_8B] = layer;
    ram[R.COL_ROW] = (t & 0x80) ? SM.rom.b(0x17, 0x8B79 + (t & 15)) : SM.rom.b(0x16, 0x92BF + (t & 15));
    ram[R.T25] = 0;
    SM.Collision.dispatch();
    var sx = (ram[R.SX_HI] << 8) | ram[R.SX_LO], sy = ram[R.SY_LO] - 0x80 + (ram[R.SY_HI] - 0x10) * 256;
    var dx = sx - (BASE_X | x), dy = sy - y, r = 0;
    if (dy < 0) r = 'u'; else if (dy > 0) r = 'd';
    else if (dx < 0) r = 'l'; else if (dx > 0) r = 'r';
    else if (ram[R.AGAIN] && ram[R.AGAIN] !== 0xF0) r = 'u';
    ram.set(zp, 0); ram.set(page3, 0x300);
    return r;
  }

  // Máscara 16x16 de un metatile (2 bits por píxel: 1 = sólido desde arriba, 2 = sólido total)
  function buildMask(t, chunk, layer) {
    var save = ram.slice(0);            // (por las dudas, se restaura toda la RAM al final)
    var top = new Uint8Array(256), all = new Uint8Array(256);
    for (var ctx = 0; ctx < 4; ctx++) {
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var r = probe(t, chunk, layer, x, y, ctx);
        if (!r) continue;
        var i, k;
        if (r === 'u') {           // suelo: sólido desde aquí hacia abajo
          for (k = y; k < 16; k++) { i = k * 16 + x; if (ctx === 1) all[i] = 1; else top[i] = 1; }
        } else if (r === 'd') {    // techo: sólido desde aquí hacia arriba
          for (k = y; k >= 0; k--) all[k * 16 + x] = 1;
        } else if (r === 'l') {    // lo empuja a la izquierda: sólido hacia la derecha
          for (k = x; k < 16; k++) all[y * 16 + k] = 1;
        } else {
          for (k = x; k >= 0; k--) all[y * 16 + k] = 1;
        }
      }
    }
    ram.set(save, 0);
    var m = new Uint8Array(256);
    for (var j = 0; j < 256; j++) m[j] = all[j] ? 3 : (top[j] ? 1 : 0);
    return m;
  }

  // Bloque al estilo S3 a partir de la máscara. Alturas (verticales) y anchos (horizontales)
  // con la convención de S3: positivo = sólido desde abajo / desde la derecha, negativo =
  // desde arriba / desde la izquierda, 16 = columna llena. Las versiones "T" cuentan todo lo
  // sólido (para la solidez superior) y las "A" sólo lo sólido por todos lados.
  function heights(mask, bit, vertical) {
    var out = new Int8Array(16);
    for (var c = 0; c < 16; c++) {
      var first = -1, last = -1;
      for (var k = 0; k < 16; k++) {
        var v = vertical ? mask[k * 16 + c] : mask[c * 16 + k];
        if (v & bit) { if (first < 0) first = k; last = k; }
      }
      if (first < 0) out[c] = 0;
      else if (last === 15) out[c] = 16 - first;
      else if (first === 0) out[c] = -(last + 1);
      else out[c] = 16 - first;
    }
    return out;
  }
  function makeBlock(mask) {
    var n = 0, ne = 0, sx = 0, sy = 0, ex = 0, ey = 0, lrb = false;
    for (var i = 0; i < 256; i++) {
      var px = i & 15, py = i >> 4;
      if (mask[i]) { n++; sx += px; sy += py; if (mask[i] & 2) lrb = true; }
      else { ne++; ex += px; ey += py; }
    }
    if (!n) return null;
    var angle;
    if (!ne) angle = 0xFF;                     // bloque lleno: ángulo "impar" (S3 usa el cardinal)
    else {
      // normal: del centro de lo sólido al centro de lo vacío; el ángulo es el de la tangente
      var nx = ex / ne - sx / n, ny = ey / ne - sy / n;
      angle = Math.round(Math.atan2(nx, -ny) / (2 * Math.PI) * 256) & 0xFF;
      if (angle & 1) angle = (angle + 1) & 0xFF;   // los ángulos impares tienen otro significado en S3
    }
    return {
      hmT: heights(mask, 3, true), hmA: heights(mask, 2, true),
      wmT: heights(mask, 3, false), wmA: heights(mask, 2, false),
      angle: angle, top: true, lrb: lrb, mask: mask
    };
  }

  // Bloque del metatile m en un chunk (el manejador depende del número de chunk) y capa
  // ¿El chunk contiene un loop? Los tipos "curvos" de Somari ($50-$77) también se usan en
  // arcos y adornos; sólo los loops tienen tramos que cambian según la capa.
  var loopChunk = {};
  function isLoopChunk(cid) {
    if (loopChunk[cid] !== undefined) return loopChunk[cid];
    var L = SM.Level, cb = (cid & 0x20) ? L.chunkB : L.chunkA, res = false, done = {};
    for (var k = 0; k < 240 && !res; k++) {
      var m = cb[(cid & 0x1F) * 256 + k], t = L.mtCol[m];
      if (done[m] || !LOOP[handlerOf(t)]) continue;
      done[m] = 1;
      var a = buildMask(t, cid, 0), b = buildMask(t, cid, 1);
      for (var i = 0; i < 256; i++) if (a[i] !== b[i]) { res = true; break; }
    }
    loopChunk[cid] = res;
    return res;
  }
  T.block = function (m, chunk, layer) {
    var t = SM.Level.mtCol[m], h = handlerOf(t), curved = !!LOOP[h] || (t >= 0x50 && t < 0x78);
    var inLoop = curved && isLoopChunk(chunk);
    var key = m + ':' + (chunk >= 0x3D ? 1 : 0) + ':' + (layer ? 1 : 0) + ':' + (inLoop ? 1 : 0);
    var b = cache[key];
    if (b !== undefined) return b;
    var fx = FX[h];
    if (fx && fx !== 'spikes' && fx !== 'spring' && fx !== 'springSide') b = null;
    else {
      var mask = closeHoles(buildMask(t, chunk, layer)), i;
      if (inLoop && LOOP[h]) {
        var any = false;
        for (i = 0; i < 256; i++) if (mask[i]) { any = true; break; }
        if (any) mask = gfxMask(m);
      } else if (curved && !inLoop) {
        // arcos y adornos: sólo el piso que se puede pisar (sin techos ni paredes), y sólo
        // donde arriba de la superficie no hay dibujo (en un arco lo que queda arriba es la
        // piedra del propio arco)
        var g = gfxMask(m);
        for (i = 0; i < 256; i++) mask[i] &= 1;
        for (var c = 0; c < 16; c++) {
          var y0 = 0;
          while (y0 < 16 && !mask[y0 * 16 + c]) y0++;
          if (y0 === 0 || y0 === 16) continue;
          // arco: todo lo dibujado encima de la superficie (hasta 4 px) es piedra
          var solidAbove = true;
          for (var k = 1; k <= 4 && y0 - k >= 0; k++) if (!g[(y0 - k) * 16 + c]) { solidAbove = false; break; }
          if (solidAbove && y0 >= 4) for (var y = 0; y < 16; y++) mask[y * 16 + c] = 0;
        }
      }
      b = makeBlock(mask);
      if (b && curved && !inLoop) b.deco = m;
    }
    if (b && fx) b.fx = fx;
    cache[key] = b;
    return b;
  };
  T.effect = function (m) { return FX[handlerOf(SM.Level.mtCol[m])] || null; };

  // Metatile y chunk en coordenadas absolutas (y continua; páginas de 240 px)
  T.cell = function (px, py) {
    var L = SM.Level;
    if (px < 0 || py < 0) return null;
    var yh = Math.floor(py / 240), yl = py - yh * 240;
    var xh = (px >> 8) & 0xFF, xl = px & 0xFF;
    var yi = (ram[R.ROWS + (yh & 0xFF)] + xh) & 0xFF;
    var cid = L.layout[yi];
    var cb = (cid & 0x20) ? L.chunkB : L.chunkA;
    return { m: cb[(cid & 0x1F) * 256 + ((yl & 0xF0) | (xl >> 4))], chunk: cid, ringBase: L.ringIdx[yi] };
  };
  function rawBlock(tx, ty, layer) {
    var c = T.cell(tx * 16, ty * 16);
    return c ? T.block(c.m, c.chunk, layer) : null;
  }
  // Bordes redondeados de las plataformas: el pasto que se curva en el extremo es un
  // adorno; si del lado que baja no sigue ningún piso, el bloque se toma como plano.
  var edgeCache = {};
  function edgeFix(b, tx, ty, layer) {
    var hm = b.hmT, max = 0, c;
    for (c = 0; c < 16; c++) if (hm[c] > max) max = hm[c];
    if (max <= 0 || max === 16 && hm[0] === 16 && hm[15] === 16) return b;
    var l = hm[0] > 0 ? hm[0] : 0, r = hm[15] > 0 ? hm[15] : 0;
    if (Math.abs(l - r) < 3) return b;
    var dir = l < r ? -1 : 1;                       // lado que baja
    var n = rawBlock(tx + dir, ty, layer), nc = dir < 0 ? 15 : 0;
    if (n && n.hmT[nc] > 0) return b;               // el piso sigue al costado
    var nb = rawBlock(tx + dir, ty + 1, layer);
    if (nb && nb.hmT[nc] >= 12) return b;           // una pendiente que baja a la fila siguiente
    var key = b.hmT.join(',') + ':' + max;
    var f = edgeCache[key];
    if (!f) {
      f = Object.assign({}, b);
      f.hmT = new Int8Array(16).fill(max);
      f.angle = 0;
      edgeCache[key] = f;
    }
    return f;
  }
  // Tramo curvo decorativo cuya parte sólida empieza en el borde superior: sólo es piso
  // en las columnas donde el tile de arriba es cielo (si no, es parte de un arco).
  var decoCache = {};
  function decoFix(b, px, py) {
    var up = T.cell(px, py - 16);
    if (!up) return b;
    var key = b.deco + ':' + up.m + ':' + b.hmT.join(',');
    var f = decoCache[key];
    if (f !== undefined) return f;
    var g = gfxMask(up.m), mask = new Uint8Array(b.mask), changed = false;
    for (var c = 0; c < 16; c++) {
      if (!mask[c] || !g[15 * 16 + c] || !g[14 * 16 + c] || !g[13 * 16 + c] || !g[12 * 16 + c]) continue;
      for (var y = 0; y < 16; y++) mask[y * 16 + c] = 0;
      changed = true;
    }
    f = changed ? makeBlock(mask) : b;
    decoCache[key] = f;
    return f;
  }
  T.blockAt = function (px, py, layer) {
    var c = T.cell(px, py);
    if (!c) return null;
    var b = T.block(c.m, c.chunk, layer);
    if (b && b.deco !== undefined) { b = decoFix(b, px, py); if (!b) return null; }
    if (b && !b.lrb && b.angle && b.angle !== 0xFF) b = edgeFix(b, px >> 4, Math.floor(py / 16), layer);
    return b;
  };
})();
