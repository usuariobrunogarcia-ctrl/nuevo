// Física mejorada: port del movimiento de Sonic de Sonic 3 & Knuckles (desensamblado
// sonicretro/skdisasm, sonic3k.asm): Sonic_MdNormal/MdAir/MdRoll/MdJump, Sonic_Move,
// Sonic_RollSpeed, Sonic_ChgJumpDir, Sonic_Jump, Sonic_JumpHeight, SonicKnux_Spindash,
// SonicKnux_Roll, Player_SlopeResist/RollRepel/SlopeRepel, Player_AnglePos (4 cuadrantes),
// SonicKnux_DoLevelCollision, Player_TouchFloor y los sensores FindFloor/FindWall.
// El terreno sale de terrain.js (derivado de la colisión de Somari). El resto del juego
// (objetos, cámara, animación) sigue leyendo las variables de Somari, que este módulo
// mantiene al día.
'use strict';
var SM = window.SM || (window.SM = {});

(function () {
  var ram = SM.ram, R = SM.R, J = SM.JOY;
  // Tablas de Sonic 3 (Levels/Misc/sine.bin y arctan.bin)
  var SIN = [
    0,6,12,18,25,31,37,43,49,56,62,68,74,80,86,92,97,103,109,115,120,126,131,136,
    142,147,152,157,162,167,171,176,181,185,189,193,197,201,205,209,212,216,219,222,225,228,231,234,
    236,238,241,243,244,246,248,249,251,252,253,254,254,255,255,255,256,255,255,255,254,254,253,252,
    251,249,248,246,244,243,241,238,236,234,231,228,225,222,219,216,212,209,205,201,197,193,189,185,
    181,176,171,167,162,157,152,147,142,136,131,126,120,115,109,103,97,92,86,80,74,68,62,56,
    49,43,37,31,25,18,12,6,0,-6,-12,-18,-25,-31,-37,-43,-49,-56,-62,-68,-74,-80,-86,-92,
    -97,-103,-109,-117,-120,-126,-131,-136,-142,-147,-152,-157,-162,-167,-171,-176,-181,-185,-189,-193,-197,-201,-205,-209,
    -212,-216,-219,-222,-225,-228,-231,-234,-236,-238,-241,-243,-244,-246,-248,-249,-251,-252,-253,-254,-254,-255,-255,-255,
    -256,-255,-255,-255,-254,-254,-253,-252,-251,-249,-248,-246,-244,-243,-241,-238,-236,-234,-231,-228,-225,-222,-219,-216,
    -212,-209,-205,-201,-197,-193,-189,-185,-181,-176,-171,-167,-162,-157,-152,-147,-142,-136,-131,-126,-120,-117,-109,-103,
    -97,-92,-86,-80,-74,-68,-62,-56,-49,-43,-37,-31,-25,-18,-12,-6,0,6,12,18,25,31,37,43,
    49,56,62,68,74,80,86,92,97,103,109,115,120,126,131,136,142,147,152,157,162,167,171,176,
    181,185,189,193,197,201,205,209,212,216,219,222,225,228,231,234,236,238,241,243,244,246,248,249,
    251,252,253,254,254,255,255,255
  ];
  var ATAN = [
    0,0,0,0,1,1,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,3,3,4,
    4,4,4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,7,7,7,7,7,7,
    8,8,8,8,8,8,8,9,9,9,9,9,9,10,10,10,10,10,10,10,11,11,11,11,
    11,11,11,12,12,12,12,12,12,12,13,13,13,13,13,13,13,14,14,14,14,14,14,14,
    15,15,15,15,15,15,15,16,16,16,16,16,16,16,17,17,17,17,17,17,17,17,18,18,
    18,18,18,18,18,19,19,19,19,19,19,19,19,20,20,20,20,20,20,20,20,21,21,21,
    21,21,21,21,21,21,22,22,22,22,22,22,22,22,23,23,23,23,23,23,23,23,23,24,
    24,24,24,24,24,24,24,24,25,25,25,25,25,25,25,25,25,25,26,26,26,26,26,26,
    26,26,26,27,27,27,27,27,27,27,27,27,27,28,28,28,28,28,28,28,28,28,28,28,
    29,29,29,29,29,29,29,29,29,29,29,30,30,30,30,30,30,30,30,30,30,30,31,31,
    31,31,31,31,31,31,31,31,31,31,32,32,32,32,32,32,32,0
  ];
  function sin(a) { return SIN[a & 0xFF]; }
  function cos(a) { return SIN[(a & 0xFF) + 0x40]; }
  function mul8(v, s) { return Math.floor(v * s / 256); }            // muls + asr.l #8
  function s8(v) { v &= 0xFF; return v >= 0x80 ? v - 0x100 : v; }
  // GetArcTan
  function atan(x, y) {
    if (!x && !y) return 0x40;
    var ax = Math.abs(x), ay = Math.abs(y), a;
    if (ay < ax) a = ATAN[Math.floor((ay * 256) / ax)];
    else a = (0x40 - ATAN[Math.floor((ax * 256) / ay)]) & 0xFF;
    if (x < 0) a = (0x80 - a) & 0xFF;
    if (y < 0) a = (0x100 - a) & 0xFF;
    return a;
  }

  // ---------------- estado del jugador (equivalente al objeto de Sonic) ----------------
  var P = {
    X: 0, Y: 0,                 // posición del centro en 1/256 de píxel
    xv: 0, yv: 0, gv: 0, angle: 0,
    air: false, roll: false, rollJump: false, push: false, left: false, onObj: false,
    jumping: false, spindash: false, sdCount: 0, moveLock: 0, stick: false,
    yRad: 19, xRad: 9, anim: 5, layer: 0, hurt: false, spring: false, water: false
  };
  var S3 = SM.S3 = { P: P, enabled: false, somari: false };
  var TOP = 1, LRB = 2;                    // bits de solidez (top_solid_bit / lrb_solid_bit)
  var prim = 0, sec = 0;                    // Primary_Angle / Secondary_Angle
  var held = 0, pressed = 0;
  var ABC = J.A | J.B;
  function xi() { return Math.floor(P.X / 256); }
  function yi() { return Math.floor(P.Y / 256); }
  function addX(px) { P.X += px * 256; }
  function addY(px) { P.Y += px * 256; }

  // ---------------- sensores (FindFloor / FindWall) ----------------
  function blk(x, y) { return y < 0 ? null : SM.Terrain.blockAt(x, y, P.layer); }
  function vh(b, x, flip, bit) {
    var h = (bit === TOP ? b.hmT : b.hmA)[x & 15];
    return flip ? -h : h;
  }
  function solid(b, bit) { return b && (bit === TOP ? b.top : b.lrb); }
  var out = { a: 0 };
  // sub_F264
  function floorA(x, y, dir, flip, bit) {
    var b = blk(x, y);
    if (solid(b, bit)) {
      out.a = b.angle;
      var h = vh(b, x, flip, bit);
      if (h > 0) {
        if (h !== 16) return 15 - ((y & 15) + h);
        return floorB(x, y - dir, flip, bit) - 16;
      }
      if (h < 0 && (y & 15) + h < 0) return floorB(x, y - dir, flip, bit) - 16;
    }
    return floorB(x, y + dir, flip, bit) + 16;
  }
  // sub_F30C
  function floorB(x, y, flip, bit) {
    var b = blk(x, y);
    if (solid(b, bit)) {
      out.a = b.angle;
      var h = vh(b, x, flip, bit);
      if (h > 0) return 15 - ((y & 15) + h);
      if (h < 0 && (y & 15) + h < 0) return ~(y & 15);
    }
    return 15 - (y & 15);
  }
  function wh(b, y, flip, bit) {
    var w = (bit === TOP ? b.wmT : b.wmA)[y & 15];
    return flip ? -w : w;
  }
  // sub_F4DC / sub_F584 (FindWall: lo mismo con los ejes cambiados)
  function wallA(x, y, dir, flip, bit) {
    var b = blk(x, y);
    if (solid(b, bit)) {
      out.a = b.angle;
      var w = wh(b, y, flip, bit);
      if (w > 0) {
        if (w !== 16) return 15 - ((x & 15) + w);
        return wallB(x - dir, y, flip, bit) - 16;
      }
      if (w < 0 && (x & 15) + w < 0) return wallB(x - dir, y, flip, bit) - 16;
    }
    return wallB(x + dir, y, flip, bit) + 16;
  }
  function wallB(x, y, flip, bit) {
    var b = blk(x, y);
    if (solid(b, bit)) {
      out.a = b.angle;
      var w = wh(b, y, flip, bit);
      if (w > 0) return 15 - ((x & 15) + w);
      if (w < 0 && (x & 15) + w < 0) return ~(x & 15);
    }
    return 15 - (x & 15);
  }
  // Dos sensores; devuelve {d: menor distancia, o: la otra, a: ángulo} ($F7E2)
  function pair(d0, d1, def) {
    var a = sec, d = d1, o = d0;
    if (d1 > d0) { a = prim; d = d0; o = d1; }
    if (a & 1) a = def;
    return { d: d, o: o, a: a };
  }
  // Sonic_CheckFloor
  function checkFloor() {
    var x = xi(), y = yi() + P.yRad;
    out.a = prim = 0; var d0 = floorA(x + P.xRad, y, 16, false, TOP); prim = out.a;
    out.a = sec = 0; var d1 = floorA(x - P.xRad, y, 16, false, TOP); sec = out.a;
    return pair(d0, d1, 0);
  }
  // Sonic_CheckCeiling
  function checkCeiling() {
    var x = xi(), y = (yi() - P.yRad) ^ 0xF;
    out.a = 0; var d0 = floorA(x + P.xRad, y, -16, true, LRB); prim = out.a;
    out.a = 0; var d1 = floorA(x - P.xRad, y, -16, true, LRB); sec = out.a;
    return pair(d0, d1, 0x80);
  }
  function leftWall(x, y) {             // CheckLeftWallDist (x ya desplazado)
    out.a = 0; var d = wallA(x ^ 0xF, y, -16, true, LRB); var a = out.a;
    return { d: d, a: (a & 1) ? 0x40 : a };
  }
  function rightWall(x, y) {
    out.a = 0; var d = wallA(x, y, 16, false, LRB); var a = out.a;
    return { d: d, a: (a & 1) ? 0xC0 : a };
  }
  function checkLeftWall() { return leftWall(xi() - 10, yi()); }
  function checkRightWall() { return rightWall(xi() + 10, yi()); }
  // CalcRoomOverHead
  function roomOverHead(a) {
    var q = (a + 0x20) & 0xC0, x = xi(), y = yi(), d0, d1;
    if (q === 0x40) {                   // CheckLeftCeilingDist
      out.a = 0; d0 = wallA((x - P.yRad) ^ 0xF, y - P.xRad, -16, true, LRB); prim = out.a;
      out.a = 0; d1 = wallA((x - P.yRad) ^ 0xF, y + P.xRad, -16, true, LRB); sec = out.a;
      return pair(d0, d1, 0x40).d;
    }
    if (q === 0x80) return checkCeiling().d;
    if (q === 0xC0) {                   // CheckRightCeilingDist
      out.a = 0; d0 = wallA(x + P.yRad, y - P.xRad, 16, false, LRB); prim = out.a;
      out.a = 0; d1 = wallA(x + P.yRad, y + P.xRad, 16, false, LRB); sec = out.a;
      return pair(d0, d1, 0xC0).d;
    }
    return checkFloor().d;
  }
  // redondeo del cuadrante usado por AnglePos y sub_F61C
  function quadrant(a) {
    var d;
    if (s8(a + 0x20) < 0) { d = a; if (s8(d) < 0) d = (d - 1) & 0xFF; d = (d + 0x20) & 0xFF; }
    else { d = a; if (s8(d) < 0) d = (d + 1) & 0xFF; d = (d + 0x1F) & 0xFF; }
    return d & 0xC0;
  }
  // sub_F61C (CalcRoomInFront): distancia a una pared en la dirección a, en la posición
  // del próximo cuadro
  function roomInFront(a) {
    var x = Math.floor((P.X + P.xv) / 256), y = Math.floor((P.Y + P.yv) / 256);
    prim = sec = a;
    var q = quadrant(a);
    if (q === 0) { out.a = a; return floorA(x, y + 10, 16, false, LRB); }
    if (q === 0x80) { out.a = a; return floorA(x, (y - 10) ^ 0xF, -16, true, LRB); }
    if (!(a & 0x38)) y += 8;
    if (q === 0x40) return leftWall(x - 10, y).d;
    return rightWall(x + 10, y).d;
  }

  // ---------------- Player_AnglePos ----------------
  function playerAngle(d0, d1) {
    var a = sec, d = d1;
    if (d1 > d0) { a = prim; d = d0; }
    if (a & 1) P.angle = (P.angle + 0x20) & 0xC0;
    else {
      var diff = Math.abs(s8(a - P.angle));
      if (diff < 0x20) P.angle = a; else P.angle = (P.angle + 0x20) & 0xC0;
    }
    return d;
  }
  function velByte(v) { var b = s8(v >> 8); b = Math.abs(b) + 4; return b >= 0x0E ? 0x0E : b; }
  function leaveGround() { P.air = true; P.push = false; }
  function anglePos() {
    if (P.onObj) { prim = sec = 0; return; }
    prim = sec = 3;
    var q = quadrant(P.angle), x = xi(), y = yi(), d0, d1, d;
    if (q === 0) {
      out.a = 3; d0 = floorA(x + P.xRad, y + P.yRad, 16, false, TOP); prim = out.a;
      out.a = 3; d1 = floorA(x - P.xRad, y + P.yRad, 16, false, TOP); sec = out.a;
      d = playerAngle(d0, d1);
      if (!d) return;
      if (d < 0) { if (d >= -14) addY(d); return; }
      if (P.stick || d <= velByte(P.xv)) addY(d); else leaveGround();
    } else if (q === 0xC0) {             // Player_WalkVertR
      out.a = 3; d0 = wallA(x + P.yRad, y - P.xRad, 16, false, TOP); prim = out.a;
      out.a = 3; d1 = wallA(x + P.yRad, y + P.xRad, 16, false, TOP); sec = out.a;
      d = playerAngle(d0, d1);
      if (!d) return;
      if (d < 0) { if (d >= -14) addX(d); return; }
      if (P.stick || d <= velByte(P.yv)) addX(d); else leaveGround();
    } else if (q === 0x80) {             // Player_WalkCeiling
      var yc = (y - P.yRad) ^ 0xF;
      out.a = 3; d0 = floorA(x + P.xRad, yc, -16, true, TOP); prim = out.a;
      out.a = 3; d1 = floorA(x - P.xRad, yc, -16, true, TOP); sec = out.a;
      d = playerAngle(d0, d1);
      if (!d) return;
      if (d < 0) { if (d >= -14) addY(-d); return; }
      if (P.stick || d <= velByte(P.xv)) addY(-d); else leaveGround();
    } else {                             // Player_WalkVertL
      var xc = (x - P.yRad) ^ 0xF;
      out.a = 3; d0 = wallA(xc, y - P.xRad, -16, true, TOP); prim = out.a;
      out.a = 3; d1 = wallA(xc, y + P.xRad, -16, true, TOP); sec = out.a;
      d = playerAngle(d0, d1);
      if (!d) return;
      if (d < 0) { if (d >= -14) addX(-d); return; }
      if (P.stick || d <= velByte(P.yv)) addX(-d); else leaveGround();
    }
  }

  // ---------------- constantes (Max_speed / Acceleration / Deceleration) ----------------
  function consts() {
    if (P.water) return { top: 0x300, acc: 6, dec: 0x40 };
    if (ram[0x9C]) return { top: 0xC00, acc: 0x18, dec: 0x80 };     // zapatillas
    return { top: 0x600, acc: 0x0C, dec: 0x80 };
  }
  function sfx(n) { ram[R.SFX] = n; }

  // ---------------- Sonic_Move ----------------
  function moveLeft(c) {                    // sub_113F6
    var d0 = P.gv;
    if (d0 <= 0) {
      if (!P.left) { P.left = true; P.push = false; }
      d0 -= c.acc;
      var lim = -c.top;
      if (d0 <= lim) { d0 += c.acc; if (d0 > lim) d0 = lim; }
      P.gv = d0; P.anim = 0;
      return;
    }
    d0 -= c.dec;
    if (d0 < 0) d0 = -0x80;
    P.gv = d0;
    // (el original compara la velocidad con el byte bajo pisado por el ángulo)
    if (((P.angle + 0x20) & 0xC0) === 0 && (((d0 & 0xFF00) << 16) >> 16) >= 0x400) {
      sfx(1); P.anim = 0x0D; P.left = false;
    }
  }
  function moveRight(c) {                   // sub_11482
    var d0 = P.gv;
    if (d0 >= 0) {
      if (P.left) { P.left = false; P.push = false; }
      d0 += c.acc;
      if (d0 >= c.top) { d0 -= c.acc; if (d0 < c.top) d0 = c.top; }
      P.gv = d0; P.anim = 0;
      return;
    }
    d0 += c.dec;
    if (d0 >= 0) d0 = 0x80;
    P.gv = d0;
    if (((P.angle + 0x20) & 0xC0) === 0 && (((d0 & 0xFF00) << 16) >> 16) <= -0x400) {
      sfx(1); P.anim = 0x0D; P.left = true;
    }
  }
  function move() {
    var c = consts();
    if (!P.moveLock) {
      if (held & J.LEFT) moveLeft(c);
      if (held & J.RIGHT) moveRight(c);
    }
    if (((P.angle + 0x20) & 0xC0) === 0 && P.gv === 0) {
      P.push = false; P.anim = 5;
      if (held & J.DOWN) P.anim = 8;
      else if (held & J.UP) P.anim = 7;
    }
    if (!(held & (J.LEFT | J.RIGHT)) && P.gv) {
      if (P.gv > 0) { P.gv -= c.acc; if (P.gv < 0) P.gv = 0; }
      else { P.gv += c.acc; if (P.gv > 0) P.gv = 0; }
    }
    P.xv = mul8(P.gv, cos(P.angle));
    P.yv = mul8(P.gv, sin(P.angle));
    wallStop();
  }
  // loc_11350
  function wallStop() {
    var a = P.angle;
    if ((a & 0x3F) && s8(a + 0x40) < 0) return;
    if (!P.gv) return;
    var d0 = (a + (P.gv > 0 ? -0x40 : 0x40)) & 0xFF;
    var d = roomInFront(d0);
    if (d >= 0) return;
    d *= 256;
    var q = (d0 + 0x20) & 0xC0;
    if (q === 0) P.yv += d;
    else if (q === 0x40) { P.xv -= d; P.gv = 0; if (P.left) P.push = true; }
    else if (q === 0x80) P.yv -= d;
    else { P.xv += d; P.gv = 0; if (!P.left) P.push = true; }
  }

  // ---------------- rodar ----------------
  function rollSpeed() {                    // Sonic_RollSpeed
    var c = consts(), acc = c.acc >> 1, dec = 0x20;
    if (!P.spindash && !P.moveLock) {
      if (held & J.LEFT) {
        if (P.gv <= 0) { P.left = true; P.anim = 2; }
        else { P.gv -= dec; if (P.gv < 0) P.gv = -0x80; }
      }
      if (held & J.RIGHT) {
        if (P.gv >= 0) { P.left = false; P.anim = 2; }
        else { P.gv += dec; if (P.gv >= 0) P.gv = 0x80; }
      }
    }
    if (P.gv > 0) { P.gv -= acc; if (P.gv < 0) P.gv = 0; }
    else if (P.gv < 0) { P.gv += acc; if (P.gv > 0) P.gv = 0; }
    if (Math.abs(P.gv) < 0x80) {
      if (!P.spindash) {
        P.roll = false; addY(-(19 - P.yRad)); P.yRad = 19; P.xRad = 9; P.anim = 5;
      } else P.gv = P.left ? -0x400 : 0x400;
    }
    P.yv = mul8(P.gv, sin(P.angle));
    var xv = mul8(P.gv, cos(P.angle));
    if (xv > 0x1000) xv = 0x1000;
    if (xv < -0x1000) xv = -0x1000;
    P.xv = xv;
    wallStop();
  }
  function roll() {                         // SonicKnux_Roll
    if (held & (J.LEFT | J.RIGHT)) return;
    if (held & J.DOWN) {
      if (Math.abs(P.gv) >= 0x100) {
        if (P.roll) return;
        P.roll = true; P.yRad = 14; P.xRad = 7; P.anim = 2; addY(5); sfx(8);
        if (!P.gv) P.gv = 0x200;
        return;
      }
      if (!P.onObj) P.anim = 8;
      return;
    }
    if (P.anim === 8) P.anim = 0;
  }

  // ---------------- saltos ----------------
  function jump() {                         // Sonic_Jump
    if (!(pressed & ABC)) return false;
    if (roomOverHead((P.angle + 0x80) & 0xFF) < 6) return false;
    var v = P.water ? 0x380 : 0x680, a = (P.angle - 0x40) & 0xFF;
    P.xv += mul8(v, cos(a));
    P.yv += mul8(v, sin(a));
    P.air = true; P.push = false; P.jumping = true; P.stick = false; P.onObj = false;
    sfx(3);
    P.yRad = 19; P.xRad = 9;
    if (P.roll) { P.rollJump = true; return true; }
    P.yRad = 14; P.xRad = 7; P.anim = 2; P.roll = true;
    addY(5);
    return true;
  }
  function jumpHeight() {                   // Sonic_JumpHeight
    if (P.jumping) {
      var cap = P.water ? -0x200 : -0x400;
      if (cap > P.yv && !(held & ABC)) P.yv = cap;
      return;
    }
    if (!P.spindash && P.yv < -0xFC0) P.yv = -0xFC0;
  }
  function chgJumpDir() {                   // Sonic_ChgJumpDir
    var c = consts(), top = c.top, acc = c.acc * 2;
    if (!P.rollJump) {
      var v = P.xv;
      if (held & J.LEFT) {
        P.left = true; v -= acc;
        if (v <= -top) { v += acc; if (v > -top) v = -top; }
      }
      if (held & J.RIGHT) {
        P.left = false; v += acc;
        if (v >= top) { v -= acc; if (v < top) v = top; }
      }
      P.xv = v;
    }
    // Sonic_JumpPeakDecelerate
    if (P.yv < -0x400 || P.yv >= 0) return;
    var d = P.xv >> 5;
    if (!d) return;
    P.xv -= d;
  }
  function jumpAngle() {                    // Player_JumpAngle
    var a = P.angle;
    if (!a) return;
    if (a >= 0x80) { a += 2; if (a > 0xFF) a = 0; }
    else { a -= 2; if (a < 0) a = 0; }
    P.angle = a & 0xFF;
  }

  // ---------------- pendientes ----------------
  function slopeResist() {                  // Player_SlopeResist
    if (((P.angle + 0x60) & 0xFF) >= 0xC0) return;
    var d = mul8(0x20, sin(P.angle));
    if (P.gv) { P.gv += d; return; }
    if (Math.abs(d) >= 0x0D) P.gv += d;
  }
  function rollRepel() {                    // Player_RollRepel
    if (((P.angle + 0x60) & 0xFF) >= 0xC0) return;
    var d = mul8(0x50, sin(P.angle));
    if (P.gv >= 0) { if (d < 0) d >>= 2; }
    else if (d >= 0) d >>= 2;
    P.gv += d;
  }
  function slopeRepel() {                   // Player_SlopeRepel
    if (P.stick) return;
    if (P.moveLock) { P.moveLock--; return; }
    if (((P.angle + 0x18) & 0xFF) < 0x30) return;
    if (Math.abs(P.gv) >= 0x280) return;
    P.moveLock = 30;
    var d = (P.angle + 0x30) & 0xFF;
    if (d >= 0x60) { P.air = true; return; }
    if (d >= 0x30) P.gv += 0x80; else P.gv -= 0x80;
  }

  // ---------------- spindash ----------------
  var DASH = [0x800, 0x880, 0x900, 0x980, 0xA00, 0xA80, 0xB00, 0xB80, 0xC00];
  function spindash() {                     // SonicKnux_Spindash
    if (!P.spindash) {
      if (P.anim !== 8 || !(pressed & ABC)) return false;
      P.anim = 9; sfx(8); P.spindash = true; P.sdCount = 0;
      levelBound(); anglePos();
      return true;
    }
    if (!(held & J.DOWN)) {
      P.yRad = 14; P.xRad = 7; P.anim = 2; addY(5);
      P.spindash = false;
      P.gv = DASH[P.sdCount >> 8];
      if (P.left) P.gv = -P.gv;
      P.roll = true; sfx(8);
    } else {
      if (P.sdCount) { P.sdCount -= P.sdCount >> 5; if (P.sdCount < 0) P.sdCount = 0; }
      if (pressed & ABC) {
        P.anim = 9; sfx(8);
        P.sdCount += 0x200; if (P.sdCount > 0x800) P.sdCount = 0x800;
      }
    }
    levelBound(); anglePos();
    return true;
  }

  // ---------------- límites del nivel (Player_LevelBound) ----------------
  function levelBound() {
    var nx = Math.floor((P.X + P.xv) / 256);
    var minX = ((ram[R.BND_L] + 1) & 0xFF) * 256 + 0x10, maxX = ram[R.BND_R] * 256 + 0xF0;
    if (nx < minX || nx > maxX) {
      P.X = (nx < minX ? minX : maxX) * 256;
      P.xv = 0; P.gv = 0;
    }
  }
  function moveSprite(grav) {
    P.X += P.xv; P.Y += P.yv;
    if (grav) P.yv += 0x38;
  }

  // ---------------- colisión en el aire (SonicKnux_DoLevelCollision) ----------------
  function touchFloorSpin() {                // Player_TouchFloor_Check_Spindash
    if (P.spindash) { landFlags(); return; }
    P.anim = 0; touchFloor();
  }
  function landFlags() {
    P.air = false; P.push = false; P.rollJump = false; P.jumping = false; P.spring = false;
  }
  function touchFloor() {                   // Player_TouchFloor
    var old = P.yRad;
    P.yRad = 19; P.xRad = 9;
    if (P.roll && !P.spindash) {
      P.roll = false; P.anim = 0;
      var d = old - 19;
      if (((P.angle + 0x40) & 0xFF) >= 0x80) d = -d;
      addY(d);
    }
    landFlags();
  }
  function doLevelCollision() {
    var q = (atan(P.xv, P.yv) - 0x20) & 0xC0, w, f, c;
    if (q === 0x40) {                          // Player_HitLeftWall
      w = checkLeftWall();
      if (w.d < 0) { addX(-w.d); P.xv = 0; P.gv = P.yv; }
      return hitCeiling();
    }
    if (q === 0x80) {                          // Player_HitCeilingAndWalls
      w = checkLeftWall(); if (w.d < 0) { addX(-w.d); P.xv = 0; }
      w = checkRightWall(); if (w.d < 0) { addX(w.d); P.xv = 0; }
      c = checkCeiling();
      if (c.d >= 0) return;
      addY(-c.d);
      if (!((c.a + 0x20) & 0x40)) { P.yv = 0; return; }
      P.angle = c.a; touchFloorSpin();
      P.gv = P.yv; if (s8(c.a) < 0) P.gv = -P.gv;
      return;
    }
    if (q === 0xC0) {                          // loc_12102
      w = checkRightWall();
      if (w.d < 0) { addX(w.d); P.xv = 0; P.gv = P.yv; }
      c = checkCeiling();
      if (c.d < 0) { addY(-c.d); if (P.yv < 0) P.yv = 0; return; }
      if (P.yv < 0) return;
      f = checkFloor();
      if (f.d >= 0) return;
      addY(f.d); P.angle = f.a; P.yv = 0; P.gv = P.xv; touchFloorSpin();
      return;
    }
    // hacia abajo
    w = checkLeftWall(); if (w.d < 0) { addX(-w.d); P.xv = 0; }
    w = checkRightWall(); if (w.d < 0) { addX(w.d); P.xv = 0; }
    f = checkFloor();
    if (f.d >= 0) return;
    var d2 = -(s8(P.yv >> 8) + 8);
    if (!(f.d >= d2 || f.o >= d2)) return;
    P.angle = f.a;
    addY(f.d);
    if (!((f.a + 0x20) & 0x40)) {
      if ((f.a + 0x10) & 0x20) { P.yv >>= 1; }
      else { P.yv = 0; P.gv = P.xv; touchFloorSpin(); return; }
    } else {
      P.xv = 0;
      if (P.yv > 0xFC0) P.yv = 0xFC0;
    }
    touchFloorSpin();
    P.gv = P.yv; if (s8(f.a) < 0) P.gv = -P.gv;
  }
  function hitCeiling() {                   // Player_HitCeiling
    var c = checkCeiling();
    if (c.d < 0) {
      if (-c.d < 0x14) { addY(-c.d); if (P.yv < 0) P.yv = 0; return; }
      var w = checkRightWall();
      if (w.d < 0) { addX(w.d); P.xv = 0; }
      return;
    }
    if (P.yv < 0) return;
    var f = checkFloor();
    if (f.d >= 0) return;
    addY(f.d); P.angle = f.a; P.yv = 0; P.gv = P.xv; touchFloorSpin();
  }

  // ---------------- modos (Sonic_Modes) ----------------
  function mdNormal() {
    if (spindash()) return;
    if (jump()) return;
    slopeResist(); move(); roll(); levelBound();
    moveSprite(false); anglePos(); slopeRepel();
  }
  function mdRoll() {
    if (!P.spindash && jump()) return;
    rollRepel(); rollSpeed(); levelBound();
    moveSprite(false); anglePos(); slopeRepel();
  }
  function mdAir() {                        // MdAir y MdJump son iguales
    jumpHeight(); chgJumpDir(); levelBound();
    moveSprite(true);
    if (P.water) P.yv -= 0x28;
    jumpAngle(); doLevelCollision();
  }
  // Sonic_Hurt: sin control, gravedad $30, hasta tocar el suelo
  function mdHurt() {
    P.X += P.xv; P.Y += P.yv;
    P.yv += P.water ? 0x10 : 0x30;
    levelBound();
    doLevelCollision();
    if (!P.air) { P.hurt = false; P.xv = 0; P.yv = 0; P.gv = 0; P.anim = 0; }
  }

  // ======================= integración con el resto de Somari =======================
  function t1D(a) { return SM.rom.b(0x1D, a); }
  var SCRIPTED = { tube: 1, launcher: 1, launchUp: 1, ramp: 1, reverse: 1, slide: 1, script: 1 };
  var last = null;             // lo que se escribió en las variables de Somari el cuadro anterior

  function feet() {
    var x = xi(), y = yi();
    if (P.air || P.hurt) return [x, y + P.yRad];
    var q = quadrant(P.angle);
    if (q === 0) return [x, y + P.yRad];
    if (q === 0x40) return [x - P.yRad, y];
    if (q === 0x80) return [x, y - P.yRad];
    return [x + P.yRad, y];
  }
  function readFeet() {
    return [(ram[R.PX_HI] << 8) | ram[R.PX_LO], ram[R.PY_HI] * 240 + ram[R.PY_LO]];
  }
  // Toma el estado desde las variables de Somari (al empezar o al volver del motor original)
  function fromSomari() {
    var f = readFeet(), fl = ram[R.PFLAGS];
    P.X = f[0] * 256; P.Y = (f[1] - 19) * 256;
    P.yRad = 19; P.xRad = 9; P.angle = 0; P.stick = false;
    P.left = !!(fl & 0x40);
    var dir = (fl & 1) ? -1 : 1;
    var px = ram[R.GSPD] ? t1D(0xAC52 + (ram[R.GSPD] >> 4)) : 0;
    var st = ram[R.STATE];
    P.air = !!(fl & 0x0C) || st === 8 || st === 6;
    P.roll = st === 0x20 || st === 8;
    if (P.roll) { P.yRad = 14; P.xRad = 7; P.Y += 5 * 256; }
    P.gv = dir * px * 256; P.xv = P.gv;
    P.yv = P.air ? ((fl & 4) ? -1 : 1) * t1D(0xAC62 + (ram[R.VSPD] >> 4)) * 256 : 0;
    P.jumping = false; P.rollJump = false; P.spindash = false; P.hurt = false; P.onObj = false;
    P.push = false; P.moveLock = 0; P.anim = P.roll ? 2 : 0;
    P.layer = ram[R.COL_8B] ? 1 : 0;
    P.water = !!ram[R.WATER];
    last = null;
  }
  S3.reset = function () { fromSomari(); S3.somari = false; S3.stale = false; };

  // Escribe el estado en las variables de Somari que usan la cámara, los objetos y la animación
  function toSomari() {
    var st = animState();
    ram[R.STATE] = st;
    var f = feet();
    rotation();
    // sobre un objeto se informa 1 px más abajo para que el objeto vuelva a sostenerlo
    var bias = P.onObj ? 1 : 0, fy = f[1] + bias;
    if (fy < 0) fy = 0;
    var fx = f[0] & 0xFFFF;
    ram[R.NX_HI] = fx >> 8; ram[R.NX_LO] = fx & 0xFF;
    ram[R.NY_HI] = Math.floor(fy / 240) & 0xFF; ram[R.NY_LO] = fy % 240;
    var sp = Math.abs(P.air || P.hurt ? P.xv : P.gv);
    var g = Math.min(0xF8, Math.round(sp * 0xF8 / 0x600));
    if (sp && !g) g = 1;
    ram[R.GSPD] = g;
    var v = Math.min(0xF8, Math.abs(P.yv) >> 4);
    ram[R.VSPD] = (P.air || P.hurt) ? v : 0;
    var xdir = P.air ? P.xv : (P.xv || P.gv);
    var fl = ram[R.PFLAGS] & 0x82;
    if (xdir < 0 || (!xdir && P.left)) fl |= 1;
    if (P.left) fl |= 0x40;
    if ((P.air || P.hurt) && P.yv < 0) fl |= 0x0C;
    ram[R.PFLAGS] = fl;
    ram[R.PFLAGS2] = (ram[R.PFLAGS2] & 0xFB) | (P.roll || P.spindash ? 4 : 0);
    ram[R.COL_8B] = P.layer;
    last = { nx: fx, ny: fy, bias: bias, fl: fl, vs: ram[R.VSPD], st: st, hurt: ram[R.HURT], cd: ram[0xCD] };
  }
  function animState() {
    var st;
    if (P.hurt) st = 0x0A;
    else if (P.spindash) st = 0x1F;
    else if (P.air) st = P.roll ? 8 : (P.spring ? 6 : 1);
    else if (P.roll) st = 0x20;
    else if (P.anim === 0x0D) st = 7;
    else if (P.push) st = 0x0D;
    else if (P.anim === 8) st = 0x0B;
    else if (P.anim === 7) st = 0x0C;
    else st = P.gv ? 1 : 0;
    return st;
  }
  // Cuadros girados de Somari (los de sus loops): 0x19/0x20 = 45° (según hacia dónde mira),
  // 0x14 = 90°, 0x25 = 180°; los bits de $98 los espejan. Se eligen como lo hacen los
  // manejadores de loop del original ($8AAF, $8E67, $8CC9, $8D64).
  function rotation() {
    ram[R.LOOP] = 0; ram[R.ANGLE] = 0;
    if (P.air || P.hurt || ram[R.STATE] !== 1) return false;
    var r = s8(P.angle), f = P.gv >= 0, ml = P.xv < 0, a = Math.abs(r), L, A;
    if (a < 0x10) return false;
    if (a < 0x30) { if (r < 0) { L = f ? 0x19 : 0x20; A = 0; } else { L = f ? 0x20 : 0x19; A = 0x40; } }
    else if (a < 0x50) { L = 0x14; A = r < 0 ? (f ? 0 : 0x80) : (f ? 0xC0 : 0x40); }
    else if (a < 0x70) { if (r < 0) { L = ml ? 0x20 : 0x19; A = 0x80; } else { L = ml ? 0x19 : 0x20; A = 0xC0; } }
    else { L = 0x25; A = ml ? 0xC0 : 0x80; }
    ram[R.LOOP] = L; ram[R.ANGLE] = A;
    return true;
  }
  // Después de dibujar al jugador (Player.animate): en los cuadros girados se desplazan sus
  // sprites para que el centro del dibujo quede 4 px hacia la superficie desde el centro
  // físico, como en el cuadro vertical.
  S3.fixSprite = function (from, to) {
    if (!S3.enabled || S3.somari || !ram[R.LOOP] || to <= from) return;
    var Sp = SM.Spr, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, i;
    for (i = from; i < to; i++) {
      if (!Sp.on[i]) continue;
      x0 = Math.min(x0, Sp.x[i]); x1 = Math.max(x1, Sp.x[i] + 8);
      y0 = Math.min(y0, Sp.y[i]); y1 = Math.max(y1, Sp.y[i] + 8);
    }
    if (x0 > x1) return;
    var camX = (ram[R.CAM_XH] << 8) | ram[R.CAM_XL], camY = ram[R.CAM_YH] * 240 + ram[R.CAM_YL];
    var tx = xi() - camX - 4 * sin(P.angle) / 256, ty = yi() - camY + 4 * cos(P.angle) / 256;
    var dx = Math.round(tx - (x0 + x1) / 2), dy = Math.round(ty - (y0 + y1) / 2);
    for (i = from; i < to; i++) { Sp.x[i] += dx; Sp.y[i] += dy; }
  };

  // Cambios hechos por objetos, jefe o cámara desde el último cuadro
  function syncIn() {
    if (!last) return;
    var f = readFeet(), dx = f[0] - last.nx, raw = f[1] - last.ny, dy = raw + last.bias;
    if (dx > 0x8000) dx -= 0x10000; else if (dx < -0x8000) dx += 0x10000;
    var st = ram[R.STATE], fl = ram[R.PFLAGS];
    var wasOnObj = P.onObj;
    P.onObj = false;
    if (dx) {
      addX(dx);
      // empujado contra su movimiento (monitor, límite de la cámara); el arrastre de 1 px
      // de una plataforma no lo frena
      if ((Math.abs(dx) > 1 || st === 0x0D) && ((dx > 0 && P.xv < 0) || (dx < 0 && P.xv > 0))) {
        P.xv = 0; if (!P.air) P.gv = 0;
      }
      if (st === 0x0D) P.push = true;
    }
    if (dy) addY(dy);
    // golpe al jefe ($9861): rebota
    if (ram[0xCD] === 0x32 && last.cd !== 0x32) {
      P.xv = -P.xv; P.gv = -P.gv;
      if (P.air && P.yv > 0) P.yv = -P.yv;
      return;
    }
    // daño
    if (st === 0x0A && last.st !== 0x0A) {
      P.hurt = true; P.air = true; P.roll = false; P.spindash = false; P.jumping = false;
      if (P.yRad !== 19) { addY(P.yRad - 19); }
      P.yRad = 19; P.xRad = 9; P.angle = 0; P.onObj = false;
      P.yv = P.water ? -0x200 : -0x400;
      P.xv = (fl & 1) ? -0x200 : 0x200; if (P.water) P.xv >>= 1;
      P.gv = 0;
      return;
    }
    // rebote al destruir un enemigo o romper un monitor
    if ((fl & 0x0C) && !(last.fl & 0x0C) && ram[R.VSPD] === 0x30) {
      if (P.yv >= 0) P.yv = -P.yv; else P.yv += 0x100;
      if (!P.air) { P.air = true; }
      return;
    }
    // un objeto lo sostiene (monitor, plataforma): corrigió la altura y anuló la caída
    if (raw < 0 && ram[R.VSPD] === 0 && (P.air ? P.yv >= 0 : wasOnObj)) {
      if (P.air) { P.gv = P.xv; P.yv = 0; P.angle = 0; touchFloorSpin(); }
      P.onObj = true;
      return;
    }
    if (wasOnObj && !P.air) {                // se bajó del objeto
      P.air = true; P.yv = 0;
    }
  }

  // Tiles especiales bajo los sensores de Somari (x±7 a la altura de los pies) y anillos
  function cellFX(x, y) {
    var c = SM.Terrain.cell(x, y);
    if (!c) return null;
    var fx = SM.Terrain.effect(c.m);
    if (!fx && SM.Level.mtCol[c.m] === 0x6A) fx = 'loopTop';
    return fx ? { fx: fx, t: SM.Level.mtCol[c.m], m: c.m, base: c.ringBase, x: x, y: y } : null;
  }
  function specials() {
    var f = feet(), hit;
    var pts = [[f[0] - 7, f[1]], [f[0] + 7, f[1]], [f[0], f[1] + 1], [xi(), yi()]];
    for (var i = 0; i < pts.length; i++) {
      hit = cellFX(pts[i][0], pts[i][1]);
      if (!hit) continue;
      switch (hit.fx) {
        case 'layer': P.layer = hit.t & 1; break;
        case 'loopTop': if (!P.air) P.layer = P.xv < 0 ? 1 : 0; break;
        case 'water':
          if (hit.t === 0x98) { if (!ram[R.WATER]) { ram[R.WATER] = 1; enterWater(); } }
          else if (ram[R.WATER]) { ram[R.WATER] = 0; if (!ram[0xB5]) ram[R.MUSIC] = 0x26; exitWater(); }
          break;
        case 'spikes':
          if (i < 3 && !P.hurt && !(ram[R.PFLAGS2] >= 8) && !ram[R.HURT] && !P.air) SM.Collision.hurt();
          break;
        case 'spring':                         // sólo al pisarlo desde arriba
          if (i < 3 && !P.air && !P.hurt && quadrant(P.angle) === 0 && (pts[i][1] & 15) < 8) {
            P.air = true; P.spring = true; P.jumping = false; P.roll = false; P.onObj = false;
            if (P.yRad !== 19) addY(P.yRad - 19);
            P.yRad = 19; P.xRad = 9; P.angle = 0;
            P.yv = hit.t === 0x88 ? -0xA00 : -0x1000; sfx(6);
          }
          break;
        default:
          if (SCRIPTED[hit.fx] && i < 3) S3.enterSomari = true;
      }
    }
    collectRings();
  }
  function enterWater() { P.water = true; P.xv >>= 1; P.gv >>= 1; P.yv >>= 2; }
  function exitWater() { P.water = false; P.yv *= 2; if (P.yv < -0x1000) P.yv = -0x1000; }
  // anillos del mapa que tocan la caja del jugador ($8F72)
  function collectRings() {
    var x = xi(), y = yi(), r = P.yRad;
    for (var yy = y - r + 2; yy <= y + r - 2; yy += 8) {
      for (var xx = x - 8; xx <= x + 8; xx += 8) {
        var c = SM.Terrain.cell(xx, yy);
        if (!c || c.m < 0xE0 || SM.Level.mtCol[c.m] < 0xE0) continue;
        var t = SM.Level.mtCol[c.m] & 0x1F, T17 = function (a) { return SM.rom.b(0x17, a); };
        var k = (T17(0x902D + t) + c.ringBase) & 0xFF;
        if (!(ram[R.RINGS_BITS + k] & T17(0x904D + t))) continue;
        ram[R.RINGS_BITS + k] &= T17(0x906D + t);
        SM.Collision.addRing();
      }
    }
  }

  // ---------------- cuadro ----------------
  function somariPhase() {
    var st = ram[R.STATE];
    return st === 9 || (st & 0x80) || ram[0xB6] >= 3 || ram[0xEA] || ram[0xAF];
  }
  S3.update = function () {
    held = ram[R.JOY]; pressed = ram[R.JOYP];
    SM.Terrain.idle(3);
    if (S3.somari || somariPhase()) {
      SM.Player.update();
      S3.stale = true;
      if (S3.somari && ++S3.somariT > 8 && !(ram[R.PFLAGS] & 0x0C) && ram[R.VSPD] === 0 &&
          ram[R.STATE] !== 8 && ram[R.STATE] !== 0x20 && ram[R.STATE] !== 0x2B) S3.somari = false;
      return;
    }
    if (S3.stale) { fromSomari(); S3.stale = false; }
    syncIn();
    if (P.hurt) mdHurt();
    else if (P.air) mdAir();
    else if (P.roll) mdRoll();
    else mdNormal();
    S3.enterSomari = false;
    specials();
    toSomari();
    if (S3.enterSomari) { S3.somari = true; S3.somariT = 0; }
  };
  S3.attacking = function () { return P.roll || P.spindash; };
  // para pruebas
  S3._dbg = { rightWall: rightWall, leftWall: leftWall, checkFloor: checkFloor, roomInFront: roomInFront, anglePos: anglePos };
})();
