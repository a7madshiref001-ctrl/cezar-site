/* ============================================================
   سيزر جيم — محرّك الموقع
   كل البيانات جاية من data/site.js (window.CEZAR_DATA)
   ============================================================ */
(function () {
'use strict';

var D = window.CEZAR_DATA;
var IMG = window.CEZAR_IMG || {};
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* أرقام إنجليزي بفاصلة الآلاف */
function n(v) { return Number(v).toLocaleString('en-US'); }
/* الخصم — بنقرّب لأعلى لأقرب 5 جنيه */
function disc(price, pct) { return Math.ceil(price * (1 - pct / 100) / 5) * 5; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
  return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* تصريف «جلسة» صح: من 3 لـ 10 جمع (جلسات)، و11 وفوق مفرد (جلسة) */
function sess(k) { return k + ' ' + (k >= 3 && k <= 10 ? 'جلسات' : 'جلسة'); }

/* تجميع نداءات السكرول في فريم واحد.
   كل مهمة ليها مفتاح خاص، والمفتاح بيتصفّر جوه الفريم نفسه —
   فلو المتصفح وقف الفريمات (تاب مخفي) السكرول ميتجمّدش بعد ما يرجع. */
var rafJobs = new Map(), rafOn = false;
function raf(fn) {
  rafJobs.set(fn, 1);
  if (rafOn) return;
  rafOn = true;
  requestAnimationFrame(function () {
    rafOn = false;
    var jobs = Array.from(rafJobs.keys()); rafJobs.clear();
    jobs.forEach(function (j) { try { j(); } catch (e) {} });
  });
}

/* عدّاد أرقام — بنكتب الرقم النهائي فورًا، والحركة تحسين فوقه.
   كده لو الـ rAF اتعطّل (تاب مخفي مثلًا) الرقم يفضل صح. */
function countTo(el, value) {
  var from = +String(el.textContent).replace(/[^0-9.-]/g, '') || 0;
  el.textContent = n(value);
  if (reduce || from === value) return;
  var t0 = null;
  requestAnimationFrame(function step(t) {
    if (t0 === null) t0 = t;
    var k = Math.min(1, (t - t0) / 480);
    el.textContent = n(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step); else el.textContent = n(value);
  });
}

/* ─── توست ─── */
var toastEl = $('#toast div'), toastT;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2300);
}

/* ─── الصور: placeholder ضبابي ثم تحميل عند الاقتراب ─── */
function fillImg(box) {
  var key = box.dataset.img;
  if (!key) return;
  var m = IMG[key];
  if (m && m.lqip) box.style.setProperty('--lqip', 'url("' + m.lqip + '")');
  var img = document.createElement('img');
  img.alt = box.dataset.alt || '';
  img.loading = 'lazy';
  img.decoding = 'async';
  if (m) {
    /* الوصف w لازم يساوي العرض الحقيقي للملف، وإلا المتصفح يختار نسخة غلط */
    img.srcset = 'assets/img/' + key + '@half.webp ' + m.hw + 'w, assets/img/' + key + '.webp ' + m.w + 'w';
    img.width = m.w; img.height = m.h;   /* يمنع قفزة اللاي-أوت */
  }
  img.sizes = box.dataset.sizes || '(max-width:900px) 100vw, 50vw';
  img.src = 'assets/img/' + key + '.webp';
  function done() { img.classList.add('loaded'); box.classList.add('done'); }
  img.addEventListener('load', done);
  if (img.complete) done();
  box.classList.add('ph');
  box.appendChild(img);
}
function mountImages(root) { $$('.ph[data-img]', root || document).forEach(fillImg); }

/* ─── السبلاش ─── */
(function splash() {
  var s = $('#splash');
  if (!s) return;
  if (sessionStorage.getItem('cezarSeen') || reduce) { s.remove(); return; }
  var hide = function () {
    s.classList.add('gone');
    sessionStorage.setItem('cezarSeen', '1');
    setTimeout(function () { s.remove(); }, 700);
  };
  setTimeout(hide, 2350);
  s.addEventListener('click', hide);
})();

/* ─── الهيدر: خلفية + إخفاء عند النزول + الرابط النشط ─── */
(function header() {
  var hdr = $('#hdr'), dock = $('#dock'), fab = $('#fab');
  var mark = $('#brandMark');
  var last = 0;
  var sections = $$('main section[id]');
  var navLinks = $$('#nav a');

  function frame() {
    var y = window.pageYOffset;
    hdr.classList.toggle('solid', y > 40);
    if (mark) mark.src = y > 40 ? 'assets/img/emblem-dark.png' : 'assets/img/emblem-light.png';
    hdr.classList.toggle('hide', y > 420 && y > last && !$('#sheet').classList.contains('open'));
    var show = y > 120;   /* الزرار يبان بدري ويفضل معاك طول الصفحة */
    dock.classList.toggle('up', show);
    fab.classList.toggle('up', show);

    var cur = '', mid = y + window.innerHeight * 0.32;
    sections.forEach(function (sec) { if (sec.offsetTop <= mid) cur = sec.id; });
    navLinks.forEach(function (a) { a.classList.toggle('act', a.hash === '#' + cur); });

    last = y;
  }
  addEventListener('scroll', function () { raf(frame); }, { passive: true });
  frame();
})();

/* ─── قائمة الموبايل ─── */
(function sheet() {
  var b = $('#burger'), sh = $('#sheet');
  function set(open) {
    b.classList.toggle('on', open);
    sh.classList.toggle('open', open);
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    sh.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) $$('#sheet a').forEach(function (a, i) { a.style.animationDelay = (0.1 + i * 0.055) + 's'; });
  }
  b.addEventListener('click', function () { set(!sh.classList.contains('open')); });
  sh.addEventListener('click', function (e) { if (e.target.tagName === 'A') set(false); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
})();

/* ─── الظهور مع السكرول ─── */
(function reveal() {
  if (reduce) { $$('[data-reveal]').forEach(function (el) { el.classList.add('in'); }); return; }
  var io = new IntersectionObserver(function (rows) {
    rows.forEach(function (r) {
      if (!r.isIntersecting) return;
      r.target.classList.add('in');
      io.unobserve(r.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.06 });
  function watch(root) {
    $$('[data-reveal]', root || document).forEach(function (el) {
      if (!el.classList.contains('in')) io.observe(el);
    });
  }
  watch(); window.__watchReveal = watch;
})();

/* ─── الهيرو: نفتح الـ overflow بعد حركة الدخول ─── */
(function heroLines() {
  var h1 = $('.hero h1'); if (!h1) return;
  if (reduce) { h1.classList.add('done'); return; }
  setTimeout(function () { h1.classList.add('done'); }, 1450);
})();

/* ─── بارالاكس الهيرو ─── */
(function parallax() {
  if (reduce) return;
  var bg = $('.hero-bg');
  if (!bg) return;
  addEventListener('scroll', function () {
    raf(function () {
      var y = window.pageYOffset;
      if (y < window.innerHeight * 1.3) bg.style.setProperty('--par', (y * 0.24) + 'px');
    });
  }, { passive: true });
})();

/* ============================================================
   المواعيد — المنطق كله في assets/hours.js
   ============================================================ */
var GNAME = { men: 'رجال', women: 'سيدات' };
var H = window.CezarHours;
function status(now) { return H.status(D.schedule.segments, now); }
function hhmm(ms) { return H.hhmm(ms); }
function clock(ms) { return H.clock(ms); }

/* «باقي ساعتين و14 دقيقة» أوضح من 02:14:33 لما الوقت طويل.
   المثنى في العربي مالوش رقم: «ساعتين» مش «2 ساعتين». */
function unit(k, one, two, few, many) {
  if (k === 1) return one;
  if (k === 2) return two;
  return k + ' ' + (k <= 10 ? few : many);
}
function leftText(ms) {
  var m = Math.floor(ms / 60000), h = Math.floor(m / 60), mm = m % 60;
  if (h >= 1) return unit(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة') +
                     (mm ? ' و' + unit(mm, 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة') : '');
  if (m >= 1) return unit(m, 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة');
  return 'أقل من دقيقة';
}

/* ─── الحلقة: الفترة الشغّالة دلوقتي ─── */
var ACC = { men: '#A8DC42', women: '#E8B14C' };   /* فسفوري للرجال، ذهبي للسيدات */

(function ring() {
  var sec = $('#live'), fg = $('#ringFg'), gEl = $('#ringGroup'),
      lEl = $('#ringLeft'), note = $('#ringNote');
  if (!sec) return;
  var C = 2 * Math.PI * 116;


  function paint() {
    var now = new Date(), st = status(now), t = now.getTime();
    if (st.open) {
      var seg = st.seg, span = seg.end - seg.start, rest = seg.end - t;
      sec.classList.remove('shut');
      sec.style.setProperty('--acc', ACC[seg.g]);
      fg.style.strokeDashoffset = C * (1 - rest / span);
      gEl.textContent = GNAME[seg.g];
      lEl.innerHTML = '<i>باقي</i> ' + leftText(rest);
      note.innerHTML = 'الفترة من <b>' + clock(seg.start) + '</b> لـ <b>' + clock(seg.end) + '</b>';
    } else {
      sec.classList.add('shut');
      sec.style.setProperty('--acc', 'var(--faint)');
      fg.style.strokeDashoffset = C;
      gEl.textContent = 'مقفول';
      if (st.next) {
        lEl.innerHTML = '<i>يفتح بعد</i> ' + leftText(st.next.start - t);
        note.innerHTML = 'الفترة الجاية <b>' + GNAME[st.next.g] + '</b> الساعة <b>' + clock(st.next.start) + '</b>';
      } else { lEl.textContent = ''; note.textContent = ''; }
    }
  }
  fg.style.strokeDasharray = C;
  paint();
  setInterval(paint, 1000);
})();

/* ─── جدول المواعيد ─── */
(function schedule() {
  var grid = $('#schGrid'), tabs = $('#schTabs');
  if (!grid) return;
  var g = 'men';
  var order = [6, 0, 1, 2, 3, 4, 5];   /* السبت الأول زي ما الجيم بيعد */

  function paint() {
    var now = new Date(), st = status(now), today = now.getDay();
    grid.innerHTML = order.map(function (dow) {
      var segs = (D.schedule.segments[String(dow)] || []).filter(function (s) { return s.g === g; });
      var slots = segs.length ? segs.map(function (s) {
        var live = st.open && st.seg.g === g && st.seg.dow === dow && st.seg.from === s.from;
        var from = H.clockFromMins(s.from), to = H.clockFromMins(s.to);
        return '<span class="slot' + (live ? ' live' : '') + '">' + from + ' — ' + to +
               (s.to > 1440 ? ' <em style="font-style:normal;opacity:.7">(الصبح)</em>' : '') + '</span>';
      }).join('') : '<span class="slot none">مفيش فترة</span>';
      return '<div class="sch-row' + (dow === today ? ' today' : '') + '">' +
             '<div class="d"><s></s>' + D.schedule.days[dow] + '</div>' +
             '<div class="slots">' + slots + '</div></div>';
    }).join('');
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-g]'); if (!b) return;
    $$('button', tabs).forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on'); g = b.dataset.g; paint();
  });
  paint(); setInterval(paint, 30000);
})();

/* ============================================================
   العروض
   ============================================================ */
function liveOffers() {
  if (!D.offers.enabled) return [];
  return D.offers.items.filter(function (o) { return o.active; });
}
function offerFor(scope) {           /* أحسن عرض تلقائي (غير عرض الصحاب) */
  var now = Date.now();
  var list = liveOffers().filter(function (o) {
    return o.appliesTo === scope && !o.minPeople && (!o.until || new Date(o.until).getTime() > now);
  });
  list.sort(function (a, b) { return b.percent - a.percent; });
  return list[0] || null;
}
function friendsOffer() {
  var now = Date.now();
  return liveOffers().filter(function (o) {
    return o.minPeople && (!o.until || new Date(o.until).getTime() > now);
  })[0] || null;
}

(function offers() {
  var bar = $('#obar'); if (!bar) return;
  var items = liveOffers().filter(function (o) {
    return !o.until || new Date(o.until).getTime() > Date.now();
  });
  if (!items.length) { bar.remove(); return; }
  bar.innerHTML = items.map(function (o) {
    return '<div class="o" data-until="' + esc(o.until || '') + '">' +
      '<span class="o-pct"><b>' + o.percent + '</b><i>%</i></span>' +
      '<span class="o-t"><b>' + esc(o.title.replace(/^خصم\s*\d+%\s*/, '')) + '</b>' +
      '<span class="o-cd">—</span></span></div>';
  }).join('');

  function tick() {
    $$('.o', bar).forEach(function (card) {
      var u = card.dataset.until, v = $('.o-cd', card);
      if (!u) { v.textContent = 'عرض مفتوح'; return; }
      var lft = new Date(u).getTime() - Date.now();
      if (lft <= 0) { card.classList.add('dead'); v.textContent = 'خلص'; return; }
      var d = Math.floor(lft / 86400000);
      v.textContent = d > 0 ? 'فاضل ' + (d === 1 ? 'يوم' : d === 2 ? 'يومين' : d + (d <= 10 ? ' أيام' : ' يوم'))
                            : 'فاضل ' + hhmm(lft);
    });
  }
  tick(); setInterval(tick, 1000);
})();

/* ─── حاسبة عرض الصحاب ─── */
(function fcalc() {
  var box = $('#fcalc'), fo = friendsOffer();
  if (!box || !fo) return;
  box.hidden = false;
  var people = 3, planId = 'gold';
  var seg = $('#fPeople'), sel = $('#fPlan');
  $('#fPct').textContent = fo.percent;

  seg.innerHTML = [3, 4, 5, 6].map(function (v) {
    return '<button data-v="' + v + '"' + (v === 3 ? ' class="on"' : '') + '>' + v + ' أفراد</button>';
  }).join('');
  sel.innerHTML = D.plans.monthly.map(function (p) {
    return '<option value="' + p.id + '"' + (p.id === planId ? ' selected' : '') + '>' +
           esc(p.name) + ' — ' + sess(p.sessions) + ' (' + n(p.price) + ' ج)</option>';
  }).join('');

  function paint() {
    var p = D.plans.monthly.filter(function (x) { return x.id === planId; })[0];
    var one = p.price, after = disc(one, fo.percent);
    var save = (one - after) * people;
    $('#fOne').textContent = n(one) + ' ج';
    $('#fOneNew').textContent = n(after) + ' ج';
    $('#fCntLab').textContent = 'الإجمالي لـ ' + people + ' أفراد';
    $('#fTot').textContent = n(after * people) + ' ج';
    countTo($('#fSave'), save);
  }
  seg.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]'); if (!b) return;
    $$('button', seg).forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on'); people = +b.dataset.v; paint();
  });
  sel.addEventListener('change', function () { planId = sel.value; paint(); });
  $('#fShare').addEventListener('click', function () {
    var p = D.plans.monthly.filter(function (x) { return x.id === planId; })[0];
    var after = disc(p.price, fo.percent);
    var txt = 'يا جماعة، في سيزر جيم عرض للصحاب: لو اشتركنا ' + people +
      ' مع بعض كل واحد ياخد خصم ' + fo.percent + '%.\n' +
      'باقة ' + p.name + ' (' + p.sessions + ' جلسة) بـ ' + n(after) + ' ج بدل ' + n(p.price) + ' ج.\n' +
      'الموقع: ' + location.href.split('#')[0];
    if (navigator.share) {
      navigator.share({ text: txt }).catch(function () {});
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
    }
  });
  paint();
})();

/* ============================================================
   الأنشطة
   ============================================================ */
/* ─── الهيرو: تبديل بين 3 لقطات ─── */
(function heroSlides() {
  var bg = $('#heroBg'); if (!bg) return;
  var slides = $$('.hero-slide', bg);
  if (slides.length < 2 || reduce) return;
  var i = 0;
  setInterval(function () {
    slides[i].classList.remove('on');
    i = (i + 1) % slides.length;
    slides[i].classList.add('on');
  }, 5200);
})();

/* ─── الجولة: كل ركن بشاشة ─── */
(function tour() {
  var box = $('#stops'); if (!box || !D.tour) return;
  box.innerHTML = D.tour.map(function (t, i) {
    return '<article class="stop" data-reveal>' +
      '<div class="stop-img"><div class="ph" data-img="' + t.img + '"' +
        ' data-alt="' + esc(t.name) + ' في سيزر جيم" data-sizes="(max-width:900px) 100vw, 60vw"></div></div>' +
      '<div class="stop-txt">' +
        '<span class="stop-n lat">' + esc(t.kick) + '</span>' +
        '<h3>' + esc(t.name) + '</h3>' +
        '<p>' + esc(t.line) + '</p>' +
        (i === D.tour.length - 1
          ? '<a href="#join" class="btn btn-lime btn-sm">اشترك وانت في البيت</a>' : '') +
      '</div></article>';
  }).join('');
  mountImages(box);
  if (window.__watchReveal) window.__watchReveal(box);
})();

/* ─── ليه سيزر ─── */
(function why() {
  var g = $('#whyGrid'); if (!g || !D.why) return;
  g.innerHTML = D.why.map(function (w, i) {
    return '<article class="why-c" data-reveal style="--d:' + i * 70 + 'ms">' +
      '<span class="why-n lat">' + esc(w.n) + '</span>' +
      '<h3>' + esc(w.t) + '</h3><p>' + esc(w.line) + '</p></article>';
  }).join('');
  if (window.__watchReveal) window.__watchReveal(g);
})();

/* ─── يومك في سيزر ─── */
(function day() {
  var g = $('#dayList'); if (!g || !D.day) return;
  g.innerHTML = D.day.map(function (s, i) {
    return '<li data-reveal style="--d:' + i * 70 + 'ms">' +
      '<b class="lat">' + (i + 1) + '</b>' +
      '<div><h3>' + esc(s.t) + '</h3><p>' + esc(s.line) + '</p></div></li>';
  }).join('');
  if (window.__watchReveal) window.__watchReveal(g);
})();

/* ─── قسم السيدات: نفس الحلقة بس بتقول امتى الفترة الجاية ─── */
(function ladies() {
  var g = $('#ladiesList');
  if (g && D.ladies) g.innerHTML = D.ladies.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');

  var fg = $('#ringLadiesFg'); if (!fg) return;
  var C = 2 * Math.PI * 116;
  var gEl = $('#ringLadiesGroup'), lEl = $('#ringLadiesLeft'), note = $('#ringLadiesNote');
  var sec = $('#ladies');
  fg.style.strokeDasharray = C;

  function paint() {
    var now = new Date(), t = now.getTime();
    var st = status(now);
    /* الفترة النسائية الحالية، أو أقرب فترة نسائية جاية */
    if (st.open && st.seg.g === 'women') {
      var s = st.seg, rest = s.end - t;
      sec.classList.add('live-now');
      fg.style.strokeDashoffset = C * (1 - rest / (s.end - s.start));
      gEl.textContent = 'دلوقتي';
      lEl.innerHTML = '<i>باقي</i> ' + leftText(rest);
      note.innerHTML = 'فترة السيدات شغّالة لحد <b>' + clock(s.end) + '</b>';
      return;
    }
    sec.classList.remove('live-now');
    var iv = H.intervals(D.schedule.segments, now).filter(function (x) {
      return x.g === 'women' && x.start > t;
    })[0];
    fg.style.strokeDashoffset = C;
    if (!iv) { gEl.textContent = '—'; lEl.textContent = ''; note.textContent = ''; return; }
    gEl.textContent = 'الجاية';
    lEl.innerHTML = '<i>بعد</i> ' + leftText(iv.start - t);
    note.innerHTML = D.schedule.days[iv.dow] + ' من <b>' + clock(iv.start) + '</b> لـ <b>' + clock(iv.end) + '</b>';
  }
  paint(); setInterval(paint, 1000);
})();

/* ============================================================
   الأسعار
   ============================================================ */
function priceBlock(price, pct) {
  if (!pct) return '<div class="price"><span class="now">' + n(price) + '</span><span class="cur">ج.م</span></div>';
  var after = disc(price, pct);
  return '<div class="price"><span class="now">' + n(after) + '</span><span class="cur">ج.م</span>' +
         '<s class="was">' + n(price) + '</s><span class="off">-' + pct + '%</span></div>';
}

(function pricing() {
  var mo = offerFor('monthly'), yr = offerFor('yearly');

  /* شهري */
  var g = $('#monthlyGrid');
  if (g) {
    g.innerHTML = D.plans.monthly.map(function (p, i) {
      var pct = mo ? mo.percent : 0, after = pct ? disc(p.price, pct) : p.price;
      return '<article class="plan' + (p.popular ? ' hot' : '') + '" data-reveal style="--d:' + i * 60 + 'ms">' +
        '<div class="plan-top"><div><h3>' + esc(p.name) + '</h3>' +
        '<div class="sess num">' + sess(p.sessions) + ' / شهر</div></div>' +
        (p.popular ? '<span class="hot-tag">الأكثر طلبًا</span>' : '') + '</div>' +
        priceBlock(p.price, pct) +
        '<div class="per">الجلسة بـ <b>' + Math.round(after / p.sessions) + '</b> ج — والمنفصلة بـ <b>150</b> ج</div>' +
        '<p class="note">' + esc(p.note) + '</p>' +
        '<button class="btn btn-ink btn-sm" data-pick="monthly:' + p.id + '">اشترك بالباقة دي</button>' +
      '</article>';
    }).join('') +
    D.plans.singles.map(function (p) {
      return '<article class="plan" data-reveal>' +
        '<div class="plan-top"><div><h3>' + esc(p.name) + '</h3>' +
        '<div class="sess">بدون اشتراك</div></div></div>' +
        priceBlock(p.price, 0) +
        '<p class="note">' + esc(p.note) + '</p>' +
        '<button class="btn btn-ghost btn-sm" data-pick="single:' + p.id + '">اطلبها</button>' +
      '</article>';
    }).join('');
  }

  /* سنوي */
  var y = $('#yearlyGrid');
  if (y) {
    y.innerHTML = D.plans.yearly.map(function (c) {
      return '<div class="ycard' + (c.popular ? ' hot' : '') + '" data-reveal>' +
        '<div class="ycard-h"><h3>' + esc(c.name) + '</h3>' +
        (c.popular ? '<span class="hot-tag">الأكثر طلبًا</span>' : '') + '</div>' +
        c.tiers.map(function (t) {
          var pct = yr ? yr.percent : 0, after = pct ? disc(t.price, pct) : t.price;
          return '<div class="yrow"><span class="lab">' + esc(t.label) + '</span>' +
            '<span class="perks">' + esc(t.perks) + '</span>' +
            '<span class="yp"><span class="now">' + n(after) + ' ج</span>' +
            (pct ? '<span class="was">' + n(t.price) + ' ج</span>' : '') + '</span>' +
            '<button class="btn btn-ink btn-sm" data-pick="yearly:' + c.id + '|' + t.months + '">اشترك</button>' +
          '</div>';
        }).join('') + '</div>';
    }).join('');
  }

  /* أنشطة وبرايفيت */
  var a = $('#actsGrid');
  if (a) {
    a.innerHTML = D.plans.activities.map(function (p, i) {
      return '<article class="plan" data-reveal style="--d:' + i * 55 + 'ms">' +
        '<div class="plan-top"><div><h3>' + esc(p.name) + '</h3></div></div>' +
        priceBlock(p.price, 0) +
        '<p class="note">' + esc(p.note) + '</p>' +
        '<button class="btn btn-ink btn-sm" data-pick="acts:' + p.id + '">اشترك</button>' +
      '</article>';
    }).join('');
  }

  /* التابات */
  var tabs = $('#priceTabs');
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-pane]'); if (!b) return;
    $$('button', tabs).forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    $$('.panes>div').forEach(function (p) { p.classList.toggle('on', p.id === 'pane-' + b.dataset.pane); });
  });

  if (window.__watchReveal) window.__watchReveal(document);
})();

/* ─── حاسبة السعر الحقيقي ─── */
(function realCalc() {
  var r = $('#rRange'); if (!r) return;
  var mo = offerFor('monthly');
  /* أيام في الأسبوع -> أقرب باقة بعدد الجلسات */
  function pick(days) {
    var want = days * 4;
    return D.plans.monthly.reduce(function (best, p) {
      return Math.abs(p.sessions - want) < Math.abs(best.sessions - want) ? p : best;
    });
  }
  function paint() {
    var days = +r.value, p = pick(days);
    var pct = mo ? mo.percent : 0, after = pct ? disc(p.price, pct) : p.price;
    var per = Math.round(after / p.sessions);
    r.style.setProperty('--fill', ((days - 2) / 4 * 100) + '%');
    $('#rDays').textContent = days;
    $('#rPlan').textContent = p.name + ' — ' + sess(p.sessions);
    $('#rPer').textContent = per;
    var saved = 150 - per;
    $('#rCmp').innerHTML = 'التمرين المنفصل بـ <b>150</b> ج — يعني بتوفّر <b>' + n(saved) +
      '</b> ج في كل جلسة، و<b>' + n(saved * p.sessions) + '</b> ج في الشهر.';
    $('#rGo').dataset.pick = 'monthly:' + p.id;
  }
  r.addEventListener('input', paint);
  paint();
})();

/* ============================================================
   رحلة الاشتراك
   ============================================================ */
(function join() {
  var box = $('.jbox'); if (!box) return;
  var pick = { kind: '', id: '', months: 0 };
  var KINDS = [
    { k: 'monthly', t: 'اشتراك شهري', s: 'من 8 لـ 24 جلسة في الشهر' },
    { k: 'yearly',  t: 'اشتراك سنوي', s: 'ربع / نص / سنة كاملة — أوفر' },
    { k: 'acts',    t: 'أنشطة وبرايفيت', s: 'فنون قتالية، تأهيل، برايفيت' },
    { k: 'single',  t: 'تمرين منفصل أو ساونا', s: 'بدون اشتراك' }
  ];

  /* خطوة 1 */
  var kindBox = $('#jKind'), planWrap = $('#jPlanWrap'), planBox = $('#jPlans');
  kindBox.innerHTML = KINDS.map(function (k) {
    return '<button class="opt" data-kind="' + k.k + '"><b>' + esc(k.t) + '</b><span>' + esc(k.s) + '</span></button>';
  }).join('');

  function optionsFor(kind) {
    var mo = offerFor('monthly'), yr = offerFor('yearly');
    if (kind === 'monthly') return D.plans.monthly.map(function (p) {
      var pct = mo ? mo.percent : 0;
      return { id: p.id, t: p.name, s: sess(p.sessions) + ' / شهر', price: pct ? disc(p.price, pct) : p.price };
    });
    if (kind === 'single') return D.plans.singles.map(function (p) {
      return { id: p.id, t: p.name, s: p.note, price: p.price };
    });
    if (kind === 'acts') return D.plans.activities.map(function (p) {
      return { id: p.id, t: p.name, s: p.note, price: p.price };
    });
    var out = [];
    D.plans.yearly.forEach(function (c) {
      c.tiers.forEach(function (t) {
        var pct = yr ? yr.percent : 0;
        out.push({ id: c.id + '|' + t.months, t: c.name + ' — ' + t.label,
                   s: t.perks, price: pct ? disc(t.price, pct) : t.price });
      });
    });
    return out;
  }
  function paintPlans() {
    var list = optionsFor(pick.kind);
    planBox.innerHTML = list.map(function (o) {
      return '<button class="opt' + (o.id === pick.id ? ' on' : '') + '" data-plan="' + esc(o.id) + '">' +
        '<b>' + esc(o.t) + '</b><span>' + esc(o.s) + '</span>' +
        '<span class="op num">' + n(o.price) + ' ج</span></button>';
    }).join('');
    planWrap.hidden = false;
  }
  kindBox.addEventListener('click', function (e) {
    var b = e.target.closest('[data-kind]'); if (!b) return;
    $$('[data-kind]', kindBox).forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    pick.kind = b.dataset.kind; pick.id = ''; paintPlans();
    $('#j1next').disabled = true;
  });
  planBox.addEventListener('click', function (e) {
    var b = e.target.closest('[data-plan]'); if (!b) return;
    $$('[data-plan]', planBox).forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on'); pick.id = b.dataset.plan;
    $('#j1next').disabled = false;
  });

  /* التنقّل بين الخطوات */
  function go(s) {
    $$('.jstep', box).forEach(function (x) { x.classList.toggle('on', +x.dataset.step === s); });
    $$('.step-p').forEach(function (x) {
      var v = +x.dataset.s;
      x.classList.toggle('on', v === s);
      x.classList.toggle('ok', v < s);
    });
    var y = $('#join').getBoundingClientRect().top + window.pageYOffset - 80;
    if (Math.abs(window.pageYOffset - y) > 40) window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-back]'); if (b) go(+b.dataset.back);
  });
  $('#j1next').addEventListener('click', function () { go(2); });

  /* طرق الدفع */
  var paySel = $('#jPay');
  var methods = (D.payment.methods || []).slice();
  paySel.innerHTML = (D.payment.cashEnabled ? '<option value="cash">كاش في الجيم</option>' : '') +
    methods.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.label) + '</option>'; }).join('');

  /* التحقّق */
  function bad(el, on) {
    el.classList.toggle('bad', on);
    var e = el.parentNode.querySelector('.err');
    if (e) e.classList.toggle('show', on);
    return !on;
  }
  function validPhone(v) { return /^01[0125][0-9]{8}$/.test(v.replace(/[\s-]/g, '')); }

  function chosen() {
    var list = optionsFor(pick.kind);
    return list.filter(function (o) { return o.id === pick.id; })[0] || null;
  }
  var LABEL = { monthly: 'اشتراك شهري', yearly: 'اشتراك سنوي', acts: 'نشاط / برايفيت', single: 'تمرين منفصل' };

  $('#j2next').addEventListener('click', function () {
    var nm = $('#jName'), ph = $('#jPhone');
    /* لازم الاتنين يتفحصوا — مش && عشان ميقفش عند أول غلط */
    var okName = bad(nm, nm.value.trim().split(/\s+/).length < 2);
    var okPhone = bad(ph, !validPhone(ph.value));
    if (!okName || !okPhone) { toast('راجع البيانات المعلّمة بالأحمر'); return; }

    var o = chosen(), pm = paySel.value;
    $('#jRev').innerHTML =
      '<div><span>النوع</span><b>' + esc(LABEL[pick.kind]) + '</b></div>' +
      '<div><span>الباقة</span><b>' + esc(o.t) + '</b></div>' +
      '<div><span>الاسم</span><b>' + esc(nm.value.trim()) + '</b></div>' +
      '<div><span>الموبايل</span><b class="lat">' + esc(ph.value.replace(/[\s-]/g, '')) + '</b></div>' +
      '<div><span>الفترة</span><b>' + GNAME[$('#jGender').value] + '</b></div>' +
      '<div><span>الدفع</span><b>' + esc(paySel.options[paySel.selectedIndex].text) + '</b></div>' +
      '<div class="big"><span>المطلوب</span><b>' + n(o.price) + ' ج.م</b></div>';

    var m = methods.filter(function (x) { return x.id === pm; })[0];
    $('#jPayBox').innerHTML = m
      ? '<div class="pay"><div class="pay-top"><b>' + esc(m.label) + '</b>' +
        '<span style="color:#8C8D83;font-size:14px;font-weight:700">حوّل ' + n(o.price) + ' ج</span></div>' +
        '<div class="pay-num"><span class="lat">' + esc(m.number) + '</span>' +
        '<button class="copy" data-copy="' + esc(m.number) + '">كوبي</button></div>' +
        '<div class="hint">' + esc(m.hint) + '</div></div>'
      : '<div class="pay"><div class="pay-top"><b>كاش في الجيم</b></div>' +
        '<div class="hint">تعالى في أي فترة من فتراتك واستلم اشتراكك — الطلب هيوصلنا وبنجهّزه.</div></div>';
    go(3);
  });

  $('#jPayBox').addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var v = b.dataset.copy;
    var done = function () { b.textContent = 'اتنسخ ✓'; b.classList.add('done');
      setTimeout(function () { b.textContent = 'كوبي'; b.classList.remove('done'); }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(done, function () { toast(v); });
    else { toast(v); }
  });

  /* الإرسال */
  $('#jSend').addEventListener('click', function () {
    var o = chosen(), pm = paySel.value;
    var m = methods.filter(function (x) { return x.id === pm; })[0];
    var name = $('#jName').value.trim(), phone = $('#jPhone').value.replace(/[\s-]/g, '');
    var note = $('#jNote').value.trim();
    var lines = [
      'طلب اشتراك جديد — سيزر جيم',
      '',
      'الاسم: ' + name,
      'الموبايل: ' + phone,
      'الفترة: ' + GNAME[$('#jGender').value],
      'النوع: ' + LABEL[pick.kind],
      'الباقة: ' + o.t,
      'المطلوب: ' + n(o.price) + ' ج.م',
      'الدفع: ' + (m ? m.label + ' (' + m.number + ')' : 'كاش في الجيم')
    ];
    if (note) lines.push('ملاحظة: ' + note);
    lines.push('', 'اتبعت من الموقع');
    var txt = lines.join('\n');

    /* لو فيه نقطة استقبال متظبّطة، نبعت الطلب لها كمان — عشان يبان في اللوحة */
    if (D.payment.webhook) {
      try {
        fetch(D.payment.webhook, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ name: name, phone: phone, gender: $('#jGender').value,
            kind: pick.kind, plan: o.t, amount: o.price,
            pay: m ? m.label : 'cash', note: note, at: new Date().toISOString() })
        });
      } catch (err) {}
    }
    /* سجل محلي — بيبان في اللوحة على نفس الجهاز */
    try {
      var log = JSON.parse(localStorage.getItem('cezarReq') || '[]');
      log.unshift({ name: name, phone: phone, plan: o.t, amount: o.price,
        pay: m ? m.label : 'كاش', gender: $('#jGender').value, note: note,
        at: Date.now(), status: 'new' });
      localStorage.setItem('cezarReq', JSON.stringify(log.slice(0, 200)));
    } catch (err) {}

    window.open('https://wa.me/' + D.contact.whatsapp + '?text=' + encodeURIComponent(txt), '_blank');

    $('#mcName').textContent = name;
    $('#mcPlan').textContent = o.t;
    $('#mcDate').textContent = new Date().toLocaleDateString('en-GB');
    $('#mcAmt').textContent = n(o.price) + ' EGP';
    go(4);
  });

  $('#jRestart').addEventListener('click', function () {
    pick = { kind: '', id: '', months: 0 };
    $$('.opt', box).forEach(function (x) { x.classList.remove('on'); });
    planWrap.hidden = true; $('#j1next').disabled = true;
    ['#jName', '#jPhone', '#jNote'].forEach(function (s) { $(s).value = ''; });
    go(1);
  });

  /* زراير «اشترك بالباقة دي» في قسم الأسعار */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]'); if (!b) return;
    var parts = b.dataset.pick.split(':');
    pick.kind = parts[0]; pick.id = parts[1];
    $$('[data-kind]', kindBox).forEach(function (x) {
      x.classList.toggle('on', x.dataset.kind === pick.kind);
    });
    paintPlans();
    $('#j1next').disabled = !pick.id;
    go(2);
  });
})();

