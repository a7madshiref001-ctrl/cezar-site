/* ============================================================
   سيزر جيم — صفحة الاشتراك

   الموقع استضافة ساكنة، فمش قادر يتأكد إن حد حوّل. عشان كده
   الرحلة مبنية على إن التسليم البشري يبقى واضح ومضمون:

   • كاش في الجيم → بنسجّل بياناته وميعاد جايّه، والرسالة بتوصل
     الجيم عشان يفكّره.
   • تحويل → بنوريه المبلغ والرقم وزرار يفتح إنستاباي على طول،
     وبنطلب منه يبعت صورة التحويل على واتساب.

   خطوة واحدة على الشاشة، وزرار واحد تحت. الخطوات بتتغيّر حسب
   طريقة الدفع — عشان محدش يشوف تعليمات مش تخصّه.
   ============================================================ */
(function () {
'use strict';

var D = window.CEZAR_DATA;
var H = window.CezarHours;
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

function n(v) { return Number(v).toLocaleString('en-US'); }
function disc(p, pct) { return Math.ceil(p * (1 - pct / 100) / 5) * 5; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
  return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function sess(k) { return k + ' ' + (k >= 3 && k <= 10 ? 'جلسات' : 'جلسة'); }

var toastEl = $('#toast div'), toastT;
function toast(m) {
  toastEl.textContent = m; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
}

var S = {
  i: 0,
  kind: 'monthly', planId: '',
  friends: false, people: 3,
  name: '', phone: '', gender: 'men', note: '',
  pay: '',
  whenDay: null, whenSlot: null      /* لو كاش في الجيم */
};

/* ─── العروض ─── */
function alive(o) { return o.active && (!o.until || new Date(o.until).getTime() > Date.now()); }
function autoOffer(scope) {
  if (!D.offers.enabled) return null;
  return D.offers.items.filter(function (o) {
    return alive(o) && o.appliesTo === scope && !o.minPeople;
  }).sort(function (a, b) { return b.percent - a.percent; })[0] || null;
}
function friendsOffer() {
  if (!D.offers.enabled) return null;
  return D.offers.items.filter(function (o) { return alive(o) && o.minPeople; })[0] || null;
}

var KINDS = [
  { k: 'monthly', t: 'شهري' }, { k: 'yearly', t: 'سنوي' },
  { k: 'acts', t: 'أنشطة وبرايفيت' }, { k: 'single', t: 'تمرين منفصل' }
];

function options(kind) {
  var fo = friendsOffer();
  if (kind === 'monthly') {
    var mo = autoOffer('monthly');
    return D.plans.monthly.map(function (p) {
      var pct = (S.friends && fo) ? fo.percent : (mo ? mo.percent : 0);
      return { id: p.id, t: p.name, s: sess(p.sessions) + ' / شهر',
               was: p.price, price: pct ? disc(p.price, pct) : p.price, hot: p.popular };
    });
  }
  if (kind === 'yearly') {
    var yr = autoOffer('yearly'), out = [];
    D.plans.yearly.forEach(function (c) {
      c.tiers.forEach(function (t) {
        var pct = yr ? yr.percent : 0;
        out.push({ id: c.id + '|' + t.months, t: c.name + ' — ' + t.label, s: t.perks,
                   was: t.price, price: pct ? disc(t.price, pct) : t.price,
                   hot: c.popular && t.months === 12 });
      });
    });
    return out;
  }
  var src = kind === 'acts' ? D.plans.activities : D.plans.singles;
  return src.map(function (p) { return { id: p.id, t: p.name, s: p.note, was: p.price, price: p.price }; });
}
function chosen() { return options(S.kind).filter(function (o) { return o.id === S.planId; })[0] || null; }
function total() { var o = chosen(); return o ? (S.friends ? o.price * S.people : o.price) : 0; }

function ways() {
  var out = [];
  (D.payment.methods || []).forEach(function (m) {
    out.push({ id: m.id, label: m.label, hint: m.hint || 'تحويل من موبايلك دلوقتي', m: m });
  });
  if (D.payment.cashEnabled) out.push({ id: 'cash', label: 'كاش في الجيم', hint: 'سجّل بياناتك وتعالى ادفع' });
  return out;
}
function way() { return ways().filter(function (w) { return w.id === S.pay; })[0] || null; }

/* ============================================================
   الباقة
   ============================================================ */
function renderOffer() {
  var box = $('#jOffer'), scope = S.kind === 'yearly' ? 'yearly' : 'monthly';
  var o = (S.kind === 'monthly' || S.kind === 'yearly') ? autoOffer(scope) : null;
  if (!o) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<b class="p">' + o.percent + '%</b><span>' + esc(o.line) + '</span>';
}
function renderPlans() {
  $('#planList').innerHTML = options(S.kind).map(function (o) {
    return '<button class="j-plan' + (o.id === S.planId ? ' on' : '') + '" data-plan="' + esc(o.id) + '">' +
      (o.hot ? '<span class="hot">الأكثر طلبًا</span>' : '') +
      '<span class="j-radio"></span>' +
      '<span class="j-plan-t"><b>' + esc(o.t) + '</b><span>' + esc(o.s) + '</span></span>' +
      '<span class="j-plan-p"><b>' + n(o.price) + ' ج</b>' +
        (o.was > o.price ? '<s>' + n(o.was) + '</s>' : '') + '</span></button>';
  }).join('');
}
function renderFriends() {
  var fo = friendsOffer(), box = $('#friendsBox');
  if (!fo || S.kind !== 'monthly') { box.hidden = true; $('#friendsN').hidden = true; S.friends = false; return; }
  box.hidden = false;
  $('#friendsTitle').textContent = 'إحنا ' + fo.minPeople + ' أو أكتر';
  $('#friendsHint').textContent = 'كل واحد ياخد خصم ' + fo.percent + '% بدل الخصم العادي';
  $('#friendsN').hidden = !S.friends;
  if (!$('#friendsSeg').children.length) {
    $('#friendsSeg').innerHTML = [3, 4, 5, 6].map(function (v) {
      return '<button data-p="' + v + '"' + (v === S.people ? ' class="on"' : '') + '>' + v + '</button>';
    }).join('');
  }
}
$('#kindTabs').innerHTML = KINDS.map(function (k) {
  return '<button data-kind="' + k.k + '"' + (k.k === S.kind ? ' class="on"' : '') + '>' + k.t + '</button>';
}).join('');
$('#kindTabs').addEventListener('click', function (e) {
  var b = e.target.closest('[data-kind]'); if (!b) return;
  $$('#kindTabs button').forEach(function (x) { x.classList.remove('on'); });
  b.classList.add('on');
  S.kind = b.dataset.kind; S.planId = ''; S.friends = false; $('#friendsOn').checked = false;
  renderOffer(); renderPlans(); renderFriends(); gate();
});
$('#planList').addEventListener('click', function (e) {
  var b = e.target.closest('[data-plan]'); if (!b) return;
  S.planId = b.dataset.plan; renderPlans(); gate();
});
$('#friendsOn').addEventListener('change', function () {
  S.friends = this.checked; $('#friendsN').hidden = !S.friends; renderPlans(); gate();
});
$('#friendsSeg').addEventListener('click', function (e) {
  var b = e.target.closest('[data-p]'); if (!b) return;
  $$('#friendsSeg button').forEach(function (x) { x.classList.remove('on'); });
  b.classList.add('on'); S.people = +b.dataset.p;
});

/* ============================================================
   البيانات
   ============================================================ */
function validPhone(v) { return /^01[0125][0-9]{8}$/.test(v.replace(/[\s-]/g, '')); }
function mark(el, bad) {
  el.classList.toggle('bad', bad);
  var e = el.parentNode.querySelector('.err');
  if (e) e.classList.toggle('show', bad);
  return !bad;
}
$('#jGender').addEventListener('click', function (e) {
  var b = e.target.closest('[data-g]'); if (!b) return;
  $$('#jGender button').forEach(function (x) { x.classList.remove('on'); });
  b.classList.add('on'); S.gender = b.dataset.g;
  S.whenDay = null; S.whenSlot = null;    /* المواعيد بتختلف حسب الفترة */
});
['#jName', '#jPhone'].forEach(function (sel) {
  $(sel).addEventListener('input', function () {
    this.classList.remove('bad');
    var e = this.parentNode.querySelector('.err'); if (e) e.classList.remove('show');
    S.name = $('#jName').value; S.phone = $('#jPhone').value.replace(/[\s-]/g, '');
  });
});

/* ============================================================
   طريقة الدفع
   ============================================================ */
function renderPay() {
  $('#payList').innerHTML = ways().map(function (w) {
    return '<button class="j-way' + (w.id === S.pay ? ' on' : '') + '" data-way="' + esc(w.id) + '">' +
      '<span class="j-radio"></span>' +
      '<span class="j-way-t"><b>' + esc(w.label) + '</b><span>' + esc(w.hint) + '</span></span></button>';
  }).join('');
}
$('#payList').addEventListener('click', function (e) {
  var b = e.target.closest('[data-way]'); if (!b) return;
  S.pay = b.dataset.way; renderPay(); gate();
});

/* ============================================================
   هتيجي امتى — كاش في الجيم
   بنعرض بس الأيام والفترات اللي فعلًا مفتوحة لفترته.
   ============================================================ */
function myDays() {
  var now = new Date(), out = [], seen = {};
  H.intervals(D.schedule.segments, now, 0, 7).forEach(function (iv) {
    if (iv.g !== S.gender || iv.end <= now.getTime()) return;
    var d = new Date(iv.start);
    var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    if (!seen[key]) { seen[key] = { key: key, date: d, dow: iv.dow, slots: [] }; out.push(seen[key]); }
    seen[key].slots.push(iv);
  });
  return out.slice(0, 6);
}
function dayLabel(d) {
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 86400000);
  if (diff === 0) return 'النهاردة';
  if (diff === 1) return 'بكرة';
  return D.schedule.days[d.getDay()];
}
function renderWhen() {
  var days = myDays();
  if (!days.length) {
    $('#whenDays').innerHTML = '';
    $('#whenSlots').innerHTML = '';
    $('#whenHint').textContent = 'مفيش فترات متاحة قريب — كلّمنا على واتساب ونظبّطلك.';
    return;
  }
  if (!S.whenDay || !days.filter(function (d) { return d.key === S.whenDay; }).length) {
    S.whenDay = days[0].key; S.whenSlot = null;
  }
  $('#whenDays').innerHTML = days.map(function (d) {
    return '<button class="j-day' + (d.key === S.whenDay ? ' on' : '') + '" data-day="' + d.key + '">' +
      '<b>' + esc(dayLabel(d.date)) + '</b>' +
      '<span class="lat">' + d.date.getDate() + '/' + (d.date.getMonth() + 1) + '</span></button>';
  }).join('');

  var day = days.filter(function (d) { return d.key === S.whenDay; })[0];
  if (!S.whenSlot) S.whenSlot = String(day.slots[0].start);
  $('#whenSlots').innerHTML = day.slots.map(function (sl) {
    return '<button class="j-slot' + (String(sl.start) === S.whenSlot ? ' on' : '') +
      '" data-slot="' + sl.start + '">' +
      H.clock(sl.start) + ' — ' + H.clock(sl.end) + '</button>';
  }).join('');
  $('#whenHint').textContent = 'دي فترات ' + (S.gender === 'women' ? 'السيدات' : 'الرجال') + ' المتاحة.';
}
$('#whenDays').addEventListener('click', function (e) {
  var b = e.target.closest('[data-day]'); if (!b) return;
  S.whenDay = b.dataset.day; S.whenSlot = null; renderWhen(); gate();
});
$('#whenSlots').addEventListener('click', function (e) {
  var b = e.target.closest('[data-slot]'); if (!b) return;
  S.whenSlot = b.dataset.slot; renderWhen(); gate();
});
function whenText() {
  var days = myDays(), day = days.filter(function (d) { return d.key === S.whenDay; })[0];
  if (!day) return '';
  var sl = day.slots.filter(function (x) { return String(x.start) === S.whenSlot; })[0] || day.slots[0];
  return dayLabel(day.date) + ' ' + day.date.getDate() + '/' + (day.date.getMonth() + 1) +
         ' — من ' + H.clock(sl.start) + ' لـ ' + H.clock(sl.end);
}

/* ============================================================
   التحويل
   ============================================================ */
function renderTransfer() {
  var w = way(); if (!w || !w.m) return;
  $('#trTitle').textContent = 'حوّل ' + n(total()) + ' ج';
  $('#trSub').textContent = w.m.hint || '';

  var link = w.m.link
    ? '<a class="j-open" href="' + esc(w.m.link) + '" target="_blank" rel="noopener">' +
        '<span>افتح ' + esc(w.m.label) + '</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg></a>'
    : '';

  $('#trBox').innerHTML = '<div class="j-how">' +
    row('المبلغ', n(total()) + ' ج', String(total()), true) +
    row(w.m.id === 'instapay' ? 'الحساب' : 'الرقم', w.m.number, w.m.number, false) +
    link +
  '</div>' +
  '<div class="j-order">' +
    '<b>بعد ما تحوّل</b>' +
    '<p>صوّر شاشة التأكيد، وابعتها لنا على واتساب مع الطلب.<br>' +
      'الرسالة هتتفتح جاهزة في الخطوة الجاية — ارفق الصورة معاها وابعت.</p>' +
  '</div>';
}
function row(label, shown, copy, big) {
  return '<div class="j-copy"><div class="j-copy-t"><span>' + esc(label) + '</span>' +
    '<b class="' + (big ? 'big' : '') + '">' + esc(shown) + '</b></div>' +
    '<button data-copy="' + esc(copy) + '">كوبي</button></div>';
}
$('#trBox').addEventListener('click', function (e) {
  var b = e.target.closest('[data-copy]'); if (!b) return;
  var v = b.dataset.copy;
  var ok = function () {
    b.textContent = 'اتنسخ ✓'; b.classList.add('done');
    setTimeout(function () { b.textContent = 'كوبي'; b.classList.remove('done'); }, 1700);
  };
  if (navigator.clipboard) navigator.clipboard.writeText(v).then(ok, function () { toast(v); });
  else toast(v);
});

/* ============================================================
   المراجعة والإرسال
   ============================================================ */
var LABEL = { monthly: 'اشتراك شهري', yearly: 'اشتراك سنوي', acts: 'نشاط / برايفيت', single: 'تمرين منفصل' };

function renderRev() {
  var o = chosen(), w = way(), cash = S.pay === 'cash';
  $('#jRev').innerHTML =
    '<div><span>الباقة</span><b>' + esc(o.t) + '</b></div>' +
    (S.friends ? '<div><span>عدد الأفراد</span><b>' + S.people + '</b></div>' : '') +
    '<div><span>الاسم</span><b>' + esc(S.name) + '</b></div>' +
    '<div><span>الموبايل</span><b class="lat">' + esc(S.phone) + '</b></div>' +
    '<div><span>الفترة</span><b>' + (S.gender === 'women' ? 'سيدات' : 'رجال') + '</b></div>' +
    '<div><span>الدفع</span><b>' + esc(w ? w.label : '—') + '</b></div>' +
    (cash ? '<div><span>هييجي</span><b>' + esc(whenText()) + '</b></div>' : '') +
    '<div class="tot"><span>الإجمالي</span><b>' + n(total()) + ' ج</b></div>';

  $('#jSendHint').innerHTML = cash
    ? '<b>مفيش دفع دلوقتي.</b> بنسجّل بياناتك وميعادك، وهنفكّرك قبلها.'
    : '<b>ارفق صورة التحويل مع الرسالة</b> قبل ما تبعت — دي اللي بتأكّد اشتراكك.';
}

function waText() {
  var o = chosen(), w = way(), cash = S.pay === 'cash';
  var L = ['طلب اشتراك — سيزر جيم', '',
    'الاسم: ' + S.name,
    'الموبايل: ' + S.phone,
    'الفترة: ' + (S.gender === 'women' ? 'سيدات' : 'رجال'),
    'النوع: ' + LABEL[S.kind],
    'الباقة: ' + o.t];
  if (S.friends) L.push('عدد الأفراد: ' + S.people);
  L.push('الإجمالي: ' + n(total()) + ' ج');
  L.push('الدفع: ' + (w ? w.label : '—') + (w && w.m ? ' (' + w.m.number + ')' : ''));
  if (cash) L.push('هييجي: ' + whenText(), 'برجاء تفكيري قبل الميعاد');
  else L.push('صورة التحويل مرفقة مع الرسالة دي');
  if (S.note) L.push('ملاحظة: ' + S.note);
  L.push('', 'اتبعت من الموقع');
  return L.join('\n');
}

/* ملف تقويم — العميل يفكّر نفسه كمان */
function icsUrl() {
  var days = myDays(), day = days.filter(function (d) { return d.key === S.whenDay; })[0];
  if (!day) return '';
  var sl = day.slots.filter(function (x) { return String(x.start) === S.whenSlot; })[0] || day.slots[0];
  var f = function (ms) { return new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, ''); };
  var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cezar Gym//AR', 'BEGIN:VEVENT',
    'UID:' + Date.now() + '@cezargym', 'DTSTAMP:' + f(Date.now()),
    'DTSTART:' + f(sl.start), 'DTEND:' + f(Math.min(sl.end, sl.start + 7200000)),
    'SUMMARY:اشتراك سيزر جيم', 'LOCATION:' + D.contact.address,
    'DESCRIPTION:' + chosen().t + ' — ' + n(total()) + ' ج', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
}

function send() {
  var o = chosen(), w = way(), cash = S.pay === 'cash';
  var url = 'https://wa.me/' + D.contact.whatsapp + '?text=' + encodeURIComponent(waText());

  try {
    var log = JSON.parse(localStorage.getItem('cezarReq') || '[]');
    log.unshift({ name: S.name, phone: S.phone, plan: o.t, amount: total(),
      people: S.friends ? S.people : 1, pay: w ? w.label : '—', gender: S.gender,
      when: cash ? whenText() : '', note: S.note, at: Date.now(), status: 'new' });
    localStorage.setItem('cezarReq', JSON.stringify(log.slice(0, 200)));
  } catch (e) {}

  if (D.payment.webhook) {
    try {
      fetch(D.payment.webhook, { method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ name: S.name, phone: S.phone, plan: o.t, amount: total(),
          pay: w ? w.label : '-', gender: S.gender, when: cash ? whenText() : '',
          note: S.note, at: new Date().toISOString() }) });
    } catch (e) {}
  }

  window.open(url, '_blank');

  $('#doneTitle').textContent = cash ? 'سجّلنا بياناتك' : 'الطلب اتبعت';
  $('#doneSub').textContent = cash
    ? 'هنفكّرك قبل ميعادك — وتعالى ادفع في الجيم.'
    : 'متنساش ترفق صورة التحويل مع الرسالة.';
  $('#doneRows').innerHTML =
    '<div><span>الباقة</span><b>' + esc(o.t) + '</b></div>' +
    '<div><span>الإجمالي</span><b>' + n(total()) + ' ج</b></div>' +
    (cash ? '<div><span>ميعادك</span><b>' + esc(whenText()) + '</b></div>'
          : '<div><span>الدفع</span><b>' + esc(w.label) + '</b></div>');
  $('#doneWa').href = url;
  var ics = $('#doneIcs');
  ics.hidden = !cash;
  if (cash) ics.onclick = function () {
    var a = document.createElement('a');
    a.href = icsUrl(); a.download = 'cezar-gym.ics';
    document.body.appendChild(a); a.click(); a.remove();
  };
  go(flow().length);
}

