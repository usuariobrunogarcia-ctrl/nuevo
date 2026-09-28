// Arranque: carga del ROM, entrada (teclado / mando), escalado y relación de aspecto.
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var J = SM.JOY;
  var keymap = {
    ArrowUp: J.UP, ArrowDown: J.DOWN, ArrowLeft: J.LEFT, ArrowRight: J.RIGHT,
    KeyW: J.UP, KeyS: J.DOWN, KeyA: J.LEFT, KeyD: J.RIGHT,
    KeyZ: J.A, KeyK: J.A, Space: J.A, KeyX: J.B, KeyJ: J.B,
    Enter: J.START, ShiftRight: J.SELECT, Backspace: J.SELECT
  };
  var keys = 0, touch = 0;

  function padState() {
    var v = 0, pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (!p) continue;
      var b = function (k) { return p.buttons[k] && p.buttons[k].pressed; };
      if (b(0)) v |= J.A;
      if (b(1) || b(2)) v |= J.B;
      if (b(9)) v |= J.START;
      if (b(8)) v |= J.SELECT;
      if (b(12) || p.axes[1] < -0.5) v |= J.UP;
      if (b(13) || p.axes[1] > 0.5) v |= J.DOWN;
      if (b(14) || p.axes[0] < -0.5) v |= J.LEFT;
      if (b(15) || p.axes[0] > 0.5) v |= J.RIGHT;
    }
    return v;
  }

  // ---- relación de aspecto ----
  var settings = { wide: false, smooth: false, s3: false };
  try {
    var s = JSON.parse(localStorage.getItem('somari-settings') || '{}');
    if (s) { settings.wide = !!s.wide; settings.s3 = !!s.s3; }
  } catch (e) {}
  function save() { try { localStorage.setItem('somari-settings', JSON.stringify(settings)); } catch (e) {} }

  function layout() {
    var cv = document.getElementById('screen');
    var ww = window.innerWidth, wh = window.innerHeight;
    var W = 256;
    if (settings.wide) {
      W = Math.round(240 * ww / wh);
      if (W < 256) W = 256;
      if (W > 512) W = 512;
      W &= ~1;
    }
    SM.Render.resize(W);
    SM.Game.wide = settings.wide;
    var scale = Math.min(ww / W, wh / 240);
    cv.style.width = Math.floor(W * scale) + 'px';
    cv.style.height = Math.floor(240 * scale) + 'px';
    var b = document.getElementById('aspect');
    if (b) b.textContent = settings.wide ? 'Vista: panorámica (' + W + '×240)' : 'Vista: original (256×240)';
  }
  SM.toggleWide = function () { settings.wide = !settings.wide; save(); layout(); };

  // ---- física: original de Somari o mejorada (port de Sonic 3) ----
  function physicsLabel() {
    var b = document.getElementById('physics');
    if (b) b.textContent = settings.s3 ? 'Física: Sonic 3' : 'Física: original';
  }
  SM.setPhysics = function (on) {
    settings.s3 = !!on;
    if (settings.s3 && !SM.S3.enabled && SM.Level.layout) SM.S3.reset();
    SM.S3.enabled = settings.s3;
    save(); physicsLabel();
  };
  SM.togglePhysics = function () { SM.setPhysics(!settings.s3); };

  // ---- bucle de 60 Hz con paso fijo ----
  var acc = 0, last = 0, STEP = 1000 / 60.0988;
  function loop(t) {
    requestAnimationFrame(loop);
    if (!last) last = t;
    acc += Math.min(t - last, 100);
    last = t;
    var n = 0;
    while (acc >= STEP && n < 4) {
      SM.Game.joy = keys | touch | padState();
      if (SM.Game.scene) SM.Game.scene();
      acc -= STEP; n++;
    }
    if (n) SM.Render.present();
  }

  function begin(rom) {
    SM.rom = rom;
    document.getElementById('loader').style.display = 'none';
    SM.Render.init(document.getElementById('screen'));
    layout();
    if (SM.Sound) SM.Sound.init();
    SM.Title.start();
    requestAnimationFrame(loop);
  }

  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyP' || e.code === 'F2') { SM.toggleWide(); e.preventDefault(); return; }
    if (e.code === 'KeyF' || e.code === 'F3') { SM.togglePhysics(); e.preventDefault(); return; }
    if (e.code === 'KeyM') { SM.Sound && SM.Sound.toggleMute(); return; }
    var k = keymap[e.code];
    if (k) { keys |= k; e.preventDefault(); }
    if (SM.Sound) SM.Sound.resume();
  });
  window.addEventListener('keyup', function (e) {
    var k = keymap[e.code];
    if (k) { keys &= ~k; e.preventDefault(); }
  });
  window.addEventListener('blur', function () { keys = 0; });
  window.addEventListener('resize', function () { if (SM.Render.canvas) layout(); });

  // controles táctiles
  function bindTouch() {
    var els = document.querySelectorAll('[data-btn]');
    Array.prototype.forEach.call(els, function (el) {
      var bit = J[el.getAttribute('data-btn')];
      var on = function (e) { touch |= bit; e.preventDefault(); if (SM.Sound) SM.Sound.resume(); };
      var off = function (e) { touch &= ~bit; e.preventDefault(); };
      el.addEventListener('touchstart', on); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
      el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
    });
  }

  window.addEventListener('load', function () {
    bindTouch();
    var ab = document.getElementById('aspect');
    if (ab) ab.addEventListener('click', function () { SM.toggleWide(); });
    var pb = document.getElementById('physics');
    if (pb) pb.addEventListener('click', function () { SM.togglePhysics(); });
    SM.S3.enabled = settings.s3;
    physicsLabel();
    SM.loadRom(begin, function (useFile) {
      var ld = document.getElementById('loader');
      ld.style.display = 'flex';
      var inp = document.getElementById('romfile');
      inp.addEventListener('change', function () { if (inp.files[0]) useFile(inp.files[0]); });
      ld.addEventListener('dragover', function (e) { e.preventDefault(); });
      ld.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) useFile(e.dataTransfer.files[0]); });
    });
  });
})();
