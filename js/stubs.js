// Stubs temporales (se reemplazan por los módulos definitivos)
'use strict';
var SM = window.SM || (window.SM = {});
SM.ZoneCard = SM.ZoneCard || { start: function (cb) { cb(); } };
SM.Title = SM.Title || { start: function () { SM.Game.newGame(); }, continueScreen: function () { SM.Game.newGame(); } };
SM.Boss = SM.Boss || { update: function () {}, draw: function () {} };
