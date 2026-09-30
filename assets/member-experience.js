(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const cairoParts = value => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(value).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const cairoDay = value => { const parts = cairoParts(value); return `${parts.year}-${parts.month}-${parts.day}`; };
  const today = () => cairoDay(new Date());
  const offsetDay = offset => { const date = new Date(`${today()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0,10); };
  const dayDiff = target => Math.round((Date.parse(`${String(target).slice(0,10)}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) / 86400000);
  const dateText = value => { const date = new Date(`${String(value).slice(0,10)}T12:00:00Z`); return Number.isNaN(date.valueOf()) ? 'غير متاح' : new Intl.DateTimeFormat('ar-EG', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'}).format(date); };
  const visitText = value => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? 'تاريخ غير متاح' : new Intl.DateTimeFormat('ar-EG', {weekday:'long', day:'numeric', month:'long', hour:'numeric', minute:'2-digit', timeZone:'Africa/Cairo'}).format(date); };
  const sessionsWord = count => count === 1 ? 'حصة' : count === 2 ? 'حصتين' : count >= 3 && count <= 10 ? 'حصص' : 'حصة';
  const statusLabels = {active:'ساري الآن', upcoming:'لم يبدأ بعد', expired:'انتهى', finished:'الحصص مكتملة'};
  const staticPreviewHost = /(^|\.)(raw(?:cdn)?\.githack\.com|htmlpreview\.github\.io)$/.test(location.hostname);
  const preview = staticPreviewHost || new URLSearchParams(location.search).get('preview') === '1';
  const helpURL = 'https://wa.me/201097419761';
  const previewHref = path => {
    if (location.hostname !== 'htmlpreview.github.io') return path;
    const rawFile = location.search.slice(1).split('?')[0];
    if (!/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(index|join|member)\.html$/.test(rawFile)) return path;
    return `https://htmlpreview.github.io/?${rawFile.slice(0, rawFile.lastIndexOf('/') + 1)}${path}`;
  };
  const demoData = {
    name:'أحمد', source:'demo', last_synced_at:null, memberships:[{
      id:'preview-one', plan_name:'باقة جولد', total_sessions:24, used_sessions:16, remaining_sessions:8,
      starts_at:`${offsetDay(-20)}T00:00:00+03:00`, ends_at:`${offsetDay(10)}T23:59:59+03:00`, status:'active',
      attendance:[1,3,5,8,11,15].map((days, index) => ({id:`preview-visit-${index}`, checked_in_at:`${offsetDay(-days)}T18:15:00+03:00`})),
    }],
  };
  try { sessionStorage.removeItem('cezar_member_auth'); } catch (_) {}
  let currentData = null;
  let activeIndex = 0;
  let visitFilter = 'all';
  let showAllVisits = false;
  let navQueued = false;

  function setStatus(data, refreshFailed = false) {
    const descriptions = {
      gym:['متصل بسيستم الجيم','البيانات اتحدّثت من سيستم الجيم.'],
      cached:['آخر نسخة محفوظة','سيستم الجيم غير متاح حاليًا؛ ممكن تكون البيانات اتغيرت.'],
      unavailable:['البيانات غير متاحة','جرّب التحديث بعد شوية أو كلم الفريق.'],
      local:['بيانات الموقع','ربط سيستم الجيم لسه غير مفعل للحساب ده.'],
      demo:['معاينة فقط','الأرقام دي للتجربة، وليست من حساب حقيقي.'],
    };
    const [sourceTitle, sourceDetail] = descriptions[data.source] || descriptions.local;
    const title = refreshFailed ? 'التحديث تعذر' : sourceTitle;
    const detail = refreshFailed ? 'المعروض آخر بيانات وصلت للحساب في الجلسة دي؛ ممكن تكون اتغيرت.' : sourceDetail;
    const synced = data.last_synced_at ? ` · آخر تحديث ${escapeHTML(visitText(data.last_synced_at))}` : '';
    const status = $('#dataStatus');
    status.className = `connection-line connection-${refreshFailed ? 'cached' : Object.hasOwn(descriptions, data.source) ? data.source : 'local'}`;
    status.innerHTML = `<span class="connection-icon" aria-hidden="true"></span><strong>${title}</strong><span>${detail}${synced}</span>`;
  }

  function relativeEnd(item, left) {
    if (item.status === 'upcoming') return {title:'جهّز نفسك للبداية', description:`باقة ${item.plan_name} تبدأ ${dateText(item.starts_at)}.`, tone:'calm'};
    if (item.status === 'expired') return {title:'وقت بداية جديدة', description:'مدة الاشتراك انتهت. راجع التجديد مع الفريق قبل تمرينك الجاي.', tone:'urgent'};
    if (item.status === 'finished' || left === 0) return {title:'أنجزت كل الحصص', description:'مبروك! خلصت الباقة. تقدر تختار الخطوة الجاية دلوقتي.', tone:'urgent'};
    const days = dayDiff(item.ends_at);
    if (days <= 7) return {title:'التجديد قرب', description:days <= 0 ? 'الاشتراك ينتهي النهارده. راجع الفريق قبل التمرين.' : `فاضل ${days} يوم على انتهاء الباقة. خطط لتمرينك القادم.`, tone:'urgent'};
    if (left <= 3) return {title:'قربت من هدفك', description:`فاضل ${left} ${sessionsWord(left)}. كمّل بنفس الثبات وجهّز خطوتك الجاية.`, tone:'focus'};
    return {title:'كمّل على نفس الإيقاع', description:'كل حضور بيقرّبك من هدفك. الحصة الجاية بتبدأ منك.', tone:'calm'};
  }

  function nextAction(item, left) {
    if (item.status === 'upcoming') return {title:'استعد لأول تمرينة', description:'شوف مواعيد الجيم ومكانه وخطط لأول يوم في الباقة.', label:'مواعيد ومكان الجيم', href:previewHref('index.html#where')};
    if (item.status === 'expired' || item.status === 'finished' || left <= 3 || dayDiff(item.ends_at) <= 7) return {title:'اختار خطوتك الجاية', description:'راجع الباقات المناسبة ليك قبل ما تبدأ دورة جديدة.', label:'شوف الباقات', href:previewHref('join.html')};
    return {title:'حدد تمرينك الجاي', description:'راجع مواعيد الجيم وخلي الحصة الجاية في جدولك.', label:'مواعيد ومكان الجيم', href:previewHref('index.html#where')};
  }

  function updateSectionNav() {
    navQueued = false;
    if ($('#dashboard').hidden) return;
    const sections = ['overview','planDetails','attendanceHistory','memberHelp'];
    const line = window.scrollY + Math.min(window.innerHeight * .3, 240);
    const current = sections.filter(id => { const section = document.getElementById(id); return section && section.offsetTop <= line; }).at(-1) || 'overview';
    document.querySelectorAll('.member-sections a').forEach(link => {
      const active = link.hash === `#${current}`;
      link.classList.toggle('is-current', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function attendanceDays(visits) {
    const attended = new Set(visits.map(visit => { const date = new Date(visit.checked_in_at); return Number.isNaN(date.valueOf()) ? '' : cairoDay(date); }));
    const days = Array.from({length:14}, (_, index) => offsetDay(index - 13));
    const marked = days.filter(day => attended.has(day)).length;
    return `<div class="attendance-strip" aria-label="${marked} أيام حضور ظاهرة خلال آخر 14 يوم"><div class="strip-title"><strong>إيقاعك الأخير</strong><span>${marked} أيام حضور ظاهرة / آخر 14 يوم</span></div><div class="strip-bars" aria-hidden="true">${days.map((day, index) => `<span class="${attended.has(day) ? 'did-visit' : ''}" style="--bar-delay:${index * 28}ms" title="${escapeHTML(dateText(day))}"></span>`).join('')}</div><small>العلامات مبنية على الزيارات الظاهرة في السجل؛ الأيام الفارغة مش غياب.</small></div>`;
  }

  function filteredVisits(visits) {
    if (visitFilter === 'all') return visits;
    const current = today().slice(0,7);
    const previous = offsetDay(-Number(today().slice(8,10))).slice(0,7);
    return visits.filter(visit => {
      const date = new Date(visit.checked_in_at);
      if (Number.isNaN(date.valueOf())) return false;
      return cairoDay(date).startsWith(visitFilter === 'current' ? current : previous);
    });
  }

  function renderHistory(visits) {
    const filtered = filteredVisits(visits);
    const displayed = showAllVisits ? filtered : filtered.slice(0,6);
    const list = $('#visitList');
    list.innerHTML = displayed.length ? displayed.map(visit => `<li class="visit-row"><span class="visit-marker" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg></span><div><strong>تم تسجيل حضورك</strong><time datetime="${escapeHTML(visit.checked_in_at)}">${escapeHTML(visitText(visit.checked_in_at))}</time></div><span class="visit-tag">حضور</span></li>`).join('') : '<li class="history-empty">مفيش زيارات ظاهرة في الفترة دي. جرّب فترة تانية أو حدّث بياناتك.</li>';
    $('#visitCount').textContent = `${filtered.length} زيارة ظاهرة`;
    const more = $('#moreVisits');
    more.hidden = filtered.length <= 6;
    more.textContent = showAllVisits ? 'عرض زيارات أقل ↑' : `عرض باقي الزيارات (${filtered.length - 6}) ↓`;
    document.querySelectorAll('[data-visit-filter]').forEach(button => {
      const selected = button.dataset.visitFilter === visitFilter;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function animateMeter(left, total) {
    const arc = $('.session-meter-arc');
    if (!arc) return;
    const circumference = 2 * Math.PI * 76;
    const target = circumference * (1 - (total ? left / total : 0));
    arc.setAttribute('stroke-dasharray', String(circumference));
    arc.setAttribute('stroke-dashoffset', String(target));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !arc.animate) return;
    arc.animate([{strokeDashoffset:String(circumference)}, {strokeDashoffset:String(target)}], {duration:850, easing:'cubic-bezier(.16,1,.3,1)'});
  }

  function renderMembership(item) {
    const total = Math.max(0, Number(item.total_sessions) || 0);
    const used = Math.min(total, Math.max(0, Number(item.used_sessions) || 0));
    const left = Math.max(0, total - used);
    const percent = total ? Math.round(used / total * 100) : 0;
    const visits = Array.isArray(item.attendance) ? [...item.attendance].filter(visit => Number.isFinite(new Date(visit.checked_in_at).valueOf())).sort((a,b) => new Date(b.checked_in_at) - new Date(a.checked_in_at)) : [];
    const guidance = relativeEnd(item, left);
    const action = nextAction(item, left);
    const dayLabel = item.status === 'active' ? (dayDiff(item.ends_at) > 0 ? `${dayDiff(item.ends_at)} يوم` : 'اليوم') : '—';
    $('#membershipContent').innerHTML = `
      <section class="overview-section" id="overview" aria-labelledby="overviewTitle">
        <div class="section-heading"><div><span class="section-index">01 / نظرة عامة</span><h2 id="overviewTitle">النهارده، ركّز على <em>اللي جاي.</em></h2></div><p>أرقام واضحة من اشتراكك الحالي.</p></div>
        <div class="overview-grid">
          <article class="balance-card" aria-labelledby="planTitle">
            <div class="balance-top"><span>CEZAR / YOUR PLAN</span><span class="membership-state ${escapeHTML(item.status)}">${escapeHTML(statusLabels[item.status] || 'حالة الاشتراك')}</span></div>
            <h3 id="planTitle">${escapeHTML(item.plan_name)}</h3>
            <div class="balance-main"><div class="session-meter" role="meter" aria-label="الحصص المتبقية" aria-valuemin="0" aria-valuemax="${total || 1}" aria-valuenow="${left}" aria-valuetext="${left} ${sessionsWord(left)} متبقية من ${total}"><svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><circle class="session-meter-track" cx="100" cy="100" r="76"/><circle class="session-meter-arc" cx="100" cy="100" r="76"/></svg><div class="session-meter-count" aria-hidden="true"><strong>${left}</strong><span>${sessionsWord(left)} متبقية</span></div></div><div class="balance-copy"><strong>${escapeHTML(guidance.title)}</strong><p>${escapeHTML(guidance.description)}</p><span>خلصت ${used} من ${total} حصة</span></div></div>
            <div class="balance-progress"><div><span>تقدم الباقة</span><strong dir="ltr">${percent}%</strong></div><div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="نسبة الحصص المستخدمة"><span style="width:${percent}%"></span></div></div>
          </article>
          <div class="overview-side"><article class="next-card next-${guidance.tone}"><span class="card-kicker">الخطوة الجاية</span><h3>${escapeHTML(action.title)}</h3><p>${escapeHTML(action.description)}</p><a href="${action.href}">${escapeHTML(action.label)} <span aria-hidden="true">↗</span></a></article>${attendanceDays(visits)}</div>
        </div>
        <div class="quick-stats" aria-label="ملخص عضويتك"><div><span>حضرت</span><strong>${used}</strong><small>من ${total} حصة</small></div><div><span>متبقي</span><strong>${left}</strong><small>${sessionsWord(left)} في الباقة</small></div><div><span>المدة المتبقية</span><strong class="days-stat">${escapeHTML(dayLabel)}</strong><small>${item.status === 'active' ? 'حتى نهاية الاشتراك' : escapeHTML(statusLabels[item.status] || '')}</small></div></div>
      </section>
      <section class="details-section" id="planDetails" aria-labelledby="detailsTitle"><div class="section-heading"><div><span class="section-index">02 / الاشتراك</span><h2 id="detailsTitle">تفاصيل الباقة، <em>من غير لف.</em></h2></div></div><div class="details-grid"><article class="detail-card"><span>بداية الاشتراك</span><strong>${escapeHTML(dateText(item.starts_at))}</strong><small>حسب بيانات العضوية</small></article><article class="detail-card"><span>نهاية الاشتراك</span><strong>${escapeHTML(dateText(item.ends_at))}</strong><small>آخر يوم للباقة الحالية</small></article><article class="detail-card"><span>حالة الباقة</span><strong>${escapeHTML(statusLabels[item.status] || 'غير معروفة')}</strong><small>${left} ${sessionsWord(left)} متبقية</small></article></div></section>
      <section class="history-section" id="attendanceHistory" aria-labelledby="historyTitle"><div class="section-heading"><div><span class="section-index">03 / الحضور</span><h2 id="historyTitle">كل زيارة <em>تتحسب.</em></h2></div><span id="visitCount"></span></div><div class="history-actions"><div class="filter-list" role="group" aria-label="تصفية سجل الحضور"><button type="button" data-visit-filter="all">الكل</button><button type="button" data-visit-filter="current">الشهر ده</button><button type="button" data-visit-filter="previous">الشهر اللي فات</button></div><button class="export-button" id="exportVisits" type="button" ${visits.length && !preview ? '' : 'disabled'}>تحميل السجل CSV ↓</button></div><ol class="visit-list" id="visitList"></ol><button class="more-visits" id="moreVisits" type="button" hidden></button><p class="history-note">عدد الزيارات الظاهرة ممكن يختلف عن الحصص المستخدمة لو السيستم أرسل سجلًا جزئيًا.</p></section>
      <section class="help-section" id="memberHelp" aria-labelledby="helpTitle"><div><span class="section-index">04 / المساعدة</span><h2 id="helpTitle">محتاج حاجة؟ <em>إحنا معاك.</em></h2><p>لو حصة مش ظاهرة، أو محتاج تجدد، فريق سيزر يراجع معاك البيانات. إرسال الرسالة يتم بعد ما تفتح واتساب بنفسك.</p></div><div class="help-actions"><a class="help-primary" href="${helpURL}?text=${encodeURIComponent('مرحبًا، محتاج مساعدة بخصوص اشتراكي في سيزر جيم.') }" target="_blank" rel="noopener noreferrer">كلم فريق سيزر ↗</a><a href="${previewHref('index.html#where')}">مواعيد ومكان الجيم ←</a></div></section>`;
    renderHistory(visits);
    animateMeter(left, total);
    $('#membershipContent').querySelectorAll('[data-visit-filter]').forEach(button => button.addEventListener('click', () => {visitFilter = button.dataset.visitFilter; showAllVisits = false; renderHistory(visits);}));
    $('#moreVisits').addEventListener('click', () => {showAllVisits = !showAllVisits; renderHistory(visits);});
    $('#exportVisits').addEventListener('click', () => exportVisits(visits));
    updateSectionNav();
  }

  function exportVisits(visits) {
    if (!visits.length || preview) return;
    const rows = visits.map(visit => {
      const date = new Date(visit.checked_in_at);
      return [cairoDay(date), new Intl.DateTimeFormat('en-GB', {timeZone:'Africa/Cairo', hour:'2-digit', minute:'2-digit', hour12:false}).format(date)].join(',');
    });
    const blob = new Blob(['\uFEFFdate,time\r\n', rows.join('\r\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'cezar-attendance.csv'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function render(data, resetPosition = false) {
    currentData = data;
    $('#loginView').hidden = true;
    $('#dashboard').hidden = false;
    $('#memberName').textContent = String(data.name || 'بطل').trim().split(/\s+/)[0];
    $('#demoBanner').hidden = data.source !== 'demo';
    $('#refreshData').disabled = data.source === 'demo';
    setStatus(data);
    const items = Array.isArray(data.memberships) ? data.memberships : [];
    activeIndex = Math.min(activeIndex, Math.max(0, items.length - 1));
    $('#membershipTabs').hidden = items.length <= 1;
    $('.member-sections').hidden = items.length === 0;
    $('#membershipTabs').innerHTML = items.map((item, index) => `<button id="membershipTab${index}" type="button" role="tab" aria-controls="membershipContent" aria-selected="${index === activeIndex}" tabindex="${index === activeIndex ? 0 : -1}" data-index="${index}">${escapeHTML(item.plan_name)} <span>${escapeHTML(statusLabels[item.status] || '')}</span></button>`).join('');
    $('#membershipContent').setAttribute('role', items.length > 1 ? 'tabpanel' : 'region');
    if (items.length > 1) $('#membershipContent').setAttribute('aria-labelledby', `membershipTab${activeIndex}`);
    else $('#membershipContent').removeAttribute('aria-labelledby');
    if (items.length) renderMembership(items[activeIndex]);
    else $('#membershipContent').innerHTML = `<div class="no-membership"><span>حساب العضو</span><h2>${data.source === 'unavailable' ? 'البيانات مش متاحة دلوقتي.' : 'حسابك جاهز، والباقة لسه مش ظاهرة.'}</h2><p>${data.source === 'unavailable' ? 'جرّب التحديث. لو المشكلة مستمرة، فريق سيزر يساعدك.' : 'لو اشتركت بالفعل، اطلب من الفريق مراجعة تفعيل الباقة وربطها بحسابك.'}</p><a href="${helpURL}" target="_blank" rel="noopener noreferrer">تواصل مع الفريق ↗</a></div>`;
    if (resetPosition) window.scrollTo({top:0, behavior:'instant'});
  }

  async function loadSession(refresh = false) {
    if (preview) { render(demoData); return; }
    const button = $('#refreshData');
    if (refresh) {button.disabled = true; button.classList.add('is-loading');}
    try {
      const response = await fetch('/api/member/me', {credentials:'same-origin', cache:'no-store'});
      if (response.status === 401) {
        currentData = null; $('#dashboard').hidden = true; $('#loginView').hidden = false;
        if (refresh) $('#loginMessage').textContent = 'انتهت الجلسة. سجل دخولك من جديد.';
        return;
      }
      if (!response.ok) throw new Error('تعذر تحديث البيانات');
      render(await response.json());
    } catch (_) {
      if (currentData) setStatus(currentData, true);
      else $('#loginMessage').textContent = 'تعذر الاتصال بالموقع. جرّب تحديث الصفحة.';
    } finally {button.classList.remove('is-loading'); if (currentData && currentData.source !== 'demo') button.disabled = false;}
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
      render(data, true);
    } catch (error) {message.textContent = error.message;}
    finally {button.disabled = false; button.querySelector('span').textContent = 'افتح حسابي';}
  });
  $('#membershipTabs').addEventListener('click', event => {
    const button = event.target.closest('button[data-index]');
    if (!button || !currentData) return;
    activeIndex = Number(button.dataset.index); showAllVisits = false; visitFilter = 'all'; render(currentData);
    $(`#membershipTab${activeIndex}`)?.focus();
  });
  $('#membershipTabs').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs = [...$('#membershipTabs').querySelectorAll('button')];
    if (!tabs.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (activeIndex + (event.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
  });
  $('#refreshData').addEventListener('click', () => loadSession(true));
  window.addEventListener('scroll', () => {if (!navQueued) {navQueued = true; requestAnimationFrame(updateSectionNav);}}, {passive:true});
  window.addEventListener('hashchange', updateSectionNav);
  $('#logout').addEventListener('click', async () => {
    if (preview) {location.href = staticPreviewHost ? 'https://cezar-gym-prod.onrender.com/member.html' : 'member.html'; return;}
    try {await fetch('/api/member/logout', {method:'POST', credentials:'same-origin', cache:'no-store'});} catch (_) {}
    currentData = null; $('#dashboard').hidden = true; $('#loginView').hidden = false;
    $('#phone').value = ''; $('#code').value = ''; $('#loginMessage').textContent = '';
  });
  if (staticPreviewHost) {
    document.querySelectorAll('a[href="index.html"]').forEach(link => {link.href = previewHref('index.html');});
    document.querySelectorAll('a[href="join.html"]').forEach(link => {link.href = previewHref('join.html');});
    $('#demoBanner a').href = 'https://cezar-gym-prod.onrender.com/member.html';
  }
  loadSession();
})();
