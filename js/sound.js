// Música y efectos: se ejecuta el driver de sonido original del ROM en una CPU 6502 mínima.
//
// En el juego original la NMI ($C6CE) mapea los bancos $1A/$1B en $8000/$A000 y llama a
// $B112 (lee los pedidos de $81 música / $82 efecto) y a $B184 (avanza las pistas y escribe
// en el APU). El reset llama a $B130 (inicialización) y activa el driver con INC $0700.
// Como el port conserva la RAM original, el juego ya escribe los códigos correctos en
// $81/$82; aquí sólo se ejecuta ese código una vez por cuadro y las escrituras a
// $4000-$4017 se mandan al APU emulado (js/apu.js).
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram;
  var S = SM.Sound = { muted: false };

  // Memoria vista por el driver: los pedidos $81/$82 son compartidos con el juego; el resto de
  // la RAM que usa ($83 = música actual, puntero $FE/$FF, pila y $0700-$07FF) es propia, para
  // no pisar al port (que a veces borra toda su RAM, p. ej. al volver al título).
  var own = new Uint8Array(0x800);
  var bank8, bankA, bankC, bankE;
  var regs = new Uint8Array(0x18), writes = [];
  var cpu, ok = false;

  function read(a) {
    if (a < 0x2000) { a &= 0x7FF; return (a === 0x81 || a === 0x82) ? ram[a] : own[a]; }
    if (a >= 0xE000) return bankE[a & 0x1FFF];
    if (a >= 0xC000) return bankC[a & 0x1FFF];
    if (a >= 0xA000) return bankA[a & 0x1FFF];
    if (a >= 0x8000) return bank8[a & 0x1FFF];
    return 0;
  }
  function write(a, v) {
    if (a < 0x2000) { a &= 0x7FF; if (a === 0x81 || a === 0x82) ram[a] = v; else own[a] = v; return; }
    if (a >= 0x4000 && a < 0x4018) { a -= 0x4000; regs[a] = v; writes.push(a, v); }
  }

  // ---- salida de audio ----
  var ctx = null, node = null, gain = null, player = null, needSync = true;

  function startAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { return; }
    gain = ctx.createGain();
    gain.gain.value = S.muted ? 0 : 1;
    gain.connect(ctx.destination);
    if (ctx.audioWorklet && window.Blob && window.URL) {
      var url = URL.createObjectURL(new Blob([SM.NesPlayer.workletSource()], { type: 'application/javascript' }));
      ctx.audioWorklet.addModule(url).then(function () {
        node = new AudioWorkletNode(ctx, 'nes-apu', { numberOfInputs: 0, outputChannelCount: [1] });
        node.connect(gain);
        needSync = true;
      }).catch(scriptProcessor);
    } else scriptProcessor();
  }
  // alternativa para navegadores sin AudioWorklet
  function scriptProcessor() {
    if (!ctx.createScriptProcessor) return;
    player = new SM.NesPlayer(ctx.sampleRate);
    var sp = ctx.createScriptProcessor(1024, 0, 1);
    sp.onaudioprocess = function (e) { player.render(e.outputBuffer.getChannelData(0)); };
    sp.connect(gain);
    node = { port: { postMessage: function (m) { if (m.reset) player.reset(m.reset); else player.push(m); } } };
    needSync = true;
  }
  function post(msg) { if (node) node.port.postMessage(msg); }

  S.init = function () {
    var rom = SM.rom;
    bank8 = rom.bank(0x1A); bankA = rom.bank(0x1B); bankC = rom.bank(0x1E); bankE = rom.bank(0x1F);
    cpu = new SM.CPU6502(read, write);
    own.fill(0);
    try {
      ok = cpu.call(0xB130, 20000);     // inicialización del driver
      own[0x700]++;                     // $C399: INC $0700 (driver activo)
    } catch (e) { ok = false; console.warn('Sonido desactivado:', e); }
    writes.length = 0;
    try { S.muted = localStorage.getItem('somari-mute') === '1'; } catch (e) {}
  };

  // El navegador sólo permite sonar después de una interacción del usuario.
  S.resume = function () {
    if (!ok) return;
    if (!ctx) startAudio();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };

  S.toggleMute = function () {
    S.muted = !S.muted;
    if (gain) gain.gain.setTargetAtTime(S.muted ? 0 : 1, ctx.currentTime, 0.02);
    try { localStorage.setItem('somari-mute', S.muted ? '1' : '0'); } catch (e) {}
  };

  // Un cuadro del driver (lo llama la NMI del port, SM.Game.nmi)
  S.update = function () {
    if (!ok) return;
    writes.length = 0;
    try {
      cpu.call(0xB112, 20000);
      cpu.call(0xB184, 50000);
    } catch (e) { ok = false; console.warn('Sonido desactivado:', e); return; }
    if (!node || !ctx || ctx.state !== 'running') { needSync = true; return; }
    if (needSync) {
      // al arrancar (o volver) el audio, se manda el estado completo de los registros
      var all = [0x15, regs[0x15]];
      for (var r = 0; r < 0x10; r++) if (r !== 0x03 && r !== 0x07 && r !== 0x0B && r !== 0x0F) all.push(r, regs[r]);
      all.push(0x03, regs[0x03], 0x07, regs[0x07], 0x0B, regs[0x0B], 0x0F, regs[0x0F]);
      post({ reset: all });
      needSync = false;
    }
    post(writes.slice());
  };
})();
