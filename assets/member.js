const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateText = (value) => new Intl.DateTimeFormat('ar-EG', {day:'numeric', month:'long', year:'numeric', timeZone:'Africa/Cairo'}).format(new Date(value));
const timeText = (value) => new Intl.DateTimeFormat('ar-EG', {day:'numeric', month:'short', hour:'numeric', minute:'2-digit', timeZone:'Africa/Cairo'}).format(new Date(value));
const statusText = {active:'ساري', upcoming:'يبدأ قريبًا', expired:'منتهي', finished:'اكتملت الحصص'};

function render(data) {
  $('#loginPanel').hidden = true;
  $('#portalIntro').hidden = true;
  $('#portalVisual').hidden = true;
  $('#dashboard').hidden = false;
  $('#memberName').textContent = data.name.split(' ')[0];
  $('#membershipList').innerHTML = data.memberships.length ? data.memberships.map((item, index) => {
    const pct = Math.max(0, Math.min(100, Math.round(item.used_sessions / item.total_sessions * 100)));
    const rows = item.attendance?.length ? item.attendance.map((visit, i) => `<div class="history-item"><span>الحصة ${item.used_sessions - i}</span><time>${escapeHTML(timeText(visit.checked_in_at))}</time></div>`).join('') : '<p class="empty-note">لسه مفيش حضور مسجّل. أول تمرينة هتظهر هنا.</p>';
    return `<article class="membership-card" style="animation:rise .55s ${index * .1}s both"><div class="membership-top"><div><small>YOUR MEMBERSHIP / اشتراكك</small><h3>${escapeHTML(item.plan_name)}</h3></div><span class="status-pill">${statusText[item.status] || item.status}</span></div><div class="membership-main"><div><div class="big-number">${item.remaining_sessions}<span> حصة متبقية</span></div><div class="progress-track" role="progressbar" aria-valuenow="${item.used_sessions}" aria-valuemin="0" aria-valuemax="${item.total_sessions}" aria-label="الحصص المستخدمة"><i style="--progress:${pct}%"></i></div><div class="progress-caption"><span>${item.used_sessions} حضرها</span><span>${item.total_sessions} حصة إجمالًا</span></div></div><div class="ring" style="--pct:${pct}%"><span>${pct}%<small>من الرحلة</small></span></div></div><div class="membership-foot"><div><small>بدأ الاشتراك</small><b>${escapeHTML(dateText(item.starts_at))}</b></div><div><small>ينتهي في</small><b>${escapeHTML(dateText(item.ends_at))}</b></div></div><div class="history"><h4>سجل التمرين</h4><div class="history-list">${rows}</div></div></article>`;
  }).join('') : '<div class="membership-card"><div class="membership-main"><p>حسابك جاهز، لكن لسه مفيش اشتراك مفعّل. تواصل مع الإدارة.</p></div></div>';
}

async function login(phone, code) {
  const button = $('#loginForm button');
  button.disabled = true;
  $('#loginMessage').textContent = '';
  try {
    const response = await fetch('/api/member/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({phone, code}), cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'تعذر الدخول، جرّب تاني.');
    sessionStorage.setItem('cezar_member_auth', JSON.stringify({phone, code}));
    render(data);
  } catch (error) {
    $('#loginMessage').textContent = error.message;
  } finally { button.disabled = false; }
}

$('#loginForm').addEventListener('submit', event => {event.preventDefault(); login($('#phone').value.trim(), $('#code').value.trim());});
$('#logout').addEventListener('click', () => {sessionStorage.removeItem('cezar_member_auth'); $('#dashboard').hidden = true; $('#loginPanel').hidden = false; $('#portalIntro').hidden = false; $('#portalVisual').hidden = false; $('#code').value = '';});
try {const saved = JSON.parse(sessionStorage.getItem('cezar_member_auth')); if (saved?.phone && saved?.code) {$('#phone').value = saved.phone; login(saved.phone, saved.code);}} catch (_) {}
