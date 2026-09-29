const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const isoDate = date => date.toISOString().slice(0,10);
const addMonths = (date, months) => {const next = new Date(date); next.setMonth(next.getMonth() + months); return next;};
const cairoDateTime = (date, end=false) => {
  const sample = new Date(`${date}T12:00:00Z`);
  const zone = new Intl.DateTimeFormat('en-US', {timeZone:'Africa/Cairo',timeZoneName:'longOffset'}).formatToParts(sample).find(part=>part.type==='timeZoneName').value;
  const raw = zone.replace('GMT','');
  const offset = raw.includes(':') ? raw : raw[0] + raw.slice(1).padStart(2,'0') + ':00';
  return `${date}T${end ? '23:59:59' : '00:00:00'}${offset}`;
};
let members = [], orders = [], token = '', gymConfigured = false;
const planSessions = {power:8,bronze:12,silver:16,platinum:20,gold:24,bronzeY:12,goldY:24,single:1,saunaOne:1,selfdef:8,allact:12,physio:12,private:12,privateG:12};
const planNames = {power:'باور',bronze:'برونز',silver:'سيلفر',platinum:'بلاتينيوم',gold:'جولد',bronzeY:'برونز',goldY:'جولد',single:'تمرين منفصل',saunaOne:'جلسة ساونا',selfdef:'الدفاع عن النفس',allact:'جميع الأنشطة',military:'التأهيل العسكري',physio:'التأهيل البدني',private:'التدريب البرايفيت',privateG:'البرايفيت جروب'};

