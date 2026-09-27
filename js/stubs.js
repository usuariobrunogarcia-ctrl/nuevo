// Stubs temporales (se reemplazan por los módulos definitivos)
'use strict';
var SM = window.SM || (window.SM = {});
SM.ZoneCard = SM.ZoneCard || { start: function (cb) { cb(); } };
SM.Title = SM.Title || { start: function () { SM.Game.newGame(); }, continueScreen: function () { SM.Game.newGame(); } };
SM.Results = SM.Results || { start: function (cb) { SM.ram[SM.R.ACT] = (SM.ram[SM.R.ACT] + 1) % 3; cb(); }, zoneClear: function () { SM.Title.start(); } };
SM.Ending = SM.Ending || { capsuleSequence: function () {}, drawCapsule: function () {}, actEnd: function () {
  var ram = SM.ram;
  switch (ram[0xB5]) {
    case 1: case 4: ram[0xB1] = 6; ram[0xB5]++; break;
    case 2: case 5: if (ram[SM.R.SEC_CNT] === 0) { ram[0xB1]--; if (ram[0xB1] & 0x80) { ram[0xB5]++; ram[0x333] = 5; } } break;
    case 3: SM.Game.palFade(); if (ram[0x333] === 9) { ram[0xB5] = 0; ram[0xB2] = 4; } break;
    case 6: SM.Game.palFade(); if (ram[0x333] === 9) { ram[SM.R.MUSIC] = 0; ram[0xB5] = 0; ram[0xB9] = 0; ram[0xB8] = 0; ram[0xB2] = 5; } break;
  }
} };
SM.Boss = SM.Boss || { update: function () {}, draw: function () {} };
