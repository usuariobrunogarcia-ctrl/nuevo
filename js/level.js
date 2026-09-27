// Datos de nivel extraídos del ROM (formato descubierto por ingeniería inversa):
//   mapa de "chunks" (256x240 px) -> chunk de 16x15 metatiles -> metatile de 2x2 tiles.
//   Los metatiles $E0-$FF son anillos; un mapa de bits en RAM $0600 indica cuáles quedan.
'use strict';
var SM = window.SM || (window.SM = {});

SM.Level = {
  // Equivalente a la rutina de inicio de nivel del banco $19 ($A502) + $A000.
  init: function (rom, zone, act) {
    var ram = SM.ram, R = SM.R;
    var b19 = 0x19;
    ram[R.ZONE] = zone; ram[R.ACT] = act;
    for (var i = 0; i < 256; i++) ram[R.RINGS_BITS + i] = 0xFF;
    var zi = zone * 4;
    ram[R.CHUNK_A] = rom.b(b19, 0xA6F4 + zi);
    ram[R.CHUNK_B] = rom.b(b19, 0xA6F5 + zi);
    ram[R.ZBANK] = rom.b(b19, 0xA6F6 + zi);
    ram[R.SPRBANK] = rom.b(b19, 0xA6F7 + zi);
    ram[0x2C] = ram[R.SPRBANK];
    ram[R.SPRBANK2] = (ram[R.SPRBANK] + 2) & 0xFF;
    // $A000: ancho y tabla de filas
    var w = rom.b(b19, 0xA043 + zone * 3 + act);
    ram[R.ROWW] = w;
    ram[R.ROWS] = 0;
    var acc = w;
    ram[R.ROWS + 1] = acc;
    for (var x = 2; x < 0x11; x++) { acc = (acc + w) & 0xFF; ram[R.ROWS + x] = acc; }
    this.layoutPage = rom.b(b19, 0xA05E + act);
    this.ringPage = rom.b(b19, 0xA061 + act);
    this.objPage = rom.b(b19, 0xA064 + act);
    // cámara inicial
    var p = rom.w(b19, 0xAA04 + zone * 2) + act * 4;
    ram[R.CAM_XH] = ram[R.NCAM_XH] = rom.b(b19, p);
    ram[R.CAM_XL] = ram[R.NCAM_XL] = rom.b(b19, p + 1);
    ram[R.CAM_YH] = ram[R.NCAM_YH] = rom.b(b19, p + 2);
    ram[R.CAM_YL] = ram[R.NCAM_YL] = rom.b(b19, p + 3);
    ram[R.PX_HI] = ram[R.NX_HI] = ram[R.CAM_XH];
    ram[R.PX_LO] = ram[R.NX_LO] = 0x80;
    ram[R.PY_HI] = ram[R.NY_HI] = ram[R.CAM_YH];
    ram[R.PY_LO] = ram[R.NY_LO] = 0x80;
    ram[R.SX_HI] = ram[R.CAM_XH]; ram[R.SX_LO] = ram[R.CAM_XL];
    ram[R.SY_HI] = ram[R.CAM_YH]; ram[R.SY_LO] = ram[R.CAM_YL];
    // bancos de CHR del fondo + animación
    var ci = zone * 8;
    ram[R.CHR2] = rom.b(b19, 0xA718 + ci);
    ram[R.CHR3] = rom.b(b19, 0xA719 + ci);
    ram[R.CHR4] = rom.b(b19, 0xA71A + ci);
    ram[R.CHR5] = ram[R.BGANIM] = rom.b(b19, 0xA71B + ci);
    ram[R.BGANIM + 1] = rom.b(b19, 0xA71C + ci);
    ram[R.BGANIM + 2] = rom.b(b19, 0xA71D + ci);
    ram[R.BGANIM + 3] = rom.b(b19, 0xA71E + ci);
    // límites de cámara
    p = rom.w(b19, 0xAAA8 + zone * 2) + act * 4;
    ram[R.BND_L] = rom.b(b19, p);
    ram[R.BND_R] = rom.b(b19, p + 1);
    ram[R.BND_T] = rom.b(b19, p + 2);
    ram[R.BND_B] = rom.b(b19, p + 3);
    this.rom = rom;
    this.zbank = ram[R.ZBANK];
    // Metatiles precalculados: 4 tiles + atributo
    var zb = rom.bank(this.zbank);
    this.mtTiles = new Uint8Array(256 * 4);
    this.mtAttr = new Uint8Array(256);
    this.mtCol = new Uint8Array(256);
    for (var m = 0; m < 256; m++) {
      this.mtTiles[m * 4] = zb[m];
      this.mtTiles[m * 4 + 1] = zb[0x100 + m];
      this.mtTiles[m * 4 + 2] = zb[0x200 + m];
      this.mtTiles[m * 4 + 3] = zb[0x300 + m];
      this.mtAttr[m] = zb[0x400 + m] & 3;
      this.mtCol[m] = zb[0x500 + m];
    }
    this.layout = zb.subarray((this.layoutPage & 0x1F) * 256, (this.layoutPage & 0x1F) * 256 + 256);
    this.ringIdx = zb.subarray((this.ringPage & 0x1F) * 256, (this.ringPage & 0x1F) * 256 + 256);
    this.objIdx = zb.subarray((this.objPage & 0x1F) * 256, (this.objPage & 0x1F) * 256 + 256);
    this.chunkA = rom.bank(ram[R.CHUNK_A]);
    this.chunkB = rom.bank(ram[R.CHUNK_B]);
    this.width = w;
  },

  // Metatile en coordenadas (xh, xl, yh, yl) — igual que $A35B/$AC99: incluye el estado de anillos.
  // Devuelve el metatile; deja RAM $91 (base de anillos) y $8C (chunk) como el original.
  metatile: function (xh, xl, yh, yl) {
    var ram = SM.ram;
    var yi = (ram[SM.R.ROWS + (yh & 0xFF)] + xh) & 0xFF;
    ram[SM.R.RINGBASE] = this.ringIdx[yi];
    var cid = this.layout[yi];
    ram[SM.R.COL_CHUNK] = cid;
    var cb = (cid & 0x20) ? this.chunkB : this.chunkA;
    var m = cb[(cid & 0x1F) * 256 + ((yl & 0xF0) | (xl >> 4))];
    if (m >= 0xE0) {
      var k = m & 0x1F;
      if (!(ram[SM.R.RINGS_BITS + (((k >> 3) + ram[SM.R.RINGBASE]) & 0xFF)] & (1 << (k & 7)))) m = m & 0x10;
    }
    return m;
  },

  // Metatile "crudo" para la colisión ($ACB1): no aplica el estado de los anillos.
  metatileRaw: function (xh, xl, yh, yl) {
    var ram = SM.ram;
    var yi = (ram[SM.R.ROWS + (yh & 0xFF)] + xh) & 0xFF;
    ram[SM.R.RINGBASE] = this.ringIdx[yi];
    var cid = this.layout[yi];
    ram[SM.R.COL_CHUNK] = cid;
    var cb = (cid & 0x20) ? this.chunkB : this.chunkA;
    return cb[(cid & 0x1F) * 256 + ((yl & 0xF0) | (xl >> 4))];
  },

  // Metatile sin tocar RAM (para el dibujado). y en páginas de 240.
  metatileDraw: function (xh, xl, yh, yl) {
    var yi = (SM.ram[SM.R.ROWS + (yh & 0xFF)] + xh) & 0xFF;
    var cid = this.layout[yi];
    var cb = (cid & 0x20) ? this.chunkB : this.chunkA;
    var m = cb[(cid & 0x1F) * 256 + ((yl & 0xF0) | (xl >> 4))];
    if (m >= 0xE0) {
      var k = m & 0x1F;
      if (!(SM.ram[SM.R.RINGS_BITS + (((k >> 3) + this.ringIdx[yi]) & 0xFF)] & (1 << (k & 7)))) m = m & 0x10;
    }
    return m;
  }
};