/* ============================================================
   بيانات التواصل
   ============================================================ */
(function contact() {
  var c = D.contact;
  var wa = 'https://wa.me/' + c.whatsapp;
  var tel = 'tel:' + c.landline.replace(/[^0-9+]/g, '');
  var mob = c.mobile.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');

  var set = function (sel, fn) { var el = $(sel); if (el) fn(el); };
  set('#locCall', function (e) { e.href = tel; });
  set('#locWaBtn', function (e) { e.href = wa; e.target = '_blank'; e.rel = 'noopener'; });
  set('#fWa', function (e) { e.href = wa; e.textContent = mob; e.target = '_blank'; });
  set('#fTel', function (e) { e.href = tel; e.textContent = c.landline; });
  set('#fMap', function (e) { e.href = c.maps; e.target = '_blank'; e.rel = 'noopener'; });
  set('#sFb', function (e) { e.href = c.facebook; e.target = '_blank'; e.rel = 'noopener'; });
  set('#sIg', function (e) { e.href = c.instagram; e.target = '_blank'; e.rel = 'noopener'; });
  set('#sWa', function (e) { e.href = wa; e.target = '_blank'; e.rel = 'noopener'; });
  set('#fab', function (e) { e.href = wa; e.target = '_blank'; e.rel = 'noopener'; });
  set('#dockWa', function (e) { e.href = wa; e.target = '_blank'; e.rel = 'noopener'; });
})();

/* الصور الثابتة في الصفحة */
mountImages(document);

})();
