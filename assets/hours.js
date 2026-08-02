/* ============================================================
   سيزر جيم — منطق المواعيد
   منفصل في ملف لوحده لأنه أهم حاجة في الموقع لازم تكون مضبوطة:
   عليه بيتبنى «مفتوح الآن»، العدّاد، وتمييز الفترة الشغّالة في الجدول.

   الفترات في data/site.js متكتوبة بالدقايق من نص الليل، والنهاية
   لو أكبر من 1440 معناها إنها بتكمّل لليوم اللي بعده (الجيم بيفضل
   فاتح لحد الفجر في السبت والإثنين والأربعاء).
   ============================================================ */
window.CezarHours = (function () {
'use strict';

var DAY = 86400000, MIN = 60000;

function midnight(d, offsetDays) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (offsetDays || 0)).getTime();
}

/* كل الفترات حوالين تاريخ معيّن، كتواريخ حقيقية ومرتّبة.
   مهم: الجدول بيقسّم فترة المجموعة الواحدة على أكتر من سطر لما
   بتعدّي نص الليل — مثلًا رجال من 3 م لـ 7 ص، وبعدها على طول
   رجال من 7 ص لـ 5 م. دول فترة واحدة متصلة في الحقيقة، فبنلزّقهم
   في بعض. من غير كده العدّاد بيقول «باقي ساعتين» وهو لسه فاضل 5.
   raw=true بيرجّع السطور زي ما هي من غير لزق. */
function intervals(segments, around, back, fwd, raw) {
  var out = [];
  for (var off = (back == null ? -2 : back); off <= (fwd == null ? 9 : fwd); off++) {
    var base = midnight(around, off);
    var dow = new Date(base).getDay();
    (segments[String(dow)] || []).forEach(function (s) {
      out.push({ g: s.g, from: s.from, dow: dow, start: base + s.from * MIN, end: base + s.to * MIN });
    });
  }
  out.sort(function (a, b) { return a.start - b.start; });
  if (raw) return out;

  var merged = [];
  out.forEach(function (iv) {
    var last = merged[merged.length - 1];
    if (last && last.g === iv.g && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
      last.parts.push({ dow: iv.dow, from: iv.from });
      return;
    }
    merged.push({ g: iv.g, from: iv.from, dow: iv.dow, start: iv.start, end: iv.end,
                  parts: [{ dow: iv.dow, from: iv.from }] });
  });
  return merged;
}

/* الحالة اللحظية: مفتوح ولا مقفول، والفترة الحالية أو الجاية */
function status(segments, now) {
  var t = now.getTime(), iv = intervals(segments, now), i;
  for (i = 0; i < iv.length; i++) {
    if (t >= iv[i].start && t < iv[i].end) {
      return { open: true, seg: iv[i], next: iv[i + 1] || null };
    }
  }
  for (i = 0; i < iv.length; i++) if (iv[i].start > t) return { open: false, seg: null, next: iv[i] };
  return { open: false, seg: null, next: null };
}

/* 02:14:33 */
function hhmm(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  var p = function (v) { return (v < 10 ? '0' : '') + v; };
  return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
}

/* 7 ص / 10:30 م — من وقت بالدقايق أو من timestamp */
function clock(ms) {
  var d = new Date(ms), h = d.getHours(), m = d.getMinutes();
  return (h % 12 || 12) + (m ? ':' + (m < 10 ? '0' + m : m) : '') + ' ' + (h < 12 ? 'ص' : 'م');
}
function clockFromMins(mins) {
  var m = ((mins % 1440) + 1440) % 1440;
  return clock(new Date(2020, 0, 1, 0, 0).getTime() + m * MIN);
}

return {
  intervals: intervals,
  status: status,
  hhmm: hhmm,
  clock: clock,
  clockFromMins: clockFromMins,
  DAY: DAY, MIN: MIN
};
})();
