const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateText = value => new Intl.DateTimeFormat('ar-EG', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(`${String(value).slice(0,10)}T12:00:00Z`));
const visitText = value => new Intl.DateTimeFormat('ar-EG', {weekday:'long', day:'numeric', month:'long', hour:'numeric', minute:'2-digit', timeZone:'Africa/Cairo'}).format(new Date(value));
const sessionsWord = number => number === 1 ? 'حصة' : number === 2 ? 'حصتين' : number >= 3 && number <= 10 ? 'حصص' : 'حصة';
const statusLabels = {active:'اشتراك نشط', upcoming:'لسه ما بدأش', expired:'انتهى الاشتراك', finished:'اكتملت الحصص'};
const staticPreviewHost = /(^|\.)(raw(?:cdn)?\.githack\.com|htmlpreview\.github\.io)$/.test(location.hostname);
const demoData = {
  name:'أحمد', source:'demo', last_synced_at:null, memberships:[{
    id:'preview-one', plan_name:'باقة جولد', total_sessions:24, used_sessions:16, remaining_sessions:8,
    starts_at:'2026-09-01T00:00:00+02:00', ends_at:'2026-10-01T23:59:59+02:00', status:'active',
    attendance:[
      {id:'v1',checked_in_at:'2026-09-27T18:14:00+02:00'},
      {id:'v2',checked_in_at:'2026-09-25T17:42:00+02:00'},
      {id:'v3',checked_in_at:'2026-09-23T18:08:00+02:00'},
      {id:'v4',checked_in_at:'2026-09-21T17:57:00+02:00'},
    ],
  }],
};
// Remove credentials left by the previous portal implementation during upgrade.
try { sessionStorage.removeItem('cezar_member_auth'); } catch (_) {}
let currentData = null;
let activeIndex = 0;
let showAllVisits = false;

function setStatus(data) {
  const state = $('#dataStatus');
  const labels = {
    gym:['متصل بسيستم الجيم', 'البيانات اتحدّثت من سيستم الجيم دلوقتي.'],
    cached:['آخر نسخة محفوظة', 'سيستم الجيم مش متاح مؤقتًا؛ البيانات الظاهرة من آخر تحديث.'],
    unavailable:['الاتصال متوقف', 'مش قادرين نعرض بيانات سيستم الجيم دلوقتي. جرّب تحديث الصفحة أو تواصل مع الفريق.'],
    local:['بيانات سيزر الداخلية', 'بيانات العضوية المسجلة على الموقع. ربط سيستم الجيم لسه غير مفعّل.'],
    demo:['تجربة توضيحية', 'الأرقام دي افتراضية لعرض شكل الحساب فقط.'],
  };
  const [title, detail] = labels[data.source] || labels.local;
  state.className = `connection-line connection-${data.source || 'local'}`;
  state.innerHTML = `<span class="connection-icon" aria-hidden="true"></span><strong>${title}</strong><span>${detail}</span>${data.last_synced_at ? `<time>آخر تحديث: ${esc(visitText(data.last_synced_at))}</time>` : ''}`;
}

function renderMembership(item) {
  const total = Math.max(0, Number(item.total_sessions) || 0);
  const used = Math.min(total, Math.max(0, Number(item.used_sessions) || 0));
  const left = Math.max(0, total - used);
  const pct = total ? Math.round(used / total * 100) : 0;
  const visits = Array.isArray(item.attendance) ? [...item.attendance].sort((a,b) => new Date(b.checked_in_at) - new Date(a.checked_in_at)) : [];
  const shown = showAllVisits ? visits : visits.slice(0, 5);
  const history = shown.length ? shown.map((visit, index) => `<li class="visit-row"><span class="visit-marker" aria-hidden="true">✓</span><div><strong>زيارة رقم ${Math.max(1, used - index)}</strong><time datetime="${esc(visit.checked_in_at)}">${esc(visitText(visit.checked_in_at))}</time></div><span class="visit-tag">تم الحضور</span></li>`).join('') : '<li class="history-empty">أول حصة ليك هتظهر هنا بعد ما تتسجل في الجيم.</li>';
  const state = statusLabels[item.status] || 'حالة الاشتراك';
  $('#membershipContent').innerHTML = `
    <div class="summary-grid">
      <article class="balance-card" aria-labelledby="planTitle">
        <div class="balance-top"><span>YOUR MEMBERSHIP / اشتراكك</span><span class="membership-state ${esc(item.status)}"><i></i>${state}</span></div>
        <h2 id="planTitle">${esc(item.plan_name)}</h2>
        <div class="balance-center"><div><span class="balance-label">الحصص المتبقية</span><strong class="balance-number">${left}</strong><span class="balance-unit">${sessionsWord(left)} قدامك</span></div><span class="balance-watermark" aria-hidden="true">${String(left).padStart(2,'0')}</span></div>
        <div class="balance-progress"><div><span>تقدم الاشتراك</span><span dir="ltr">${used} / ${total}</span></div><progress value="${used}" max="${total || 1}" aria-label="الحصص المستخدمة"></progress><p>حضرت ${used} من ${total} حصة · ${pct}% من رحلتك</p></div>
      </article>
      <div class="detail-stack">
        <article class="date-card"><span class="card-index">01 / المدة</span><h3>اشتراكك<br>من إمتى لإمتى؟</h3><dl><div><dt>بداية الاشتراك</dt><dd>${esc(dateText(item.starts_at))}</dd></div><div><dt>تاريخ الانتهاء</dt><dd>${esc(dateText(item.ends_at))}</dd></div></dl></article>
        <article class="rhythm-card"><span class="card-index">02 / الثبات</span><div class="rhythm-number">${used}<span>${sessionsWord(used)}</span></div><p>كل مرة حضرت فيها اتحسبت. الاستمرارية بتبان في الأرقام.</p></article>
      </div>
    </div>
    <section class="history-section" aria-labelledby="historyTitle"><div class="history-heading"><div><span class="section-index">03 / سجل التمرين</span><h2 id="historyTitle">كل زيارة، <em>خطوة لقدّام.</em></h2></div><span>عدد الزيارات: ${visits.length}</span></div><ol class="visit-list">${history}</ol>${visits.length > 5 ? `<button class="more-visits" id="moreVisits" type="button">${showAllVisits ? 'إظهار أقل' : `عرض كل الزيارات (${visits.length})`} <span aria-hidden="true">↓</span></button>` : ''}</section>`;
  $('#moreVisits')?.addEventListener('click', () => {showAllVisits = !showAllVisits; renderMembership(item);});
}