/* ============================================================
   الرحلة — الخطوات بتتغيّر حسب طريقة الدفع
   ============================================================ */
function flow() {
  var f = ['plan', 'info', 'pay'];
  if (S.pay === 'cash') f.push('when');
  else if (S.pay) f.push('transfer');
  f.push('review');
  return f;
}
function go(i) {
  var f = flow();
  S.i = Math.max(0, Math.min(i, f.length));
  var name = S.i < f.length ? f[S.i] : 'done';
  $$('.j-step').forEach(function (x) { x.classList.toggle('on', x.dataset.name === name); });

  var done = name === 'done';
  $('#jBar').style.width = (done ? 100 : ((S.i + 1) / f.length) * 100) + '%';
  $('#stepLab').textContent = done ? 'تم' : 'الخطوة ' + (S.i + 1) + ' من ' + f.length;
  $('#jPrev').hidden = S.i === 0 || done;
  $('#jDock').hidden = done;

  if (name === 'pay') renderPay();
  if (name === 'when') renderWhen();
  if (name === 'transfer') renderTransfer();
  if (name === 'review') renderRev();
  window.scrollTo({ top: 0, behavior: 'instant' });
  gate();
}

function gate() {
  var f = flow(), name = f[S.i], btn = $('#jNext'), ok = true, txt = 'كمّل';
  if (name === 'plan') ok = !!S.planId;
  else if (name === 'info') ok = true;      /* الضغط بيوضّح الغلط بدل زرار مقفول */
  else if (name === 'pay') ok = !!S.pay;
  else if (name === 'when') { ok = !!S.whenSlot; txt = 'كمّل'; }
  else if (name === 'transfer') txt = 'حوّلت — كمّل';
  else if (name === 'review') txt = 'ابعت الطلب على واتساب';
  btn.disabled = !ok;
  btn.textContent = txt;
}

