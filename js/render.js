// Renderizador por software. Dibuja el fondo directamente desde el mapa del nivel
// (no hay nametables: la vista puede tener cualquier ancho) y los sprites con la misma
// semántica de prioridad que la NES (sprites detrás del fondo, color 0 transparente).
'use strict';
var SM = window.SM || (window.SM = {});

SM.Render = {
  W: 256, H: 240,
  init: function (canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pal = new Uint8Array(32);      // equivalente a la RAM de paleta de la PPU
    this.resize(256);
  },
  resize: function (w) {
    w = Math.max(256, w | 0);
    if (w === this.W && this.img) return;
    this.W = w;
    this.canvas.width = w;
    this.canvas.height = this.H;
    this.img = this.ctx.createImageData(w, this.H);
    this.fb = new Uint32Array(this.img.data.buffer);
    this.bgop = new Uint8Array(w * this.H);
  },
  rgba: function (i) {
    var c = SM.NES_PALETTE[i & 0x3F];
    return 0xFF000000 | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF);
  },
  // Fondo del nivel. vx: x del mundo del borde izquierdo; vyh/vyl: y en páginas de 240.
  drawLevel: function (vx, vyh, vyl) {
    var rom = SM.rom, L = SM.Level, ram = SM.ram, R = SM.R;
    var W = this.W, H = this.H, fb = this.fb, op = this.bgop;
    var banks = [ram[R.CHR2], ram[R.CHR3], ram[R.CHR4], ram[R.CHR5]];
    var colors = [];
    for (var i = 0; i < 16; i++) colors.push(this.rgba((i & 3) ? this.pal[i] : this.pal[0]));
    var bg = colors[0];
    fb.fill(bg);
    op.fill(0);
    var vy = vyh * 240 + vyl;
    var y0 = vy & ~7, x0 = vx & ~7;
    for (var ty = y0; ty < vy + H; ty += 8) {
      var yh = Math.floor(ty / 240), yl = ty - yh * 240;
      if (yh < 0 || yh > 0x10) continue;
      for (var tx = x0; tx < vx + W; tx += 8) {
        if (tx < 0) continue;
        var xh = tx >> 8, xl = tx & 0xFF;
        if (xh >= L.width) continue;
        var m = L.metatileDraw(xh, xl, yh, yl);
        var t = L.mtTiles[m * 4 + ((yl & 8) ? 2 : 0) + ((xl & 8) ? 1 : 0)];
        var ed = SM.BgEdit ? SM.BgEdit.get(tx >> 3, ty >> 3) : -1;
        if (ed >= 0) t = ed;
        var pa = L.mtAttr[m] << 2;
        var px = rom.tile(banks[t >> 6], t);
        var sx = tx - vx, sy = ty - vy;
        for (var py = 0; py < 8; py++) {
          var yy = sy + py;
          if (yy < 0 || yy >= H) continue;
          var row = yy * W;
          for (var pxx = 0; pxx < 8; pxx++) {
            var xx = sx + pxx;
            if (xx < 0 || xx >= W) continue;
            var c = px[py * 8 + pxx];
            if (c) { fb[row + xx] = colors[pa | c]; op[row + xx] = 1; }
          }
        }
      }
    }
  },
  // Pantalla de nametable fija (título, cartel de zona...). nt: Uint8Array(960) + attr(64)
  drawNametable: function (nt, attr, banks, ox) {
    var rom = SM.rom, W = this.W, fb = this.fb, op = this.bgop;
    var colors = [];
    for (var i = 0; i < 16; i++) colors.push(this.rgba((i & 3) ? this.pal[i] : this.pal[0]));
    fb.fill(colors[0]); op.fill(0);
    ox = ox || 0;
    for (var ty = 0; ty < 30; ty++) for (var tx = 0; tx < 32; tx++) {
      var t = nt[ty * 32 + tx];
      var a = attr[(ty >> 2) * 8 + (tx >> 2)];
      var pa = ((a >> (((ty & 2) << 1) | (tx & 2))) & 3) << 2;
      var px = rom.tile(banks[t >> 6], t);
      for (var py = 0; py < 8; py++) {
        var row = (ty * 8 + py) * W;
        for (var pxx = 0; pxx < 8; pxx++) {
          var xx = ox + tx * 8 + pxx;
          if (xx < 0 || xx >= W) continue;
          var c = px[py * 8 + pxx];
          if (c) { fb[row + xx] = colors[pa | c]; op[row + xx] = 1; }
        }
      }
    }
  },
  // Franja de un nametable (32x30) con scroll horizontal; fuera del nametable se ve el
  // tile 'blank' (blank < 0: el nametable se repite, espejado horizontal). Filas de pantalla [y0,y1). ox: margen izquierdo de la pantalla lógica.
  drawNTRows: function (nt, attr, banks, scrollX, y0, y1, ox, blank) {
    var rom = SM.rom, W = this.W, fb = this.fb, op = this.bgop;
    var colors = [];
    for (var i = 0; i < 16; i++) colors.push(this.rgba((i & 3) ? this.pal[i] : this.pal[0]));
    for (var y = y0; y < y1 && y < 240; y++) {
      var row = y * W, ty = y >> 3, fy = y & 7;
      for (var sx = 0; sx < 256; sx++) {
        var xx = sx + ox;
        if (xx < 0 || xx >= W) continue;
        var wx = (sx + scrollX) & (blank < 0 ? 255 : 511);
        var t, pa = 0;
        if (wx < 256) {
          var tx = wx >> 3;
          t = nt[ty * 32 + tx];
          var a = attr[(ty >> 2) * 8 + (tx >> 2)];
          pa = ((a >> (((ty & 2) << 1) | (tx & 2))) & 3) << 2;
        } else t = blank;
        var c = rom.tile(banks[t >> 6], t)[fy * 8 + (wx & 7)];
        if (c) { fb[row + xx] = colors[pa | c]; op[row + xx] = 1; }
      }
    }
  },
  // $3F10/$14/$18/$1C son espejos de $3F00/$04/$08/$0C: al subir los 32 bytes de la
  // paleta, los bytes 16/20/24/28 pisan a los 0/4/8/12.
  mirrorPal: function () {
    for (var i = 0; i < 16; i += 4) this.pal[i] = this.pal[16 + i];
  },
  clear: function () {
    this.fb.fill(this.rgba(this.pal[0])); this.bgop.fill(0);
  },
  // Sprites desde SM.Spr (orden de prioridad NES: la entrada 0 queda encima).
  // ox = desplazamiento de la pantalla lógica dentro de la vista.
  // sprBanks = bancos de 1 KB para los tiles $00-$3F,$40-$7F,$80-$BF,$C0-$FF.
  drawSprites: function (sprBanks, ox) {
    var rom = SM.rom, W = this.W, H = this.H, fb = this.fb, op = this.bgop, S = SM.Spr;
    var colors = [];
    for (var i = 0; i < 16; i++) colors.push(this.rgba(this.pal[16 + i]));
    for (var k = 63; k >= 0; k--) {
      if (!S.on[k]) continue;
      var x = S.x[k] + ox, y = S.y[k] + 1, t = S.t[k], a = S.a[k];
      if (x <= -8 || x >= W || y <= -8 || y >= H) continue;
      var px = rom.tile(sprBanks[(t >> 6) & 3], t);
      var pa = (a & 3) << 2, behind = a & 0x20, hf = a & 0x40, vf = a & 0x80;
      for (var py = 0; py < 8; py++) {
        var yy = y + py;
        if (yy < 0 || yy >= H) continue;
        var srow = (vf ? 7 - py : py) * 8, row = yy * W;
        for (var pxx = 0; pxx < 8; pxx++) {
          var xx = x + pxx;
          if (xx < 0 || xx >= W) continue;
          var c = px[srow + (hf ? 7 - pxx : pxx)];
          if (!c) continue;
          if (behind && op[row + xx]) continue;
          fb[row + xx] = colors[pa | c];
        }
      }
    }
  },
  present: function () {
    this.ctx.putImageData(this.img, 0, 0);
  }
};
