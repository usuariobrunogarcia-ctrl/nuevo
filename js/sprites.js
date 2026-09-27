// Tabla de sprites equivalente a la OAM de la NES (64 entradas, cursor en RAM $3C),
// pero con coordenadas de 16 bits: los objetos pueden dibujarse fuera de los 256 px
// originales cuando la vista es panorámica.
'use strict';
var SM = window.SM || (window.SM = {});

SM.Spr = {
  x: new Int16Array(64), y: new Int16Array(64), t: new Uint8Array(64), a: new Uint8Array(64),
  on: new Uint8Array(64),
  // $C7D0: ocultar todo
  clear: function () { this.on.fill(0); SM.ram[0x3C] = 0; },
  // escribe en la entrada del cursor y avanza (STA $0200,X ... ; X += 4)
  push: function (x, y, t, a) {
    var i = SM.ram[0x3C] >> 2;
    this.x[i] = x; this.y[i] = y; this.t[i] = t; this.a[i] = a; this.on[i] = 1;
    SM.ram[0x3C] = (SM.ram[0x3C] + 4) & 0xFF;
  },
  // escribe sin avanzar el cursor (el original lo hace en algunos casos)
  poke: function (x, y, t, a) {
    var i = SM.ram[0x3C] >> 2;
    this.x[i] = x; this.y[i] = y; this.t[i] = t; this.a[i] = a; this.on[i] = 1;
  },
  hide: function () { this.on[SM.ram[0x3C] >> 2] = 0; },
  // Rango horizontal (en coordenadas de la pantalla lógica de 256 px) donde se emiten
  // sprites. En modo original equivale al recorte de 8 bits del juego.
  xmin: 0, xmax: 256,
  visX: function (x) { return x >= this.xmin && x < this.xmax; }
};