async function api(path, method='GET', body) {
  const response = await fetch(path, {method, headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:body ? JSON.stringify(body) : undefined, cache:'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'تعذر تنفيذ العملية');
  return data;
}
function message(text, success=false) {$('#staffMessage').textContent = text; $('#staffMessage').classList.toggle('success',success);}
function render() {
  const total = members.reduce((n,m) => n + m.memberships.length,0);
  const active = members.reduce((n,m) => n + m.memberships.filter(s => s.status === 'active').length,0);
  const remaining = members.reduce((n,m) => n + m.memberships.filter(s => s.status === 'active').reduce((v,s) => v+s.remaining_sessions,0),0);
  $('#staffStats').innerHTML = `<div class="stat"><strong>${members.length}</strong><span>عضو</span></div><div class="stat"><strong>${active}</strong><span>اشتراك نشط</span></div><div class="stat"><strong>${remaining}</strong><span>حصة متبقية</span></div>`;
  const query = $('#memberSearch').value.trim().toLowerCase();
  const filtered = members.filter(member => member.name.toLowerCase().includes(query) || member.phone.includes(query));
  $('#staffMembers').innerHTML = filtered.length ? filtered.map(member => `<article class="staff-member"><div class="staff-member-head"><h3>${esc(member.name)}</h3><small>${esc(member.phone)}</small></div><div class="staff-member-body">${member.external_member_id ? `<p class="linked-label">مربوط بسيستم الجيم · ${esc(member.external_member_id)}</p>` : ''}${member.memberships.map(item => `<div><p>${esc(item.plan_name)} · ${item.remaining_sessions} من ${item.total_sessions} حصة متبقية</p><small>${item.status === 'active' ? 'ساري' : item.status === 'expired' ? 'منتهي' : item.status === 'finished' ? 'اكتملت الحصص' : 'لم يبدأ بعد'} · حتى ${esc(item.ends_at.slice(0,10))}</small><div class="member-actions">${member.external_member_id && gymConfigured ? '<span class="linked-label">الحضور من سيستم الجيم</span>' : `<button class="portal-action" data-checkin="${esc(item.id)}" ${item.status !== 'active' ? 'disabled' : ''}>تسجيل حضور +</button>${item.attendance?.length ? `<button class="portal-outline" data-void="${esc(item.attendance[0].id)}">إلغاء آخر حضور</button>` : ''}`}${gymConfigured && member.sync?.[item.id] !== 'sent' ? `<button class="portal-outline" data-retry="${esc(item.id)}">إعادة إرسال الاشتراك</button>` : ''}</div><div class="attendance-mini">${gymConfigured ? `المزامنة: ${esc(member.sync?.[item.id] || 'غير مرسل')} · ` : ''}آخر حضور محلي: ${item.attendance?.length ? esc(new Date(item.attendance[0].checked_in_at).toLocaleString('ar-EG')) : 'لا يوجد'}</div></div>`).join('')}<div class="member-actions"><button class="portal-outline" data-reset="${esc(member.id)}">تغيير رمز الدخول</button></div></div></article>`).join('') : '<p>لا يوجد أعضاء مطابقون.</p>';
  const activated = new Set(members.flatMap(member => member.memberships.map(item => item.order_id).filter(Boolean)));
  const selection = $('#orderSelect').value;
  $('#orderSelect').innerHTML = '<option value="">عميل بدون طلب</option>' + orders.filter(order => !activated.has(order.id)).map(order => `<option value="${esc(order.id)}">${esc(order.customer_name)} · ${esc(order.phone)} · ${esc(order.plan_id)}</option>`).join('');
  if (selection) $('#orderSelect').value = selection;
}
async function refresh() {
  const status = await api('/api/admin/gym/status');
  gymConfigured = status.configured;
  $('#gymStatus').innerHTML = gymConfigured ? `<strong>اتصال سيستم الجيم مهيأ</strong><span>${status.sent} اشتراك اتبعت · ${status.pending} قيد الإرسال · ${status.error} محتاج إعادة محاولة</span>` : '<strong>الربط الخارجي غير مفعّل</strong><span>الاشتراكات والحضور هنا محليًا فقط. أضف بيانات API للسيستم قبل استخدام المزامنة.</span>';
  [members,orders] = await Promise.all([api('/api/admin/members'),api('/api/admin/orders?limit=500')]);
  render(); $('#staffWorkspace').hidden = false;
}
$('#loadStaff').addEventListener('click', async () => {
  token = $('#staffToken').value.trim();
  if (!token) return message('اكتب رمز الإدارة أولًا.');
  try {await refresh(); sessionStorage.setItem('cezar_staff_token',token); message('اللوحة جاهزة.',true);} catch(error){message(error.message);}
});
$('#memberSearch').addEventListener('input', render);
$('#orderSelect').addEventListener('change', () => {
  const order = orders.find(item => item.id === $('#orderSelect').value);
  if (!order) return;
  $('#enrollName').value = order.customer_name; $('#enrollPhone').value = order.phone;
  const months = order.plan_type === 'yearly' ? Number(order.plan_id.split('|')[1]) || 12 : 1;
  const baseId = order.plan_id.split('|')[0];
  $('#planName').value = (planNames[baseId] || baseId) + (months > 1 ? ` · ${months} شهور` : '');
  $('#totalSessions').value = (planSessions[baseId] || 8) * months;
  $('#endDate').value = isoDate(addMonths(new Date($('#startDate').value), months));
});
$('#enrollForm').addEventListener('submit', async event => {
  event.preventDefault();
  const body = {order_id:$('#orderSelect').value || null,name:$('#enrollName').value.trim(),phone:$('#enrollPhone').value.trim(),plan_name:$('#planName').value.trim(),total_sessions:Number($('#totalSessions').value),starts_at:cairoDateTime($('#startDate').value),ends_at:cairoDateTime($('#endDate').value,true)};
  if (!/^01[0125]\d{8}$/.test(body.phone)) return message('رقم الموبايل غير صحيح.');
  try {const result = await api('/api/admin/memberships','POST',body); await refresh(); $('#enrollForm').reset(); $('#startDate').value=isoDate(new Date()); $('#endDate').value=isoDate(addMonths(new Date(),1)); if(result.access_code){$('#newCode').textContent=result.access_code; $('#accessResult').hidden=false;} else $('#accessResult').hidden=true; message(result.gym_sync_status === 'sent' ? 'تم تفعيل الاشتراك وإرساله لسيستم الجيم.' : 'تم تفعيل الاشتراك محليًا. راجع حالة الربط قبل اعتماد المزامنة.',true);} catch(error){message(error.message);}
});
$('#staffMembers').addEventListener('click', async event => {
  const button=event.target.closest('button[data-checkin],button[data-void],button[data-reset],button[data-retry]'); if(!button) return;
  try {
    if(button.dataset.checkin){await api(`/api/admin/memberships/${button.dataset.checkin}/checkins`,'POST'); message('تم تسجيل الحصة.',true);}
    else if(button.dataset.void){await api(`/api/admin/attendance/${button.dataset.void}/void`,'POST'); message('تم إلغاء آخر حضور.',true);}
    else if(button.dataset.retry){const result=await api(`/api/admin/gym/retry/${button.dataset.retry}`,'POST'); message(result.status === 'sent' ? 'تم إرسال الاشتراك للسيستم.' : 'تعذرت المزامنة؛ راجع إعدادات السيستم.',result.status === 'sent');}
    else {const result=await api(`/api/admin/members/${button.dataset.reset}/reset-code`,'POST'); $('#newCode').textContent=result.access_code; $('#accessResult').hidden=false; message('تم إصدار رمز جديد. سلّمه للعميل.',true);}
    await refresh();
  } catch(error){message(error.message);}
});
$('#importForm').addEventListener('submit', async event => {
  event.preventDefault();
  const body={name:$('#importName').value.trim(),phone:$('#importPhone').value.trim(),external_member_id:$('#externalMemberId').value.trim()};
  try {const result=await api('/api/admin/gym/import-member','POST',body); if(result.access_code){$('#newCode').textContent=result.access_code; $('#accessResult').hidden=false;} else $('#accessResult').hidden=true; $('#importForm').reset(); await refresh(); message(result.linked_existing ? 'تم ربط العضو الحالي، ورمز دخوله السابق ما زال صالحًا.' : 'تم ربط العضو. سلّمه رمز الدخول الجديد.',true);}
  catch(error){message(error.message);}
});
$('#copyCode').addEventListener('click', async()=>{await navigator.clipboard.writeText($('#newCode').textContent); message('تم نسخ الرمز.',true);});
$('#startDate').value=isoDate(new Date()); $('#endDate').value=isoDate(addMonths(new Date(),1));
const saved=sessionStorage.getItem('cezar_staff_token'); if(saved){token=saved;$('#staffToken').value=saved;refresh().catch(error=>message(error.message));}
