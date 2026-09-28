// Interfaz moderna: fundido a negro suave, menú principal (modo aventura, modo libre,
// opciones) y menú de pausa. Se dibujan en SVG con estilo pixel art sobre el canvas.
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var J = SM.JOY;

  // =================== fundido a negro ===================
  // level: 0 = imagen visible, 1 = negro. Se acerca al objetivo de a poco en cada cuadro.
  var F = SM.Fade = { level: 1, target: 0, speed: 1 / 14, pending: null, el: null };
  F.set = function (t, snap) { F.target = t; if (snap) F.level = t; };
  // oscurece, ejecuta cb con la pantalla en negro y vuelve a aclarar
  F.go = function (cb) {
    if (F.pending) return;
    F.pending = cb; F.target = 1;
  };
  F.busy = function () { return !!F.pending; };
  F.tick = function () {
    var d = F.target - F.level;
    if (Math.abs(d) <= F.speed) F.level = F.target;
    else F.level += d > 0 ? F.speed : -F.speed;
    if (F.pending && F.level >= 1) {
      var cb = F.pending; F.pending = null; F.target = 0;
      cb();
    }
  };
  F.draw = function () {
    if (!F.el) F.el = document.getElementById('fade');
    if (F.el) F.el.style.opacity = F.level.toFixed(3);
  };

  // =================== fuente pixel 5x7 ===================
  var G5 = {
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    'J': ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
    'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
    ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
    '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
    '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
    ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
    '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
    '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....']
  };
  // letras con tilde / eñe: letra base + marca encima
  var MARK = { 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N' };

  // ancho en píxeles de un texto (escala s)
  function textW(str, s) { return str.length * 6 * s - s; }
  // rectángulos de un texto; sombra opcional
  function text(str, x, y, s, col, shadow) {
    var out = '';
    if (shadow) out += text(str, x + s, y + s, s, shadow);
    var path = '';
    str = str.toUpperCase();
    for (var i = 0; i < str.length; i++) {
      var ch = str[i], base = MARK[ch] || ch, g = G5[base] || G5['?'];
      var gx = x + i * 6 * s;
      for (var r = 0; r < 7; r++) for (var c = 0; c < 5; c++)
        if (g[r][c] === '#') path += 'M' + (gx + c * s) + ' ' + (y + r * s) + 'h' + s + 'v' + s + 'h-' + s + 'z';
      if (MARK[ch]) {
        if (ch === 'Ñ') path += 'M' + (gx + s) + ' ' + (y - 2 * s) + 'h' + 3 * s + 'v' + s + 'h-' + 3 * s + 'z';
        else path += 'M' + (gx + 2 * s) + ' ' + (y - 2 * s) + 'h' + 2 * s + 'v' + s + 'h-' + 2 * s + 'z';
      }
    }
    return out + '<path d="' + path + '" fill="' + col + '"/>';
  }
  function rect(x, y, w, h, col, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + col + '"' + (extra || '') + '/>';
  }
  // caja con esquinas recortadas (pixel art)
  function box(x, y, w, h, fill, border) {
    var o = '';
    o += rect(x + 2, y, w - 4, h, border);
    o += rect(x, y + 2, w, h - 4, border);
    o += rect(x + 1, y + 1, w - 2, h - 2, border);
    o += rect(x + 2, y + 1, w - 4, h - 2, fill);
    o += rect(x + 1, y + 2, w - 2, h - 4, fill);
    return o;
  }
  // anillo girando (4 cuadros, 8x8)
  function ring(x, y, f) {
    var shapes = [
      ['..####..', '.##..##.', '##....##', '##....##', '##....##', '##....##', '.##..##.', '..####..'],
      ['..###...', '.##.##..', '.#...#..', '.#...#..', '.#...#..', '.#...#..', '.##.##..', '..###...'],
      ['...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...'],
      ['...###..', '..##.##.', '..#...#.', '..#...#.', '..#...#.', '..#...#.', '..##.##.', '...###..']
    ];
    var g = shapes[f & 3], p = '', q = '';
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) if (g[r][c] === '#') {
      if (r < 3) q += 'M' + (x + c) + ' ' + (y + r) + 'h1v1h-1z';
      else p += 'M' + (x + c) + ' ' + (y + r) + 'h1v1h-1z';
    }
    return '<path d="' + p + '" fill="#e89000"/><path d="' + q + '" fill="#fff080"/>';
  }

  // =================== escena de fondo del menú (pixel art) ===================
  function background(W, t) {
    var o = '', i;
    // cielo en bandas
    var sky = ['#0b1a4a', '#10266a', '#16358c', '#1f48aa', '#2a5dc4', '#3a74d8', '#5590e6', '#78adf0'];
    for (i = 0; i < 8; i++) o += rect(0, i * 18, W, 18, sky[i]);
    // estrellas titilando arriba
    for (i = 0; i < 24; i++) {
      var sx = (i * 73 + 11) % W, sy = (i * 37 + 5) % 60;
      if (((t >> 4) + i) % 5) o += rect(sx, sy, 1, 1, i % 3 ? '#cfe0ff' : '#ffffff');
    }
    // montañas nevadas (escalonadas)
    var mts = [[W * 0.12, 70], [W * 0.38, 90], [W * 0.66, 76], [W * 0.9, 96]];
    for (i = 0; i < mts.length; i++) {
      var mx = Math.round(mts[i][0]), mh = mts[i][1];
      for (var k = 0; k < mh; k += 4) {
        var hw = Math.round(k * 0.9);
        o += rect(mx - hw, 150 - mh + k, hw * 2 + 1, 4, k < 14 ? '#e8f4ff' : (k % 8 ? '#6a8fcf' : '#5b7fbf'));
      }
    }
    // agua con reflejos
    o += rect(0, 150, W, 26, '#2a6ad8');
    for (i = 0; i < W; i += 16) {
      var off = ((t >> 3) + i) % 16;
      o += rect(i + off % 12, 156 + (i % 3) * 6, 6, 1, '#bfe0ff');
    }
    // pasto y tierra a cuadros (Green Hill)
    o += rect(0, 176, W, 64, '#7a3a14');
    for (var y = 184; y < 240; y += 8) for (var x = ((y >> 3) & 1) * 8; x < W; x += 16) o += rect(x, y, 8, 8, '#b85a24');
    o += rect(0, 176, W, 8, '#1e8a1e');
    for (i = 0; i < W; i += 4) o += rect(i, 172 + (i % 8 ? 2 : 0), 2, 6, i % 8 ? '#2fb82f' : '#58d858');
    return o;
  }
  function logo(cx, y) {
    var s = 4, str = 'SOMARI', w = textW(str, s), x = Math.round(cx - w / 2);
    var o = '';
    // contorno
    for (var dx = -2; dx <= 2; dx += 2) for (var dy = -2; dy <= 2; dy += 2)
      if (dx || dy) o += text(str, x + dx, y + dy, s, '#10124a');
    o += text(str, x, y, s, 'url(#gold)');
    var sub = 'WORLD 1 - GREEN HILL', sw = textW(sub, 1);
    o += text(sub, Math.round(cx - sw / 2), y + 34, 1, '#ffffff', '#10124a');
    return o;
  }

  // =================== menús ===================
  var M = SM.Menu = { page: 'main', sel: 0, from: null, t: 0, prevJoy: 0 };
  var PAGES = {
    main: function () {
      return [
        { label: 'MODO AVENTURA', act: function () { startGame(0, 0, false); } },
        { label: 'MODO LIBRE', act: function () { go('free'); } },
        { label: 'OPCIONES', act: function () { go('options'); } }
      ];
    },
    free: function () {
      return [
        { label: 'GREEN HILL - ACTO 1', act: function () { startGame(0, 0, true); } },
        { label: 'GREEN HILL - ACTO 2', act: function () { startGame(0, 1, true); } },
        { label: 'GREEN HILL - ACTO 3', act: function () { startGame(0, 2, true); } },
        { label: 'ETAPA ESPECIAL', act: function () { startGame(7, 0, true); } },
        { label: 'VOLVER', back: true }
      ];
    },
    options: function () {
      var s = SM.settings || {};
      return [
        { label: 'VISTA', value: s.wide ? 'PANORÁMICA' : 'ORIGINAL', toggle: function () { SM.toggleWide(); } },
        { label: 'FÍSICA', value: s.s3 ? 'SONIC 3' : 'ORIGINAL', toggle: function () { SM.togglePhysics(); } },
        { label: 'PUNTERÍA BUZZ BOMBER', value: s.buzzFix ? 'FIXED' : 'ORIGINAL', toggle: function () { SM.toggleSetting('buzzFix'); } },
        { label: 'CANTIDAD DE ENEMIGOS', value: s.fewerEnemies ? 'FIXED' : 'ORIGINAL', toggle: function () { SM.toggleSetting('fewerEnemies'); } },
        { label: 'VOLVER', back: true }
      ];
    },
    pause: function () {
      return [
        { label: 'CONTINUAR', act: resume },
        { label: 'OPCIONES', act: function () { go('options'); } },
        { label: 'VOLVER AL TÍTULO', act: function () { hideUI(); SM.Fade.go(function () { SM.Title.start(); }); } }
      ];
    }
  };
  var TITLES = { main: 'MENÚ PRINCIPAL', free: 'MODO LIBRE', options: 'OPCIONES', pause: 'PAUSA' };
  var stack = [];
  function go(p) { stack.push([M.page, M.sel]); M.page = p; M.sel = 0; M.dirty = true; }
  function back() {
    if (!stack.length) { if (M.page === 'pause') resume(); return; }
    var s = stack.pop(); M.page = s[0]; M.sel = s[1]; M.dirty = true;
  }

  var ui = null;
  function showUI(svg) {
    if (!ui) ui = document.getElementById('ui');
    ui.innerHTML = svg;
    ui.style.display = 'block';
  }
  function hideUI() {
    if (!ui) ui = document.getElementById('ui');
    ui.style.display = 'none'; ui.innerHTML = ''; M.active = false;
  }
  SM.UI = { hide: hideUI };

  function render() {
    var W = SM.Render.W, H = 240, cx = W / 2, items = PAGES[M.page](), o = '';
    var paused = M.page === 'pause' || M.inGame;
    o += '<defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#fff6a0"/><stop offset=".5" stop-color="#ffcf30"/><stop offset="1" stop-color="#e07800"/></linearGradient></defs>';
    if (!paused) {
      o += background(W, M.t);
      o += logo(cx, 22);
    } else {
      o += rect(0, 0, W, H, '#000010', ' opacity="0.55"');
    }
    // panel
    var rowH = 16, bw = 196, bh = 26 + items.length * rowH + 8;
    for (var n = 0; n < items.length; n++) {
      var need = 22 + textW(items[n].label, 1) + (items[n].value ? 14 + textW('< ' + items[n].value + ' >', 1) : 0) + 10;
      if (need > bw) bw = need;
    }
    bw = Math.min(bw, W - 8);
    var bx = Math.round(cx - bw / 2), by = paused ? Math.round((H - bh) / 2) : 86;
    o += box(bx, by, bw, bh, '#0c1440', '#ffffff');
    o += rect(bx + 3, by + 3, bw - 6, 1, '#3050b0');
    var title = TITLES[M.page], tw = textW(title, 1);
    o += text(title, Math.round(cx - tw / 2), by + 8, 1, '#8fd0ff');
    o += rect(bx + 10, by + 19, bw - 20, 1, '#3050b0');
    for (var i = 0; i < items.length; i++) {
      var it = items[i], y = by + 26 + i * rowH, selc = i === M.sel;
      if (selc) {
        o += rect(bx + 6, y - 3, bw - 12, 13, '#1e3aa0');
        o += ring(bx + 9, y - 1, M.t >> 3);
      }
      var col = selc ? '#ffe860' : '#ffffff';
      o += text(it.label, bx + 22, y, 1, col, '#000020');
      if (it.value) {
        var v = '< ' + it.value + ' >', vw = textW(v, 1);
        o += text(v, bx + bw - 10 - vw, y, 1, selc ? '#ffe860' : '#8fd0ff', '#000020');
      }
    }
    // ayuda
    var help = M.page === 'options' ? 'IZQ/DER CAMBIAR   B VOLVER' : 'A/START ACEPTAR   B VOLVER';
    var hw = textW(help, 1);
    o += box(Math.round(cx - hw / 2) - 6, H - 20, hw + 12, 15, '#000020', '#3050b0');
    o += text(help, Math.round(cx - hw / 2), H - 16, 1, '#cfe0ff');
    showUI('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H +
      '" width="100%" height="100%" shape-rendering="crispEdges" preserveAspectRatio="none">' + o + '</svg>');
  }

  // entrada propia (flancos), sin tocar la RAM del juego
  function input() {
    var j = SM.Game.joy, p = (j ^ M.prevJoy) & j;
    M.prevJoy = j;
    return SM.Fade.busy() ? 0 : p;
  }
  function step() {
    M.t++;
    var p = input(), items = PAGES[M.page]();
    if (p & J.UP) { M.sel = (M.sel + items.length - 1) % items.length; M.dirty = true; }
    if (p & J.DOWN) { M.sel = (M.sel + 1) % items.length; M.dirty = true; }
    var it = items[M.sel];
    if (it.toggle && (p & (J.LEFT | J.RIGHT | J.A | J.START))) { it.toggle(); M.dirty = true; }
    else if (p & (J.A | J.START)) { if (it.back) back(); else if (it.act) it.act(); M.dirty = true; }
    else if (p & J.B) { back(); M.dirty = true; }
    if (M.dirty || !(M.t & 7) || M.lastW !== SM.Render.W) {
      M.dirty = false; M.lastW = SM.Render.W;
      if (M.active) render();
    }
  }

  // menú principal (después del título)
  M.open = function (page) {
    M.page = 'main'; M.sel = 0; stack = []; M.inGame = false;
    if (page && page !== 'main') go(page);
    M.prevJoy = SM.Game.joy;
    SM.Render.pal.fill(0x0F); SM.Render.clear();
    SM.Game.freeMode = false;
    SM.Game.scene = function () { step(); SM.Render.clear(); };
    M.active = true; M.dirty = true;
    SM.Fade.set(0);
    render();
  };
  function startGame(zone, act, free) {
    SM.Fade.go(function () {
      hideUI();
      SM.Game.newGame(zone, act);
      SM.Game.freeMode = free;
    });
  }

  // ---------- pausa ----------
  var saved = null;
  function pauseStep() {
    step();
    if (M.needRedraw) { M.needRedraw = false; SM.Game.renderLevel(); }
  }
  M.pause = function () {
    saved = SM.Game.scene;
    M.page = 'pause'; M.sel = 0; stack = []; M.inGame = true;
    M.prevJoy = SM.Game.joy;
    SM.Game.scene = pauseStep;
    M.active = true; M.dirty = true;
    render();
  };
  function resume() {
    hideUI();
    M.inGame = false;
    SM.Game.scene = saved || SM.Game.play;
    // el botón que cerró el menú no cuenta como pulsación nueva dentro del juego
    SM.ram[0x304] = SM.Game.joy;
  }
  // al cambiar la vista durante la pausa hay que redibujar el nivel con el nuevo ancho
  M.onLayout = function () { if (SM.Game.scene === pauseStep) M.needRedraw = true; M.dirty = true; };
})();
