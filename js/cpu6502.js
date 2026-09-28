// CPU 6502 mínima (sólo opcodes oficiales, sin modo decimal: el 2A03 de la NES no lo tiene).
// Se usa para ejecutar el driver de sonido original directamente desde el ROM.
'use strict';
var SM = window.SM || (window.SM = {});

// read(addr) -> byte, write(addr, byte)
SM.CPU6502 = function (read, write) {
  this.rd = read; this.wr = write;
  this.a = 0; this.x = 0; this.y = 0; this.s = 0xFD; this.pc = 0;
  this.c = 0; this.z = 0; this.i = 1; this.d = 0; this.v = 0; this.n = 0;
  this.cycles = 0;
};

(function () {
  var P = SM.CPU6502.prototype;

  // Llama a una subrutina (JSR) y ejecuta hasta su RTS. maxSteps evita colgarse con datos raros.
  P.call = function (addr, maxSteps) {
    var ret = 0xFFFF;                     // dirección centinela: RTS vuelve a $FFFF+1 = $0000
    this.push(((ret - 1) >> 8) & 0xFF); this.push((ret - 1) & 0xFF);
    var depth = this.s;
    this.pc = addr;
    for (var n = maxSteps || 100000; n > 0; n--) {
      this.step();
      if (this.pc === ret && this.s === ((depth + 2) & 0xFF)) return true;
    }
    return false;
  };

  P.push = function (v) { this.wr(0x100 | this.s, v & 0xFF); this.s = (this.s - 1) & 0xFF; };
  P.pull = function () { this.s = (this.s + 1) & 0xFF; return this.rd(0x100 | this.s); };
  P.flags = function (b) {
    return (this.n << 7) | (this.v << 6) | 0x20 | (b ? 0x10 : 0) | (this.d << 3) | (this.i << 2) | (this.z << 1) | this.c;
  };
  P.setFlags = function (p) {
    this.n = (p >> 7) & 1; this.v = (p >> 6) & 1; this.d = (p >> 3) & 1;
    this.i = (p >> 2) & 1; this.z = (p >> 1) & 1; this.c = p & 1;
  };
  P.nz = function (v) { this.z = v === 0 ? 1 : 0; this.n = v >> 7; return v; };
  P.fetch = function () { var v = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; };
  P.fetch16 = function () { var l = this.fetch(); return l | (this.fetch() << 8); };
  P.rd16zp = function (a) { return this.rd(a & 0xFF) | (this.rd((a + 1) & 0xFF) << 8); };

  // Direccionamientos: devuelven la dirección efectiva
  P.zp = function () { return this.fetch(); };
  P.zpx = function () { return (this.fetch() + this.x) & 0xFF; };
  P.zpy = function () { return (this.fetch() + this.y) & 0xFF; };
  P.abs = function () { return this.fetch16(); };
  P.absx = function () { return (this.fetch16() + this.x) & 0xFFFF; };
  P.absy = function () { return (this.fetch16() + this.y) & 0xFFFF; };
  P.indx = function () { return this.rd16zp(this.fetch() + this.x); };
  P.indy = function () { return (this.rd16zp(this.fetch()) + this.y) & 0xFFFF; };

  P.adc = function (m) {
    var r = this.a + m + this.c;
    this.v = (~(this.a ^ m) & (this.a ^ r) & 0x80) ? 1 : 0;
    this.c = r > 0xFF ? 1 : 0;
    this.a = this.nz(r & 0xFF);
  };
  P.cmp = function (r, m) { var t = r - m; this.c = t >= 0 ? 1 : 0; this.nz(t & 0xFF); };
  P.branch = function (cond) {
    var o = this.fetch();
    if (cond) this.pc = (this.pc + (o < 0x80 ? o : o - 0x100)) & 0xFFFF;
  };
  // Lectura-modificación-escritura
  P.rmw = function (a, f) { var v = f.call(this, this.rd(a)); this.wr(a, v); };
  P.asl = function (v) { this.c = v >> 7; return this.nz((v << 1) & 0xFF); };
  P.lsr = function (v) { this.c = v & 1; return this.nz(v >> 1); };
  P.rol = function (v) { var c = this.c; this.c = v >> 7; return this.nz(((v << 1) | c) & 0xFF); };
  P.ror = function (v) { var c = this.c; this.c = v & 1; return this.nz((v >> 1) | (c << 7)); };
  P.inc = function (v) { return this.nz((v + 1) & 0xFF); };
  P.dec = function (v) { return this.nz((v - 1) & 0xFF); };
  P.bit = function (m) { this.z = (this.a & m) ? 0 : 1; this.n = m >> 7; this.v = (m >> 6) & 1; };

  // Tabla de modos para el grupo ALU (ORA/AND/EOR/ADC/STA/LDA/CMP/SBC): op & 0x1F
  var ALU_MODE = { 0x01: 'indx', 0x05: 'zp', 0x09: 'imm', 0x0D: 'abs', 0x11: 'indy', 0x15: 'zpx', 0x19: 'absy', 0x1D: 'absx' };

  P.step = function () {
    var op = this.fetch(), a, m;
    this.cycles += 3;                     // aproximado: sólo se usa para estadísticas
    // grupo ALU
    var mode = (op & 3) === 1 ? ALU_MODE[op & 0x1F] : null;
    if (mode) {
      var grp = op >> 5;
      if (grp === 4) { if (mode !== 'imm') this.wr(this[mode](), this.a); return; }   // STA
      m = mode === 'imm' ? this.fetch() : this.rd(this[mode]());
      switch (grp) {
        case 0: this.a = this.nz(this.a | m); return;
        case 1: this.a = this.nz(this.a & m); return;
        case 2: this.a = this.nz(this.a ^ m); return;
        case 3: this.adc(m); return;
        case 5: this.a = this.nz(m); return;
        case 6: this.cmp(this.a, m); return;
        case 7: this.adc(m ^ 0xFF); return;
      }
    }
    switch (op) {
      // saltos y subrutinas
      case 0x4C: this.pc = this.fetch16(); return;
      case 0x6C: a = this.fetch16(); this.pc = this.rd(a) | (this.rd((a & 0xFF00) | ((a + 1) & 0xFF)) << 8); return;
      case 0x20: a = this.fetch16(); m = (this.pc - 1) & 0xFFFF; this.push(m >> 8); this.push(m); this.pc = a; return;
      case 0x60: m = this.pull(); this.pc = ((m | (this.pull() << 8)) + 1) & 0xFFFF; return;
      case 0x40: this.setFlags(this.pull()); m = this.pull(); this.pc = m | (this.pull() << 8); return;
      case 0x00: this.fetch(); m = this.pc; this.push(m >> 8); this.push(m); this.push(this.flags(true)); this.i = 1;
        this.pc = this.rd(0xFFFE) | (this.rd(0xFFFF) << 8); return;
      // ramificaciones
      case 0x10: this.branch(!this.n); return;
      case 0x30: this.branch(this.n); return;
      case 0x50: this.branch(!this.v); return;
      case 0x70: this.branch(this.v); return;
      case 0x90: this.branch(!this.c); return;
      case 0xB0: this.branch(this.c); return;
      case 0xD0: this.branch(!this.z); return;
      case 0xF0: this.branch(this.z); return;
      // banderas
      case 0x18: this.c = 0; return;
      case 0x38: this.c = 1; return;
      case 0x58: this.i = 0; return;
      case 0x78: this.i = 1; return;
      case 0xB8: this.v = 0; return;
      case 0xD8: this.d = 0; return;
      case 0xF8: this.d = 1; return;
      // pila y transferencias
      case 0x48: this.push(this.a); return;
      case 0x68: this.a = this.nz(this.pull()); return;
      case 0x08: this.push(this.flags(true)); return;
      case 0x28: this.setFlags(this.pull()); return;
      case 0xAA: this.x = this.nz(this.a); return;
      case 0xA8: this.y = this.nz(this.a); return;
      case 0x8A: this.a = this.nz(this.x); return;
      case 0x98: this.a = this.nz(this.y); return;
      case 0xBA: this.x = this.nz(this.s); return;
      case 0x9A: this.s = this.x; return;
      case 0xE8: this.x = this.nz((this.x + 1) & 0xFF); return;
      case 0xC8: this.y = this.nz((this.y + 1) & 0xFF); return;
      case 0xCA: this.x = this.nz((this.x - 1) & 0xFF); return;
      case 0x88: this.y = this.nz((this.y - 1) & 0xFF); return;
      case 0xEA: return;
      // LDX / LDY
      case 0xA2: this.x = this.nz(this.fetch()); return;
      case 0xA6: this.x = this.nz(this.rd(this.zp())); return;
      case 0xB6: this.x = this.nz(this.rd(this.zpy())); return;
      case 0xAE: this.x = this.nz(this.rd(this.abs())); return;
      case 0xBE: this.x = this.nz(this.rd(this.absy())); return;
      case 0xA0: this.y = this.nz(this.fetch()); return;
      case 0xA4: this.y = this.nz(this.rd(this.zp())); return;
      case 0xB4: this.y = this.nz(this.rd(this.zpx())); return;
      case 0xAC: this.y = this.nz(this.rd(this.abs())); return;
      case 0xBC: this.y = this.nz(this.rd(this.absx())); return;
      // STX / STY
      case 0x86: this.wr(this.zp(), this.x); return;
      case 0x96: this.wr(this.zpy(), this.x); return;
      case 0x8E: this.wr(this.abs(), this.x); return;
      case 0x84: this.wr(this.zp(), this.y); return;
      case 0x94: this.wr(this.zpx(), this.y); return;
      case 0x8C: this.wr(this.abs(), this.y); return;
      // CPX / CPY
      case 0xE0: this.cmp(this.x, this.fetch()); return;
      case 0xE4: this.cmp(this.x, this.rd(this.zp())); return;
      case 0xEC: this.cmp(this.x, this.rd(this.abs())); return;
      case 0xC0: this.cmp(this.y, this.fetch()); return;
      case 0xC4: this.cmp(this.y, this.rd(this.zp())); return;
      case 0xCC: this.cmp(this.y, this.rd(this.abs())); return;
      // BIT
      case 0x24: this.bit(this.rd(this.zp())); return;
      case 0x2C: this.bit(this.rd(this.abs())); return;
      // desplazamientos sobre A
      case 0x0A: this.a = this.asl(this.a); return;
      case 0x4A: this.a = this.lsr(this.a); return;
      case 0x2A: this.a = this.rol(this.a); return;
      case 0x6A: this.a = this.ror(this.a); return;
      // lectura-modificación-escritura en memoria
      case 0x06: this.rmw(this.zp(), this.asl); return;
      case 0x16: this.rmw(this.zpx(), this.asl); return;
      case 0x0E: this.rmw(this.abs(), this.asl); return;
      case 0x1E: this.rmw(this.absx(), this.asl); return;
      case 0x46: this.rmw(this.zp(), this.lsr); return;
      case 0x56: this.rmw(this.zpx(), this.lsr); return;
      case 0x4E: this.rmw(this.abs(), this.lsr); return;
      case 0x5E: this.rmw(this.absx(), this.lsr); return;
      case 0x26: this.rmw(this.zp(), this.rol); return;
      case 0x36: this.rmw(this.zpx(), this.rol); return;
      case 0x2E: this.rmw(this.abs(), this.rol); return;
      case 0x3E: this.rmw(this.absx(), this.rol); return;
      case 0x66: this.rmw(this.zp(), this.ror); return;
      case 0x76: this.rmw(this.zpx(), this.ror); return;
      case 0x6E: this.rmw(this.abs(), this.ror); return;
      case 0x7E: this.rmw(this.absx(), this.ror); return;
      case 0xE6: this.rmw(this.zp(), this.inc); return;
      case 0xF6: this.rmw(this.zpx(), this.inc); return;
      case 0xEE: this.rmw(this.abs(), this.inc); return;
      case 0xFE: this.rmw(this.absx(), this.inc); return;
      case 0xC6: this.rmw(this.zp(), this.dec); return;
      case 0xD6: this.rmw(this.zpx(), this.dec); return;
      case 0xCE: this.rmw(this.abs(), this.dec); return;
      case 0xDE: this.rmw(this.absx(), this.dec); return;
    }
    throw new Error('6502: opcode no soportado $' + op.toString(16) + ' en $' + ((this.pc - 1) & 0xFFFF).toString(16));
  };
})();
