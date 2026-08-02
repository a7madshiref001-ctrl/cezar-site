/* ============================================================
   سيزر جيم — صفحة الهدية

   شاشتين: مبروك، وبعدين الهدية إيه.
   الصوت بيبدأ مع ضغطة «افتح الهدية» — المتصفحات بتمنع الصوت
   من غير تفاعل من المستخدم أصلًا، فالضغطة هي المدخل الطبيعي.
   لو ملف الصوت مش موجود، الصفحة بتشتغل عادي وزرار الصوت بيختفي.
   ============================================================ */
(function () {
'use strict';

var $ = function (s) { return document.querySelector(s); };
var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─── صورة باسم: تظهر بس لو الملف موجود ─── */
(function photo() {
  var box = $('#gPhoto'), img = $('#gPhotoImg');
  if (!img) return;
  img.addEventListener('load', function () { if (img.naturalWidth) box.hidden = false; });
  img.addEventListener('error', function () { box.remove(); });
  if (img.complete && img.naturalWidth) box.hidden = false;
})();

/* ─── العنوان: نفتح القناع بعد ما الحركة تخلص ─── */
(function heading() {
  var h1 = document.querySelector('.g-h1'); if (!h1) return;
  if (reduce) { h1.classList.add('done'); return; }
  setTimeout(function () { h1.classList.add('done'); }, 1750);
})();

/* ─── الانتقال بين الشاشتين ─── */
(function screens() {
  var btn = $('#open');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var cur = $('.g-screen.on'), next = document.querySelector('.g-screen[data-s="2"]');
    startAudio();
    cur.classList.add('out');
    setTimeout(function () {
      cur.classList.remove('on', 'out');
      next.classList.add('on');
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, reduce ? 0 : 460);
  });
})();

/* ─── الصوت ─── */
var audio = $('#anthem'), soundBtn = $('#sound'), wanted = false;

function startAudio() {
  if (!audio) return;
  wanted = true;
  audio.volume = 0;
  var p = audio.play();
  if (p && p.catch) p.catch(function () { /* المتصفح رفض — الصفحة بتكمّل عادي */ });
  /* دخول ناعم للصوت بدل ما ينط في وش الواحد */
  var t0 = null, target = 0.55;
  requestAnimationFrame(function fade(t) {
    if (t0 === null) t0 = t;
    var k = Math.min(1, (t - t0) / 2600);
    audio.volume = target * k;
    if (k < 1 && wanted) requestAnimationFrame(fade);
  });
}

if (audio && soundBtn) {
  /* بنتأكد إن الملف موجود قبل ما نوري الزرار */
  fetch(audio.getAttribute('src'), { method: 'HEAD' })
    .then(function (r) { if (r.ok) soundBtn.hidden = false; })
    .catch(function () {});

  soundBtn.addEventListener('click', function () {
    if (audio.paused) {
      soundBtn.classList.remove('muted');
      startAudio();
    } else {
      wanted = false;
      audio.pause();
      soundBtn.classList.add('muted');
    }
  });
}

/* ─── غبار دهبي بيطلع لفوق ─── */
(function dust() {
  var c = $('#dust');
  if (!c || reduce) return;
  var x = c.getContext('2d'), bits = [], w, h, raf;

  function size() {
    w = c.width = innerWidth;
    h = c.height = innerHeight;
    var count = Math.min(90, Math.round(w * h / 26000));
    bits = [];
    for (var i = 0; i < count; i++) bits.push(spawn(true));
  }
  function spawn(anywhere) {
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 12,
      r: 0.6 + Math.random() * 1.9,
      v: 0.14 + Math.random() * 0.42,
      d: (Math.random() - 0.5) * 0.22,
      a: 0.16 + Math.random() * 0.42,
      t: Math.random() * 6.28
    };
  }
  function frame() {
    x.clearRect(0, 0, w, h);
    for (var i = 0; i < bits.length; i++) {
      var b = bits[i];
      b.y -= b.v; b.t += 0.012;
      b.x += b.d + Math.sin(b.t) * 0.22;
      if (b.y < -12) bits[i] = spawn(false);
      x.beginPath();
      x.arc(b.x, b.y, b.r, 0, 6.2832);
      x.fillStyle = 'rgba(232,177,76,' + b.a + ')';
      x.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  size();
  addEventListener('resize', size);
  frame();

  /* بنوقف الرسم لما الصفحة تبقى مخفية عشان البطارية */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(frame);
  });
})();

})();
