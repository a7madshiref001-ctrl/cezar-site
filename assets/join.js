/* ============================================================
   سيزر جيم — صفحة الاشتراك

   الموقع استضافة ساكنة، فمفيش طريقة يتأكد بيها إن حد حوّل فعلًا.
   عشان كده التصميم بيركّز على إن التسليم البشري يبقى مضمون:

   • كل طلب بياخد كود قصير (CZ-4821). العميل بيشوفه، والكود بيروح
     في رسالة الواتساب، وبنطلب منه يكتبه في ملاحظات التحويل.
     دي القطعة اللي بتحل أصعب مشكلة عمليًا: صاحب الجيم بيوصله
     «وصلك 640 ج من 010xxxx» ومش عارف دا طلب مين.
   • خطوة واحدة على الشاشة، وزرار واحد تحت. مفيش أي تشتيت.
   ============================================================ */
(function () {
'use strict';

var D = window.CEZAR_DATA;
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

/* ─── الحالة ─── */
var S = {
  step: 1,
  kind: 'monthly',
  planId: '',
  friends: false,
  people: 3,
  name: '', phone: '', gender: 'men', note: '',
  pay: '', paid: false,
  code: 'CZ-' + String(Math.floor(1000 + Math.random() * 9000))
};

/* ─── العروض ─── */
function live(o) { return o.active && (!o.until || new Date(o.until).getTime() > Date.now()); }
function autoOffer(scope) {
  if (!D.offers.enabled) return null;
  return D.offers.items.filter(function (o) {
    return live(o) && o.appliesTo === scope && !o.minPeople;
  }).sort(function (a, b) { return b.percent - a.percent; })[0] || null;
}
function friendsOffer() {
  if (!D.offers.enabled) return null;
  return D.offers.items.filter(function (o) { return live(o) && o.minPeople; })[0] || null;
}

var KINDS = [
  { k: 'monthly', t: 'شهري' },
  { k: 'yearly',  t: 'سنوي' },
  { k: 'acts',    t: 'أنشطة وبرايفيت' },
  { k: 'single',  t: 'تمرين منفصل' }
];

/* كل الاختيارات المتاحة في النوع ده، بالسعر بعد الخصم */
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
                   was: t.price, price: pct ? disc(t.price, pct) : t.price, hot: c.popular && t.months === 12 });
      });
    });
    return out;
  }
  if (kind === 'acts') return D.plans.activities.map(function (p) {
    return { id: p.id, t: p.name, s: p.note, was: p.price, price: p.price };
  });
  return D.plans.singles.map(function (p) {
    return { id: p.id, t: p.name, s: p.note, was: p.price, price: p.price };
  });
}
function chosen() {
  return options(S.kind).filter(function (o) { return o.id === S.planId; })[0] || null;
}
function total() {
  var o = chosen(); if (!o) return 0;
  return S.friends ? o.price * S.people : o.price;
}

/* ============================================================
   خطوة 1 — الباقة
   ============================================================ */
function renderOffer() {
  var box = $('#jOffer'), o = autoOffer(S.kind === 'yearly' ? 'yearly' : 'monthly');
  if (!o || (S.kind !== 'monthly' && S.kind !== 'yearly')) { box.hidden = true; return; }
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
        (o.was > o.price ? '<s>' + n(o.was) + '</s>' : '') + '</span>' +
    '</button>';
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
  S.kind = b.dataset.kind; S.planId = ''; S.friends = false;
  $('#friendsOn').checked = false;
  renderOffer(); renderPlans(); renderFriends(); gate();
});
$('#planList').addEventListener('click', function (e) {
  var b = e.target.closest('[data-plan]'); if (!b) return;
  S.planId = b.dataset.plan; renderPlans(); gate();
});
$('#friendsOn').addEventListener('change', function () {
  S.friends = this.checked; $('#friendsN').hidden = !S.friends;
  renderPlans(); gate();
});
$('#friendsSeg').addEventListener('click', function (e) {
  var b = e.target.closest('[data-p]'); if (!b) return;
  $$('#friendsSeg button').forEach(function (x) { x.classList.remove('on'); });
  b.classList.add('on'); S.people = +b.dataset.p; gate();
});

/* ============================================================
   خطوة 2 — البيانات
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
});
['#jName', '#jPhone'].forEach(function (sel) {
  $(sel).addEventListener('input', function () { this.classList.remove('bad');
    var e = this.parentNode.querySelector('.err'); if (e) e.classList.remove('show'); gate(); });
});

/* ============================================================
   خطوة 3 — الدفع
   ============================================================ */
