// Memoria de estado del juego.
// El port conserva la misma distribución de variables que el juego original (RAM de la NES),
// así la lógica portada mantiene exactamente la aritmética de 8 bits del original.
// Los nombres documentan lo que se descubrió en la ingeniería inversa.
'use strict';
var SM = window.SM || (window.SM = {});

SM.ram = new Uint8Array(0x800);

SM.R = {
  FRAME: 0x06,          // contador de cuadros (NMI)
  // Jugador: posición confirmada (X en páginas de 256, Y en páginas de 240)
  PX_HI: 0x0A, PX_LO: 0x0B, PY_HI: 0x0C, PY_LO: 0x0D,
  // Jugador: posición candidata de este cuadro
  NX_HI: 0x0E, NX_LO: 0x0F, NY_HI: 0x10, NY_LO: 0x11,
  PSCR_X: 0x12, PSCR_Y: 0x13,   // posición en pantalla
  GSPD: 0x14,           // rapidez horizontal (magnitud, 0..F8)
  VSPD: 0x15,           // rapidez vertical (magnitud)
  ANIM: 0x16, ANIM_FRAME: 0x17, ANIM_TIMER: 0x18,
  PFLAGS: 0x19,         // b0=izquierda, b1=?, b2=subiendo, b3=?, b6=orientación, b7=?
  PFLAGS2: 0x1A,        // b1=invencible, b2=rodando
  AFP_LO: 0x1B, AFP_HI: 0x1C,   // puntero al cuadro de animación
  STATE: 0x1D, PREV_STATE: 0x1E,
  SPR_X: 0x1F, SPR_XH: 0x20, SPR_Y: 0x21, SPR_YH: 0x22,
  T25: 0x25, AGAIN: 0x26, T28: 0x28, T2B: 0x2B,
  CAM_XH: 0x50, CAM_XL: 0x51, CAM_YH: 0x52, CAM_YL: 0x53,
  NCAM_XH: 0x54, NCAM_XL: 0x55, NCAM_YH: 0x56, NCAM_YL: 0x57,
  NT_SEL: 0x5A,
  SX_HI: 0x63, SX_LO: 0x64, SY_HI: 0x65, SY_LO: 0x66,   // sensor de colisión
  ROWW: 0x6C,           // ancho del nivel en chunks
  MUSIC: 0x81, SFX: 0x82,
  IRQMODE: 0x84,
  COL_HIT: 0x88, COL_TYPE: 0x89, COL_ROW: 0x8A, COL_8B: 0x8B, COL_CHUNK: 0x8C,
  LOOP: 0x90, RINGBASE: 0x91,
  OBJ_N: 0x96, OBJ_I: 0x97,
  ANGLE: 0x98, SHIELD: 0x99, WATER: 0x9A, HURT: 0x9B,
  BND_L: 0xA1, BND_R: 0xA2, BND_T: 0xA3, BND_B: 0xA4,
  SPRBANK: 0xA5, SPRBANK2: 0xA6,
  LOCK: 0xAB,           // bloqueo de control (tras spindash/resorte lateral)
  PSCR_XH: 0xAC, PSCR_YH: 0xAD,
  DYING: 0xAE,
  JOY: 0x300, JOYP: 0x302,
  CHR0: 0x32B, CHR1: 0x32C, CHR2: 0x32D, CHR3: 0x32E, CHR4: 0x32F, CHR5: 0x330,
  ZONE_P: 0x331,
  SEC_CNT: 0x334, IDLE: 0x335,
  RING_H: 0x336, RING_T: 0x337, RING_O: 0x338,
  TIME_M: 0x339, TIME_T: 0x33A, TIME_S: 0x33B,
  LIVES: 0x33C,
  BGANIM: 0x349,        // 4 bancos de animación del fondo
  ZONE: 0x4EA, ACT: 0x4EB,
  CHUNK_A: 0x4E7, CHUNK_B: 0x4E8, ZBANK: 0x4E9,
  ROWS: 0x4EE,          // tabla fila*ancho
  OBJ_SPAWNED: 0x369,
  RINGS_BITS: 0x600
};

// Arreglos de objetos (23 ranuras)
SM.O = {
  N: 0x17,
  TYPE: 0x500, XL: 0x517, XH: 0x52E, YL: 0x545, YH: 0x55C, P: 0x573, SRC: 0x58A,
  SXL: 0x5A1, SXH: 0x5B8, SYL: 0x5CF, SYH: 0x5E6
};

SM.JOY = { A: 0x80, B: 0x40, SELECT: 0x20, START: 0x10, UP: 0x08, DOWN: 0x04, LEFT: 0x02, RIGHT: 0x01 };
