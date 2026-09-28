// APU de la NES (2 pulsos, triángulo y ruido; el driver de Somari no usa DMC).
// NesPlayer es autocontenido: se serializa con toString() para correr dentro de un AudioWorklet,
// y en navegadores sin AudioWorklet se usa tal cual en un ScriptProcessorNode.
'use strict';
var SM = window.SM || (window.SM = {});

SM.NesPlayer = function NesPlayer(sampleRate) {
  var CLOCK = 1789773, FPS = 60.0988;
  var cps = CLOCK / sampleRate;                  // ciclos de CPU por muestra
  var spf = sampleRate / FPS;                    // muestras por cuadro

  var LEN = [10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
    12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30];
  var DUTY = [[0, 1, 0, 0, 0, 0, 0, 0], [0, 1, 1, 0, 0, 0, 0, 0], [0, 1, 1, 1, 1, 0, 0, 0], [1, 0, 0, 1, 1, 1, 1, 1]];
  var TRI = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  var NOISE = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];

  function env() { return { start: false, div: 0, decay: 0, loop: false, cst: false, vol: 0 }; }
  function pulse(ones) {
    return { on: false, duty: 0, timer: 0, cnt: 0, seq: 0, len: 0, halt: false, e: env(),
      swEn: false, swPer: 0, swNeg: false, swShift: 0, swDiv: 0, swReload: false, ones: ones };
  }
  var p1 = pulse(true), p2 = pulse(false);
  var tri = { on: false, timer: 0, cnt: 0, seq: 0, len: 0, ctrl: false, lin: 0, linLoad: 0, linReload: false };
  var noi = { on: false, per: 4, cnt: 0, sr: 1, mode: false, len: 0, halt: false, e: env() };
  var fcCnt = 0, fcStep = 0, fc5 = false;

  function envClock(e) {
    if (e.start) { e.start = false; e.decay = 15; e.div = e.vol; return; }
    if (e.div) { e.div--; return; }
    e.div = e.vol;
    if (e.decay) e.decay--; else if (e.loop) e.decay = 15;
  }
  function envOut(e) { return e.cst ? e.vol : e.decay; }
  function swTarget(p) {
    var d = p.timer >> p.swShift;
    return p.swNeg ? p.timer - d - (p.ones ? 1 : 0) : p.timer + d;
  }
  function swClock(p) {
    var t = swTarget(p);
    if (p.swDiv === 0 && p.swEn && p.swShift && p.timer >= 8 && t <= 0x7FF) p.timer = t;
    if (p.swDiv === 0 || p.swReload) { p.swDiv = p.swPer; p.swReload = false; } else p.swDiv--;
  }
  function quarter() {
    envClock(p1.e); envClock(p2.e); envClock(noi.e);
    if (tri.linReload) tri.lin = tri.linLoad; else if (tri.lin) tri.lin--;
    if (!tri.ctrl) tri.linReload = false;
  }
  function half() {
    if (p1.len && !p1.halt) p1.len--;
    if (p2.len && !p2.halt) p2.len--;
    if (tri.len && !tri.ctrl) tri.len--;
    if (noi.len && !noi.halt) noi.len--;
    swClock(p1); swClock(p2);
  }

  function write(a, v) {
    var p;
    switch (a) {
      case 0x00: case 0x04:
        p = a ? p2 : p1;
        p.duty = v >> 6; p.halt = p.e.loop = !!(v & 0x20); p.e.cst = !!(v & 0x10); p.e.vol = v & 15; break;
      case 0x01: case 0x05:
        p = a === 1 ? p1 : p2;
        p.swEn = !!(v & 0x80); p.swPer = (v >> 4) & 7; p.swNeg = !!(v & 8); p.swShift = v & 7; p.swReload = true; break;
      case 0x02: case 0x06:
        p = a === 2 ? p1 : p2; p.timer = (p.timer & 0x700) | v; break;
      case 0x03: case 0x07:
        p = a === 3 ? p1 : p2;
        p.timer = (p.timer & 0xFF) | ((v & 7) << 8);
        if (p.on) p.len = LEN[v >> 3];
        p.seq = 0; p.e.start = true; break;
      case 0x08: tri.ctrl = !!(v & 0x80); tri.linLoad = v & 0x7F; break;
      case 0x0A: tri.timer = (tri.timer & 0x700) | v; break;
      case 0x0B:
        tri.timer = (tri.timer & 0xFF) | ((v & 7) << 8);
        if (tri.on) tri.len = LEN[v >> 3];
        tri.linReload = true; break;
      case 0x0C: noi.halt = noi.e.loop = !!(v & 0x20); noi.e.cst = !!(v & 0x10); noi.e.vol = v & 15; break;
      case 0x0E: noi.mode = !!(v & 0x80); noi.per = NOISE[v & 15]; break;
      case 0x0F: if (noi.on) noi.len = LEN[v >> 3]; noi.e.start = true; break;
      case 0x15:
        p1.on = !!(v & 1); p2.on = !!(v & 2); tri.on = !!(v & 4); noi.on = !!(v & 8);
        if (!p1.on) p1.len = 0;
        if (!p2.on) p2.len = 0;
        if (!tri.on) tri.len = 0;
        if (!noi.on) noi.len = 0;
        break;
      case 0x17: fc5 = !!(v & 0x80); fcCnt = 0; fcStep = 0; if (fc5) { quarter(); half(); } break;
    }
  }

  // Salida media de cada canal durante `cyc` ciclos (integra los flancos: antialiasing barato)
  function pulseAvg(p, cyc) {
    if (!p.len || p.timer < 8 || (!p.swNeg && swTarget(p) > 0x7FF)) return 0;
    var vol = envOut(p.e), d = DUTY[p.duty], per = (p.timer + 1) * 2, acc = 0, left = cyc;
    while (left > p.cnt) {
      acc += d[p.seq] * p.cnt; left -= p.cnt;
      p.seq = (p.seq + 1) & 7; p.cnt = per;
    }
    acc += d[p.seq] * left; p.cnt -= left;
    return vol * acc / cyc;
  }
  function triAvg(cyc) {
    if (tri.timer < 2) return 7.5;                          // ultrasónico: nivel medio, sin chasquidos
    if (!tri.len || !tri.lin) return TRI[tri.seq];          // detenido: mantiene el nivel
    var per = tri.timer + 1, acc = 0, left = cyc;
    while (left > tri.cnt) {
      acc += TRI[tri.seq] * tri.cnt; left -= tri.cnt;
      tri.seq = (tri.seq + 1) & 31; tri.cnt = per;
    }
    acc += TRI[tri.seq] * left; tri.cnt -= left;
    return acc / cyc;
  }
  function noiseAvg(cyc) {
    var vol = noi.len ? envOut(noi.e) : 0, acc = 0, left = cyc, per = noi.per;
    var sh = noi.mode ? 6 : 1;
    while (left > noi.cnt) {
      acc += (noi.sr & 1 ? 0 : 1) * noi.cnt; left -= noi.cnt;
      var fb = (noi.sr ^ (noi.sr >> sh)) & 1;
      noi.sr = (noi.sr >> 1) | (fb << 14);
      noi.cnt = per;
    }
    acc += (noi.sr & 1 ? 0 : 1) * left; noi.cnt -= left;
    return vol * acc / cyc;
  }

  // ---- cola de cuadros enviada por el hilo principal ----
  var queue = [], frameLeft = 0, starve = 0, level = 0, hp = 0, lpPrev = 0, lp = 0;
  // filtros como los de la consola: pasa-altos ~37 Hz y pasa-bajos ~14 kHz
  var hpA = Math.exp(-2 * Math.PI * 37 / sampleRate), lpA = 1 - Math.exp(-2 * Math.PI * 14000 / sampleRate);

  this.push = function (w) { queue.push(w); };
  this.reset = function (regs) {
    queue.length = 0;
    for (var i = 0; i < regs.length; i += 2) write(regs[i], regs[i + 1]);
  };
  function nextFrame() {
    // mantener la latencia acotada: si se acumulan cuadros, se aplican de golpe
    while (queue.length > 4) { var old = queue.shift(); for (var j = 0; j < old.length; j += 2) write(old[j], old[j + 1]); }
    if (queue.length) {
      var w = queue.shift();
      for (var i = 0; i < w.length; i += 2) write(w[i], w[i + 1]);
      starve = 0;
    } else starve++;
  }
  this.render = function (out) {
    for (var i = 0; i < out.length; i++) {
      if (frameLeft <= 0) { nextFrame(); frameLeft += spf; }
      frameLeft--;
      // secuenciador de cuadro (240 Hz)
      fcCnt += cps;
      if (fcCnt >= 7457.5) {
        fcCnt -= 7457.5;
        var steps = fc5 ? 5 : 4;
        if (!(fc5 && fcStep === 3)) quarter();
        if (fcStep === 1 || fcStep === steps - 1) half();
        fcStep = (fcStep + 1) % steps;
      }
      var a1 = pulseAvg(p1, cps), a2 = pulseAvg(p2, cps), t = triAvg(cps), n = noiseAvg(cps);
      var ps = a1 + a2, sq = ps ? 95.88 / (8128 / ps + 100) : 0;
      var tn = t / 8227 + n / 12241, tnd = tn ? 159.79 / (1 / tn + 100) : 0;
      var s = sq + tnd;
      // si el juego deja de mandar cuadros (pausa, pestaña oculta) se apaga suavemente
      var target = starve > 3 ? 0 : 1;
      level += (target - level) * 0.002;
      hp = hpA * (hp + s - lpPrev); lpPrev = s;
      lp += lpA * (hp - lp);
      out[i] = lp * level * 1.6;
    }
  };
};

// Código del AudioWorklet (se arma a partir de NesPlayer para no duplicarlo)
SM.NesPlayer.workletSource = function () {
  return 'var NesPlayer = ' + SM.NesPlayer.toString() + ';\n' +
    'registerProcessor("nes-apu", class extends AudioWorkletProcessor {\n' +
    '  constructor() { super(); var p = this.p = new NesPlayer(sampleRate);\n' +
    '    this.port.onmessage = function (e) { if (e.data.reset) p.reset(e.data.reset); else p.push(e.data); }; }\n' +
    '  process(inp, outs) { var o = outs[0]; this.p.render(o[0]); for (var c = 1; c < o.length; c++) o[c].set(o[0]); return true; }\n' +
    '});\n';
};