function ways() {
  var out = [];
  if (D.payment.cashEnabled) out.push({ id: 'cash', label: 'كاش في الجيم', hint: 'تدفع وانت جاي' });
  (D.payment.methods || []).forEach(function (m) {
    out.push({ id: m.id, label: m.label, hint: 'تحويل من موبايلك دلوقتي', m: m });
  });
  return out;
}
function renderPay() {
  $('#payList').innerHTML = ways().map(function (w) {
    return '<button class="j-way' + (w.id === S.pay ? ' on' : '') + '" data-way="' + esc(w.id) + '">' +
      '<span class="j-radio"></span>' +
      '<span class="j-way-t"><b>' + esc(w.label) + '</b><span>' + esc(w.hint) + '</span></span>' +
    '</button>';
  }).join('');
  renderHow();
}
function renderHow() {
  var box = $('#payHow'), w = ways().filter(function (x) { return x.id === S.pay; })[0];
  if (!w) { box.innerHTML = ''; return; }
  if (!w.m) {
    box.innerHTML = '<div class="j-how"><div class="j-how-h"><b>كاش في الجيم</b>' +
      '<span>تعالى في أي فترة من فتراتك واستلم اشتراكك.</span></div>' +
      '<ol><li>ابعت الطلب من الخطوة الجاية.</li>' +
      '<li>تعالى الجيم وقول <b>كود طلبك</b>.</li>' +
      '<li>تدفع وتبدأ في نفس اليوم.</li></ol></div>';
    S.paid = true; gate(); return;
  }
  S.paid = false;
  box.innerHTML = '<div class="j-how">' +
    '<div class="j-how-h"><b>' + esc(w.m.label) + '</b><span>' + esc(w.m.hint || '') + '</span></div>' +
    row('المبلغ', n(total()) + ' ج', String(total()), true) +
    row(w.m.label === 'إنستاباي' ? 'الحساب' : 'الرقم', w.m.number, w.m.number, false) +
    row('كود طلبك', S.code, S.code, false) +
    '<ol>' +
      '<li>حوّل <b>' + n(total()) + ' ج</b> على الرقم اللي فوق.</li>' +
      '<li>اكتب <b>' + S.code + '</b> في خانة الملاحظات وانت بتحوّل — دي اللي بتخلينا نعرف التحويل بتاعك.</li>' +
      '<li>صوّر شاشة التأكيد.</li>' +
      '<li>ارجع هنا وابعت الطلب — وابعت الصورة مع الرسالة.</li>' +
    '</ol>' +
    '<label class="j-confirm"><input type="checkbox" id="paidOn"><i></i>' +
      '<span>حوّلت وصوّرت التأكيد</span></label>' +
  '</div>';
  $('#paidOn').addEventListener('change', function () { S.paid = this.checked; gate(); });
}
function row(label, shown, copy, big) {
  return '<div class="j-copy"><div class="j-copy-t"><span>' + esc(label) + '</span>' +
    '<b class="' + (big ? 'big' : '') + '">' + esc(shown) + '</b></div>' +
    '<button data-copy="' + esc(copy) + '">كوبي</button></div>';
}
$('#payList').addEventListener('click', function (e) {
  var b = e.target.closest('[data-way]'); if (!b) return;
  S.pay = b.dataset.way; renderPay(); gate();
});
$('#payHow').addEventListener('click', function (e) {
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
   خطوة 4 — المراجعة والإرسال
   ============================================================ */
var LABEL = { monthly: 'اشتراك شهري', yearly: 'اشتراك سنوي', acts: 'نشاط / برايفيت', single: 'تمرين منفصل' };

function renderRev() {
  var o = chosen(), w = ways().filter(function (x) { return x.id === S.pay; })[0];
  $('#jRev').innerHTML =
    '<div><span>الباقة</span><b>' + esc(o.t) + '</b></div>' +
    (S.friends ? '<div><span>عدد الأفراد</span><b>' + S.people + '</b></div>' : '') +
    '<div><span>الاسم</span><b>' + esc(S.name) + '</b></div>' +
    '<div><span>الموبايل</span><b class="lat">' + esc(S.phone) + '</b></div>' +
    '<div><span>الفترة</span><b>' + (S.gender === 'women' ? 'سيدات' : 'رجال') + '</b></div>' +
    '<div><span>الدفع</span><b>' + esc(w ? w.label : '—') + '</b></div>' +
    '<div class="code"><span>كود الطلب</span><b>' + S.code + '</b></div>' +
    '<div class="tot"><span>الإجمالي</span><b>' + n(total()) + ' ج</b></div>';
  $('#jSendHint').textContent = (w && w.m)
    ? 'لما واتساب يفتح، ارفق صورة التحويل مع الرسالة قبل ما تبعت.'
    : 'الرسالة هتتفتح مكتوبة — اضغط إرسال وبس.';
}

function waText() {
  var o = chosen(), w = ways().filter(function (x) { return x.id === S.pay; })[0];
  var L = [
    'طلب اشتراك — سيزر جيم',
    'كود الطلب: ' + S.code,
    '',
    'الاسم: ' + S.name,
    'الموبايل: ' + S.phone,
    'الفترة: ' + (S.gender === 'women' ? 'سيدات' : 'رجال'),
    'النوع: ' + LABEL[S.kind],
    'الباقة: ' + o.t
  ];
  if (S.friends) L.push('عدد الأفراد: ' + S.people);
  L.push('الإجمالي: ' + n(total()) + ' ج');
  L.push('الدفع: ' + (w ? w.label : '—') + (w && w.m ? ' (' + w.m.number + ')' : ''));
  if (w && w.m) L.push('حوّلت بالفعل ✓ — صورة التحويل مرفقة');
  if (S.note) L.push('ملاحظة: ' + S.note);
  L.push('', 'اتبعت من الموقع');
  return L.join('\n');
}

function send() {
  var o = chosen(), w = ways().filter(function (x) { return x.id === S.pay; })[0];
  var url = 'https://wa.me/' + D.contact.whatsapp + '?text=' + encodeURIComponent(waText());

  /* السجل المحلي — بيبان في لوحة صاحب الجيم على نفس الجهاز */
  try {
    var log = JSON.parse(localStorage.getItem('cezarReq') || '[]');
    log.unshift({ code: S.code, name: S.name, phone: S.phone, plan: o.t,
      amount: total(), people: S.friends ? S.people : 1,
      pay: w ? w.label : '—', gender: S.gender, note: S.note,
      at: Date.now(), status: 'new' });
    localStorage.setItem('cezarReq', JSON.stringify(log.slice(0, 200)));
  } catch (e) {}

  /* لو فيه نقطة استقبال متظبّطة، الطلب بيروح لها كمان */
  if (D.payment.webhook) {
    try {
      fetch(D.payment.webhook, { method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ code: S.code, name: S.name, phone: S.phone,
          plan: o.t, amount: total(), pay: w ? w.label : '-', gender: S.gender,
          note: S.note, at: new Date().toISOString() }) });
    } catch (e) {}
  }

  window.open(url, '_blank');

  $('#doneCode').textContent = S.code;
  $('#doneRows').innerHTML =
    '<div><span>الباقة</span><b>' + esc(o.t) + '</b></div>' +
    '<div><span>الإجمالي</span><b>' + n(total()) + ' ج</b></div>' +
    '<div><span>الدفع</span><b>' + esc(w ? w.label : '—') + '</b></div>';
  $('#doneWa').href = url;
  go(5);
}