$('#jNext').addEventListener('click', function () {
  var name = flow()[S.i];
  if (name === 'info') {
    S.name = $('#jName').value; S.phone = $('#jPhone').value.replace(/[\s-]/g, '');
    S.note = $('#jNote').value.trim();
    var okN = mark($('#jName'), S.name.trim().split(/\s+/).length < 2);
    var okP = mark($('#jPhone'), !validPhone(S.phone));
    if (!okN || !okP) { toast('راجع البيانات المعلّمة'); return; }
  }
  if (name === 'review') { send(); return; }
  go(S.i + 1);
});
$('#jPrev').addEventListener('click', function () { go(S.i - 1); });

/* لينك جاي من صفحة الأسعار: join.html?plan=monthly:gold */
(function preset() {
  var q = new URLSearchParams(location.search).get('plan');
  if (!q) return;
  var parts = q.split(':');
  if (KINDS.filter(function (k) { return k.k === parts[0]; }).length) {
    S.kind = parts[0];
    $$('#kindTabs button').forEach(function (x) { x.classList.toggle('on', x.dataset.kind === S.kind); });
  }
  if (parts[1] && options(S.kind).filter(function (o) { return o.id === parts[1]; }).length) S.planId = parts[1];
})();

renderOffer(); renderPlans(); renderFriends(); go(0);

})();