function render(data) {
  currentData = data;
  $('#loginView').hidden = true;
  $('#dashboard').hidden = false;
  $('#memberName').textContent = String(data.name || 'بطل').trim().split(/\s+/)[0];
  $('#demoBanner').hidden = data.source !== 'demo';
  setStatus(data);
  const tabs = $('#membershipTabs');
  const items = Array.isArray(data.memberships) ? data.memberships : [];
  activeIndex = Math.min(activeIndex, Math.max(0, items.length - 1));
  tabs.hidden = items.length <= 1;
  tabs.innerHTML = items.map((item, index) => `<button type="button" role="tab" aria-selected="${index === activeIndex}" data-index="${index}">${esc(item.plan_name)} <span>0${index+1}</span></button>`).join('');
  if (items.length) renderMembership(items[activeIndex]);
  else $('#membershipContent').innerHTML = `<div class="no-membership"><span>00 / لا توجد باقة</span><h2>${data.source === 'unavailable' ? 'البيانات مش متاحة دلوقتي.' : 'حسابك جاهز.<br>اشتراكك لسه مش ظاهر.'}</h2><p>${data.source === 'unavailable' ? 'جرّب التحديث لاحقًا. لو المشكلة مستمرة، الفريق يقدر يساعدك.' : 'لو اشتركت بالفعل، اطلب من إدارة الجيم مراجعة تفعيل الباقة أو الربط.'}</p><a href="https://wa.me/201097419761" target="_blank" rel="noopener noreferrer">تواصل مع الفريق ↗</a></div>`;
  window.scrollTo({top:0,behavior:'instant'});
}

async function loadSession() {
  if (staticPreviewHost || new URLSearchParams(location.search).get('preview') === '1') {render(demoData); return;}
  try {
    const response = await fetch('/api/member/me', {credentials:'same-origin', cache:'no-store'});
    if (response.status === 401) return;
    if (!response.ok) throw new Error('تعذر تحميل الحساب');
    render(await response.json());
  } catch (_) { $('#loginMessage').textContent = 'تعذر الاتصال بالموقع. جرّب تحديث الصفحة.'; }
}

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const phone = $('#phone').value.trim();
  const code = $('#code').value.trim();
  const message = $('#loginMessage');
  if (!/^01[0125]\d{8}$/.test(phone)) {message.textContent = 'اكتب رقم موبايل مصري صحيح.'; $('#phone').focus(); return;}
  if (code.length < 16) {message.textContent = 'رمز العضوية غير مكتمل.'; $('#code').focus(); return;}
  const button = $('#loginForm button[type="submit"]');
  button.disabled = true; button.querySelector('span').textContent = 'جاري فتح حسابك…'; message.textContent = '';
  try {
    const response = await fetch('/api/member/login', {method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify({phone,code})});
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'تعذر تسجيل الدخول.');
    $('#code').value = '';
    render(data);
  } catch (error) {message.textContent = error.message;}
  finally {button.disabled = false; button.querySelector('span').textContent = 'افتح حسابي';}
});

$('#membershipTabs').addEventListener('click', event => {
  const button = event.target.closest('button[data-index]');
  if (!button || !currentData) return;
  activeIndex = Number(button.dataset.index); showAllVisits = false; render(currentData);
});
$('#logout').addEventListener('click', async () => {
  if (currentData?.source === 'demo') {location.href = staticPreviewHost ? 'https://cezar-gym-prod.onrender.com/member.html' : 'member.html'; return;}
  try {await fetch('/api/member/logout', {method:'POST', credentials:'same-origin', cache:'no-store'});} catch (_) {}
  currentData = null; $('#dashboard').hidden = true; $('#loginView').hidden = false;
  $('#phone').value = ''; $('#code').value = ''; $('#loginMessage').textContent = '';
});
if (staticPreviewHost) {
  document.querySelectorAll('a[href="index.html"]').forEach(a => {a.href = 'https://cezar-gym-prod.onrender.com/';});
  document.querySelectorAll('a[href="join.html"]').forEach(a => {a.href = 'https://cezar-gym-prod.onrender.com/join.html';});
  $('#demoBanner a').href = 'https://cezar-gym-prod.onrender.com/member.html';
}
loadSession();