/* ============================================================
   التنقّل
   ============================================================ */
var STEPS = 4;
function go(s) {
  S.step = s;
  $$('.j-step').forEach(function (x) { x.classList.toggle('on', +x.dataset.step === s); });
  $('#jBar').style.width = Math.min(100, (s / STEPS) * 100) + '%';
  $('#stepLab').textContent = s > STEPS ? 'تم' : 'الخطوة ' + s + ' من ' + STEPS;
  $('#jPrev').hidden = s === 1 || s > STEPS;
  $('.j-dock').hidden = s > STEPS;
  if (s === 3) renderPay();
  if (s === 4) renderRev();
  window.scrollTo({ top: 0, behavior: 'instant' });
  gate();
}

/* الزرار تحت بيتقفل لحد ما الخطوة تكتمل */
function gate() {
  var btn = $('#jNext'), ok = false, txt = 'كمّل';
  if (S.step === 1) ok = !!S.planId;
  /* خطوة البيانات: الزرار بيفضل مفتوح عن قصد — الضغط بيوضّح الغلط
     بدل ما يفضل مقفول والمستخدم مش عارف ليه. */
  else if (S.step === 2) ok = true;
  else if (S.step === 3) { ok = !!S.pay && S.paid; txt = 'كمّل'; }
  else if (S.step === 4) { ok = true; txt = 'ابعت الطلب على واتساب'; }
  btn.disabled = !ok;
  btn.textContent = txt;
}

$('#jNext').addEventListener('click', function () {
  if (S.step === 2) {
    S.name = $('#jName').value; S.phone = $('#jPhone').value.replace(/[\s-]/g, '');
    S.note = $('#jNote').value.trim();
    var okN = mark($('#jName'), S.name.trim().split(/\s+/).length < 2);
    var okP = mark($('#jPhone'), !validPhone(S.phone));
    if (!okN || !okP) { toast('راجع البيانات المعلّمة'); return; }
  }
  if (S.step === 4) { send(); return; }
  go(S.step + 1);
});
$('#jPrev').addEventListener('click', function () { go(S.step - 1); });

/* بنقرا الاسم والتليفون وقت الكتابة عشان الزرار يفتح لوحده */
['#jName', '#jPhone'].forEach(function (sel) {
  $(sel).addEventListener('input', function () {
    S.name = $('#jName').value; S.phone = $('#jPhone').value.replace(/[\s-]/g, '');
    gate();
  });
});

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

renderOffer(); renderPlans(); renderFriends(); go(1);

})();
