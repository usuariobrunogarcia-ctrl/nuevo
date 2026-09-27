// Somari (mapper 116) ROM access.
// Todo el contenido (gráficos, niveles, tablas de física) se lee del ROM original.
'use strict';
var SM = window.SM || (window.SM = {});

SM.ROM_FILE = 'Somari (Asia) (En) (v1.1) (Pirate).nes';

SM.Rom = function (bytes) {
  if (bytes[0] !== 0x4E || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1A)
    throw new Error('No es un archivo iNES válido');
  var prgSize = bytes[4] * 0x4000, chrSize = bytes[5] * 0x2000;
  if (prgSize !== 0x40000 || chrSize !== 0x40000)
    throw new Error('Tamaño inesperado: se espera el ROM de Somari (256K PRG + 256K CHR)');
  this.prg = bytes.subarray(16, 16 + prgSize);
  this.chr = bytes.subarray(16 + prgSize, 16 + prgSize + chrSize);
  this._tiles = {};
};

// Lee un byte de un banco de PRG de 8 KB usando la dirección de CPU que el juego usa
// (sólo importan los 13 bits bajos).
SM.Rom.prototype.b = function (bank, addr) {
  return this.prg[bank * 0x2000 + (addr & 0x1FFF)];
};
SM.Rom.prototype.w = function (bank, addr) {
  return this.b(bank, addr) | (this.b(bank, addr + 1) << 8);
};
// Vista de un banco (Uint8Array de 8 KB).
SM.Rom.prototype.bank = function (bank) {
  return this.prg.subarray(bank * 0x2000, bank * 0x2000 + 0x2000);
};

// Decodifica un tile de 8x8 (2bpp) de la CHR. bank1k = banco de 1 KB, t = índice 0..63.
// Devuelve Uint8Array(64) con índices de color 0..3.
SM.Rom.prototype.tile = function (bank1k, t) {
  var key = bank1k * 64 + (t & 63);
  var c = this._tiles[key];
  if (c) return c;
  c = new Uint8Array(64);
  var base = (bank1k & 0xFF) * 0x400 + (t & 63) * 16;
  for (var y = 0; y < 8; y++) {
    var lo = this.chr[base + y], hi = this.chr[base + y + 8];
    for (var x = 0; x < 8; x++)
      c[y * 8 + x] = ((lo >> (7 - x)) & 1) | (((hi >> (7 - x)) & 1) << 1);
  }
  this._tiles[key] = c;
  return c;
};

// Paleta maestra de la NES (valores RGB).
SM.NES_PALETTE = [
  0x666666, 0x002A88, 0x1412A7, 0x3B00A4, 0x5C007E, 0x6E0040, 0x6C0600, 0x561D00, 0x333500, 0x0B4800, 0x005200, 0x004F08, 0x00404D, 0x000000, 0x000000, 0x000000,
  0xADADAD, 0x155FD9, 0x4240FF, 0x7527FE, 0xA01ACC, 0xB71E7B, 0xB53120, 0x994E00, 0x6B6D00, 0x388700, 0x0C9300, 0x008F32, 0x007C8D, 0x000000, 0x000000, 0x000000,
  0xFFFEFF, 0x64B0FF, 0x9290FF, 0xC676FF, 0xF36AFF, 0xFE6ECC, 0xFE8170, 0xEA9E22, 0xBCBE00, 0x88D800, 0x5CE430, 0x45E082, 0x48CDDE, 0x4F4F4F, 0x000000, 0x000000,
  0xFFFEFF, 0xC0DFFF, 0xD3D2FF, 0xE8C8FF, 0xFBC2FF, 0xFEC4EA, 0xFECCC5, 0xF7D8A5, 0xE4E594, 0xCFEF96, 0xBDF4AB, 0xB3F3CC, 0xB5EBF2, 0xB8B8B8, 0x000000, 0x000000
];

// Carga el ROM: intenta leerlo del mismo directorio; si falla, pide el archivo.
SM.loadRom = function (onReady, onNeedFile) {
  fetch(encodeURI(SM.ROM_FILE)).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.arrayBuffer();
  }).then(function (buf) {
    onReady(new SM.Rom(new Uint8Array(buf)));
  }).catch(function () {
    onNeedFile(function (file) {
      var fr = new FileReader();
      fr.onload = function () { onReady(new SM.Rom(new Uint8Array(fr.result))); };
      fr.readAsArrayBuffer(file);
    });
  });
};
