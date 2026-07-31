/* ============================================================
   سيزر جيم — لوحة صاحب الجيم

   بتعدّل نسخة من window.CEZAR_DATA في الذاكرة، بتحفظها مسوّدة في
   المتصفح، ولما تضغط «حفظ ونشر» بتكتب data/site.js في المستودع
   عن طريق GitHub API.

   الأمان: GitHub Pages استضافة ساكنة — أي حاجة في المستودع دي عامة.
   عشان كده مفيش أي توكن مدفون في الكود؛ صاحب الجيم بيدخّل التوكن
   وقت التشغيل وبيتخزّن في متصفحه هو بس، وبيتبعت لـ api.github.com
   على HTTPS وخلاص.
   ============================================================ */
(function () {
'use strict';

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

var PATH = 'data/site.js';
var K_DRAFT = 'cezarDraft', K_TOKEN = 'cezarToken', K_REPO = 'cezarRepo', K_REQ = 'cezarReq';
var DEF_REPO = 'cezar-gym/cezar-gym.github.io';

var published = JSON.parse(JSON.stringify(window.CEZAR_DATA));  /* آخر حاجة اتنشرت */
var S = JSON.parse(JSON.stringify(window.CEZAR_DATA));          /* اللي بنعدّل فيه */
var dirty = false;

function n(v) { return Number(v).toLocaleString('en-US'); }
function disc(price, pct) { return Math.ceil(price * (1 - pct / 100) / 5) * 5; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
  return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

var toastEl = $('#toast div'), toastT;
function toast(m) {
  toastEl.textContent = m; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
}

/* ─── الحالة والمسوّدة ─── */
function setState(txt, cls) {
  $('#stateTxt').textContent = txt;
  $('#state').className = 'o-state' + (cls ? ' ' + cls : '');
}
function touch() {
  dirty = true;
  try { localStorage.setItem(K_DRAFT, JSON.stringify(S)); } catch (e) {}
  setState('تعديلات لسه متنشرتش', 'dirty');
  $('#pubMsg').className = 'msg';
  $('#pubMsg').innerHTML = 'فيه تعديلات محفوظة في المتصفح — اضغط <b>حفظ ونشر</b> عشان تظهر للناس.';
  renderPreview();
}
function clean() {
  dirty = false;
  try { localStorage.removeItem(K_DRAFT); } catch (e) {}
  setState('منشور', 'ok');
}

/* ─── توليد الملف ─── */
var HEADER = [
'/* ============================================================',
'   سيزر جيم — كل بيانات الموقع في مكان واحد',
'   ============================================================',
'   الملف ده اتكتب من لوحة التحكّم (owner.html).',
'   متعدّلوش بإيدك وانت فاتح اللوحة في نفس الوقت.',
'',
'   ملاحظات:',
'   • schedule.segments بالدقايق من نص الليل. لو النهاية أكبر من',
'     1440 معناها إن الفترة بتكمّل لليوم اللي بعده.',
'     أرقام الأيام: 0 الأحد · 1 الإثنين · ... · 6 السبت.',
'   • plans فيها الأسعار الأصلية قبل أي خصم. الخصم بيتحسب في',
'     الموقع من offers وبيتقرّب لأعلى لأقرب 5 جنيه.',
'   • عرض عنده minPeople (عرض الصحاب) بيظهر في الحاسبة بس.',
'   ============================================================ */'
].join('\n') + '\n';

function serialize() {
  S.meta = S.meta || {};
  S.meta.updated = new Date().toISOString().slice(0, 10);
  S.meta.version = (published.meta && published.meta.version || 0) + (dirty ? 1 : 0);
  return HEADER + 'window.CEZAR_DATA = ' + JSON.stringify(S, null, 1) + ';\n';
}
function renderPreview() { $('#preview').value = serialize(); }

/* ============================================================
   الطلبات
   ============================================================ */
function reqs() { try { return JSON.parse(localStorage.getItem(K_REQ) || '[]'); } catch (e) { return []; } }
function saveReqs(v) { try { localStorage.setItem(K_REQ, JSON.stringify(v)); } catch (e) {} }

var ST = { 'new': 'جديد', done: 'تمّت المراجعة', rej: 'مرفوض' };

function renderReqs() {
  var list = reqs(), box = $('#reqList');
  var open = list.filter(function (r) { return r.status === 'new'; }).length;
  $('#reqCount').textContent = open;
  $('#reqHint').textContent = list.length
    ? 'الطلبات دي اتبعتت من الجهاز ده. الطلب الحقيقي بيوصلك على واتساب برضه.'
    : '';
  if (!list.length) {
    box.innerHTML = '<div class="empty"><b>لسه مفيش طلبات هنا</b>' +
      'الطلبات بتوصلك على واتساب. اللي يتبعت من الجهاز ده بيتسجّل هنا كمان،' +
      ' وتقدر تضيف أي طلب جالك على واتساب بإيدك عشان تتابعه.</div>';
    return;
  }
  box.innerHTML = list.map(function (r, i) {
    var cls = r.status === 'done' ? ' done' : r.status === 'rej' ? ' rej' : '';
    var d = new Date(r.at);
    return '<div class="req' + cls + '">' +
      '<div class="req-n">' + esc((r.name || '؟').trim().charAt(0)) + '</div>' +
      '<div class="req-b"><b>' + esc(r.name) + ' — ' + esc(r.plan) + '</b>' +
        '<span class="lat" dir="ltr">' + esc(r.phone) + '</span>' +
        '<span class="meta">' + n(r.amount) + ' ج · ' + esc(r.pay) + ' · ' +
        (r.gender === 'women' ? 'سيدات' : 'رجال') + ' · ' +
        d.toLocaleDateString('en-GB') + ' ' + d.toTimeString().slice(0, 5) +
        ' · ' + ST[r.status] + '</span>' +
        (r.note ? '<span class="meta">ملاحظة: ' + esc(r.note) + '</span>' : '') +
      '</div>' +
      '<div class="req-a">' +
        '<a class="btn btn-ghost btn-sm" href="https://wa.me/2' + esc(String(r.phone).replace(/\D/g, '')) +
          '" target="_blank" rel="noopener">واتساب</a>' +
        (r.status !== 'done' ? '<button class="btn btn-lime btn-sm" data-req="done" data-i="' + i + '">تمّت المراجعة</button>' : '') +
        (r.status !== 'rej' ? '<button class="btn btn-ghost btn-sm" data-req="rej" data-i="' + i + '">مرفوض</button>' : '') +
        '<button class="icon-btn" data-req="del" data-i="' + i + '" aria-label="حذف">✕</button>' +
      '</div></div>';
  }).join('');
}

$('#reqList').addEventListener('click', function (e) {
  var b = e.target.closest('[data-req]'); if (!b) return;
  var list = reqs(), i = +b.dataset.i;
  if (b.dataset.req === 'del') {
    if (!confirm('تحذف الطلب ده من القايمة؟')) return;
    list.splice(i, 1);
  } else list[i].status = b.dataset.req;
  saveReqs(list); renderReqs();
});

$('#reqAdd').addEventListener('click', function () {
  var name = prompt('اسم العميل؟'); if (!name) return;
  var phone = prompt('رقم الموبايل؟') || '';
  var plan = prompt('الباقة؟') || '';
  var amount = +(prompt('المبلغ بالجنيه؟') || 0);
  var list = reqs();
  list.unshift({ name: name, phone: phone, plan: plan, amount: amount, pay: 'يدوي',
    gender: 'men', note: 'اتسجّل يدوي من اللوحة', at: Date.now(), status: 'new' });
  saveReqs(list); renderReqs(); toast('اتسجّل');
});

$('#reqCsv').addEventListener('click', function () {
  var list = reqs();
  if (!list.length) { toast('مفيش طلبات'); return; }
  var head = ['التاريخ', 'الاسم', 'الموبايل', 'الباقة', 'المبلغ', 'الدفع', 'الفترة', 'الحالة', 'ملاحظة'];
  var rows = list.map(function (r) {
    return [new Date(r.at).toLocaleString('en-GB'), r.name, r.phone, r.plan, r.amount,
            r.pay, r.gender === 'women' ? 'سيدات' : 'رجال', ST[r.status], r.note || ''];
  });
  var csv = '﻿' + [head].concat(rows).map(function (row) {
    return row.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  dl(csv, 'cezar-requests.csv', 'text/csv;charset=utf-8');
});

function dl(text, name, type) {
  var b = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
}

/* ============================================================
   العروض
   ============================================================ */
var SCOPE = { monthly: 'الباقات الشهرية', yearly: 'الاشتراكات السنوية' };

function renderOffers() {
  $('#offersOn').checked = !!S.offers.enabled;
  $('#offerList').innerHTML = S.offers.items.map(function (o, i) {
    return '<div class="erow' + (o.active ? '' : ' off') + '" data-i="' + i + '">' +
      '<div class="fld wide"><label>عنوان العرض</label>' +
        '<input data-f="title" value="' + esc(o.title) + '"></div>' +
      '<div class="fld"><label>الخصم %</label>' +
        '<input data-f="percent" type="number" min="1" max="90" value="' + o.percent + '"></div>' +
      '<div class="fld"><label>على إيه</label><select data-f="appliesTo">' +
        Object.keys(SCOPE).map(function (k) {
          return '<option value="' + k + '"' + (o.appliesTo === k ? ' selected' : '') + '>' + SCOPE[k] + '</option>';
        }).join('') + '</select></div>' +
      '<div class="fld"><label>أقل عدد أفراد</label>' +
        '<input data-f="minPeople" type="number" min="0" value="' + (o.minPeople || 0) + '">' +
        '<span class="tip">0 = عادي</span></div>' +
      '<div class="fld wide"><label>الشرح</label>' +
        '<input data-f="line" value="' + esc(o.line) + '"></div>' +
      '<div class="fld"><label>البادچ</label>' +
        '<input data-f="badge" value="' + esc(o.badge || '') + '"></div>' +
      '<div class="fld"><label>ساري لحد</label>' +
        '<input data-f="until" type="datetime-local" value="' + esc((o.until || '').slice(0, 16)) + '"></div>' +
      '<div class="fld"><label>&nbsp;</label>' +
        '<label class="sw"><input type="checkbox" data-f="active"' + (o.active ? ' checked' : '') + '><i></i> شغّال</label></div>' +
      '<button class="icon-btn" data-del="offer" aria-label="حذف">✕</button>' +
    '</div>';
  }).join('') || '<div class="empty"><b>مفيش عروض</b>الموقع هيقول «مفيش عروض شغّالة دلوقتي».</div>';
}

$('#offersOn').addEventListener('change', function () { S.offers.enabled = this.checked; touch(); });
$('#offerAdd').addEventListener('click', function () {
  S.offers.items.push({ id: 'offer' + Date.now(), title: 'عرض جديد', percent: 10,
    appliesTo: 'monthly', line: 'اكتب شرح العرض هنا.', badge: '',
    until: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 16), active: false });
  renderOffers(); touch();
});
$('#offerList').addEventListener('input', function (e) {
  var f = e.target.dataset.f; if (!f) return;
  var o = S.offers.items[+e.target.closest('.erow').dataset.i];
  if (f === 'percent') o.percent = Math.max(1, Math.min(90, +e.target.value || 1));
  else if (f === 'minPeople') { var v = +e.target.value || 0; if (v >= 2) o.minPeople = v; else delete o.minPeople; }
  else if (f === 'until') o.until = e.target.value ? e.target.value + ':00' : '';
  else o[f] = e.target.value;
  touch(); renderPrices();
});
$('#offerList').addEventListener('change', function (e) {
  var f = e.target.dataset.f;
  if (f === 'active') {
    var row = e.target.closest('.erow');
    S.offers.items[+row.dataset.i].active = e.target.checked;
    row.classList.toggle('off', !e.target.checked);
    touch(); renderPrices();
  } else if (f === 'appliesTo') { renderPrices(); }
});
$('#offerList').addEventListener('click', function (e) {
  if (!e.target.closest('[data-del="offer"]')) return;
  var i = +e.target.closest('.erow').dataset.i;
  if (!confirm('تمسح «' + S.offers.items[i].title + '»؟')) return;
  S.offers.items.splice(i, 1); renderOffers(); renderPrices(); touch();
});

/* أحسن عرض تلقائي لنطاق معيّن (من غير عروض الصحاب) */
function autoPct(scope) {
  if (!S.offers.enabled) return 0;
  var now = Date.now(), best = 0;
  S.offers.items.forEach(function (o) {
    if (!o.active || o.appliesTo !== scope || o.minPeople) return;
    if (o.until && new Date(o.until).getTime() <= now) return;
    if (o.percent > best) best = o.percent;
  });
  return best;
}

/* ============================================================
   الأسعار
   ============================================================ */
function priceRow(item, kind, idx, sub) {
  var pct = autoPct(kind === 'monthly' ? 'monthly' : kind === 'yearly' ? 'yearly' : '');
  var after = pct ? disc(item.price, pct) : item.price;
  var per = item.sessions ? ' · الجلسة بـ ' + Math.round(after / item.sessions) + ' ج' : '';
  return '<div class="erow" data-kind="' + kind + '" data-i="' + idx + '"' +
      (sub != null ? ' data-sub="' + sub + '"' : '') + '>' +
    '<div class="fld"><label>' + (sub != null ? 'المدة' : 'الاسم') + '</label>' +
      '<input data-f="' + (sub != null ? 'label' : 'name') + '" value="' +
      esc(sub != null ? item.label : item.name) + '"></div>' +
    (item.sessions != null
      ? '<div class="fld"><label>عدد الجلسات</label><input data-f="sessions" type="number" min="1" value="' + item.sessions + '"></div>'
      : '<div class="fld"><label>&nbsp;</label><span class="tip">&nbsp;</span></div>') +
    '<div class="fld"><label>السعر الأصلي</label>' +
      '<input data-f="price" type="number" min="0" step="5" value="' + item.price + '"></div>' +
    '<div class="calc">' + (pct
      ? '<span>بعد خصم ' + pct + '%</span><b>' + n(after) + ' ج</b><s>' + n(item.price) + ' ج</s>'
      : '<span>السعر المعروض</span><b>' + n(item.price) + ' ج</b>') +
      (per ? '<span>' + per.replace(' · ', '') + '</span>' : '') + '</div>' +
    '<div class="fld wide"><label>سطر الشرح</label>' +
      '<input data-f="' + (sub != null ? 'perks' : 'note') + '" value="' +
      esc(sub != null ? item.perks : (item.note || '')) + '"></div>' +
  '</div>';
}

function renderPrices() {
  $('#pMonthly').innerHTML = S.plans.monthly.map(function (p, i) { return priceRow(p, 'monthly', i); }).join('');
  $('#pSingles').innerHTML = S.plans.singles.map(function (p, i) { return priceRow(p, 'singles', i); }).join('');
  $('#pActs').innerHTML = S.plans.activities.map(function (p, i) { return priceRow(p, 'activities', i); }).join('');
  $('#pYearly').innerHTML = S.plans.yearly.map(function (c, i) {
    return '<div style="padding:14px 20px 4px;font-weight:900;font-size:18px">' + esc(c.name) + '</div>' +
      c.tiers.map(function (t, j) { return priceRow(t, 'yearly', i, j); }).join('');
  }).join('');
}

['#pMonthly', '#pSingles', '#pActs', '#pYearly'].forEach(function (sel) {
  $(sel).addEventListener('input', function (e) {
    var f = e.target.dataset.f; if (!f) return;
    var row = e.target.closest('.erow'), kind = row.dataset.kind, i = +row.dataset.i;
    var obj = kind === 'yearly' ? S.plans.yearly[i].tiers[+row.dataset.sub] : S.plans[kind][i];
    obj[f] = (f === 'price' || f === 'sessions') ? Math.max(0, +e.target.value || 0) : e.target.value;
    /* نحدّث خانة الحساب في نفس الصف بس — عشان الكتابة متتقطعش */
    var pct = autoPct(kind === 'monthly' ? 'monthly' : kind === 'yearly' ? 'yearly' : '');
    var after = pct ? disc(obj.price, pct) : obj.price;
    var calc = row.querySelector('.calc');
    calc.innerHTML = (pct
      ? '<span>بعد خصم ' + pct + '%</span><b>' + n(after) + ' ج</b><s>' + n(obj.price) + ' ج</s>'
      : '<span>السعر المعروض</span><b>' + n(obj.price) + ' ج</b>') +
      (obj.sessions ? '<span>الجلسة بـ ' + Math.round(after / obj.sessions) + ' ج</span>' : '');
    touch();
  });
});

/* ============================================================
   الدفع والتواصل
   ============================================================ */
function renderPay() {
  $('#cashOn').checked = !!S.payment.cashEnabled;
  $('#hook').value = S.payment.webhook || '';
  $('#payList').innerHTML = S.payment.methods.map(function (m, i) {
    return '<div class="erow" data-i="' + i + '">' +
      '<div class="fld"><label>الاسم</label><input data-f="label" value="' + esc(m.label) + '"></div>' +
      '<div class="fld"><label>الرقم / الحساب</label><input data-f="number" dir="ltr" value="' + esc(m.number) + '"></div>' +
      '<div class="fld wide"><label>سطر التعليمات للعميل</label><input data-f="hint" value="' + esc(m.hint || '') + '"></div>' +
      '<button class="icon-btn" data-del="pay" aria-label="حذف">✕</button>' +
    '</div>';
  }).join('') || '<div class="empty"><b>مفيش طرق تحويل</b>العميل هيشوف «كاش في الجيم» بس.</div>';

  var c = S.contact;
  $('#cWa').value = c.whatsapp; $('#cMob').value = c.mobile; $('#cTel').value = c.landline;
  $('#cAddr').value = c.address; $('#cFb').value = c.facebook; $('#cIg').value = c.instagram;
}
$('#cashOn').addEventListener('change', function () { S.payment.cashEnabled = this.checked; touch(); });
$('#hook').addEventListener('input', function () { S.payment.webhook = this.value.trim(); touch(); });
$('#payAdd').addEventListener('click', function () {
  S.payment.methods.push({ id: 'm' + Date.now(), label: 'طريقة جديدة', number: '', hint: '' });
  renderPay(); touch();
});
$('#payList').addEventListener('input', function (e) {
  var f = e.target.dataset.f; if (!f) return;
  S.payment.methods[+e.target.closest('.erow').dataset.i][f] = e.target.value;
  touch();
});
$('#payList').addEventListener('click', function (e) {
  if (!e.target.closest('[data-del="pay"]')) return;
  var i = +e.target.closest('.erow').dataset.i;
  if (!confirm('تمسح الطريقة دي؟')) return;
  S.payment.methods.splice(i, 1); renderPay(); touch();
});
[['#cWa', 'whatsapp'], ['#cMob', 'mobile'], ['#cTel', 'landline'],
 ['#cAddr', 'address'], ['#cFb', 'facebook'], ['#cIg', 'instagram']].forEach(function (p) {
  $(p[0]).addEventListener('input', function () { S.contact[p[1]] = this.value.trim(); touch(); });
});

/* ============================================================
   النشر
   ============================================================ */
function getTok() {
  try { return localStorage.getItem(K_TOKEN) || sessionStorage.getItem(K_TOKEN) || ''; } catch (e) { return ''; }
}
function setTok(t, remember) {
  try {
    localStorage.removeItem(K_TOKEN); sessionStorage.removeItem(K_TOKEN);
    if (t) (remember ? localStorage : sessionStorage).setItem(K_TOKEN, t);
  } catch (e) {}
}
function b64(str) {
  var bytes = new TextEncoder().encode(str), bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function pubErr(msg) {
  var el = $('#pubErr');
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = ''; el.textContent = msg;
  $('#pubMsg').className = 'msg bad'; $('#pubMsg').textContent = msg;
  setState('النشر فشل', 'err');
}

$('#forget').addEventListener('click', function () {
  setTok(''); $('#token').value = ''; toast('التوكن اتمسح من المتصفح');
});
$('#download').addEventListener('click', function () {
  dl(serialize(), 'site.js', 'text/javascript;charset=utf-8');
  toast('نزّل الملف وحطه مكان data/site.js');
});
$('#revert').addEventListener('click', function () {
  if (!confirm('ترجّع كل التعديلات لآخر نسخة منشورة؟')) return;
  S = JSON.parse(JSON.stringify(published));
  renderAll(); clean();
  $('#pubMsg').className = 'msg'; $('#pubMsg').textContent = 'رجعنا لآخر نسخة منشورة.';
});

$('#publish').addEventListener('click', function () {
  var btn = this;
  var repo = ($('#repo').value || DEF_REPO).trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '');
  var tok = $('#token').value.trim() || getTok();
  pubErr('');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { pubErr('اسم المستودع لازم يكون بالشكل ده: owner/repo'); return; }
  if (!tok) { pubErr('محتاج توكن. روح لتاب «النشر» وحطّه.'); $$('#tabs button')[4].click(); return; }

  setTok(tok, $('#remember').checked);
  try { localStorage.setItem(K_REPO, repo); } catch (e) {}
  btn.disabled = true;
  setState('بننشر…', 'dirty');
  $('#pubMsg').className = 'msg'; $('#pubMsg').textContent = 'بنرفع الملف…';

  var api = 'https://api.github.com/repos/' + repo + '/contents/' + PATH;
  var head = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };

  fetch(api + '?ref=HEAD', { headers: head, cache: 'no-store' })
    .then(function (r) {
      if (r.status === 401) throw new Error('التوكن غلط أو منتهي. اعمل واحد جديد.');
      if (r.status === 403) throw new Error('التوكن مالوش صلاحية Contents: Read and write على المستودع ده.');
      if (r.status === 404) return null;                     /* الملف لسه مش موجود */
      if (!r.ok) throw new Error('GitHub رد بكود ' + r.status);
      return r.json();
    })
    .then(function (cur) {
      var body = {
        message: 'تحديث بيانات الموقع من اللوحة',
        content: b64(serialize()),
        branch: undefined
      };
      if (cur && cur.sha) body.sha = cur.sha;
      return fetch(api, { method: 'PUT', headers: head, body: JSON.stringify(body) });
    })
    .then(function (r) {
      if (r.status === 409) throw new Error('حصل تعديل تاني في نفس اللحظة. حدّث الصفحة وجرّب تاني.');
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.message || ('فشل الرفع — كود ' + r.status)); });
      return r.json();
    })
    .then(function () {
      published = JSON.parse(JSON.stringify(S));
      clean();
      $('#pubMsg').className = 'msg good';
      $('#pubMsg').innerHTML = 'اتنشر ✓ — الموقع هيتحدّث خلال دقيقة تقريبًا.';
      toast('اتنشر ✓');
    })
    .catch(function (e) {
      if (/401|التوكن غلط/.test(e.message)) setTok('');
      pubErr(e.message);
    })
    .finally(function () { btn.disabled = false; });
});

/* ============================================================
   التشغيل
   ============================================================ */
function renderAll() { renderOffers(); renderPrices(); renderPay(); renderReqs(); renderPreview(); }

(function boot() {
  /* التابات */
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-p]'); if (!b) return;
    $$('#tabs button').forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    $$('.o-pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + b.dataset.p); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  try {
    $('#repo').value = localStorage.getItem(K_REPO) || DEF_REPO;
    var t = getTok();
    if (t) { $('#token').value = t; $('#remember').checked = !!localStorage.getItem(K_TOKEN); }
  } catch (e) { $('#repo').value = DEF_REPO; }

  /* مسوّدة محفوظة؟ */
  var draft = null;
  try { draft = JSON.parse(localStorage.getItem(K_DRAFT)); } catch (e) {}
  if (draft) {
    S = draft;
    renderAll();
    dirty = true;
    setState('تعديلات لسه متنشرتش', 'dirty');
    $('#pubMsg').innerHTML = 'فيه مسوّدة محفوظة من قبل كده — راجعها واضغط <b>حفظ ونشر</b>.';
  } else {
    renderAll(); clean();
    $('#pubMsg').textContent = 'كل حاجة منشورة.';
  }

  addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault(); e.returnValue = '';
  });
})();

})();
