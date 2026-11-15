/* AXO v13: expenses, alerts, photo, voice notes, invoices, workflows, templates, study, translate, plugins, cloud sync. */
const aiPayload = () => ({ provider: (settings.ai || {}).provider, url: (settings.ai || {}).url, key: (settings.ai || {}).key, agent: true, address: addressName() });
const getBiz = () => ({ orders: 'orders', total: 'total', date: 'createdAt', items: 'items', reviews: 'reviews', ...(settings.biz || {}) });

/* ---- request enrichment (business hints + plugins) ---- */
const _fetch1 = window.fetch;
window.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (/\/api\/(chat|bot-chat)$/.test(url) && init && typeof init.body === 'string') {
    try {
      const b = JSON.parse(init.body), biz = getBiz();
      b.ai = { ...(b.ai || {}), biz };
      if ((settings.firebase || {}).service_account) b.ai.hints = `Shop data in Firebase: orders collection "${biz.orders}" (total field "${biz.total}", date field "${biz.date}", items field "${biz.items}"); reviews collection "${biz.reviews}". For review replies read the reviews with firebase_read and draft short, polite replies.`;
      b.prefs = { ...(b.prefs || {}), biz };
      b.integrations = { ...(b.integrations || {}), plugins: (settings.plugins || []).slice(0, 16) };
      init = { ...init, body: JSON.stringify(b) };
    } catch { /* ignore */ }
  }
  return _fetch1.call(window, input, init);
};
async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({})); if (!res.ok || d.ok === false) throw new Error(d.error || 'Something went wrong.'); return d;
}
function mirrorChat(userText, reply, extras) {
  try {
    const chat = currentChat(); addMessage('user', userText); chat.messages.push({ role: 'user', content: userText, createdAt: Date.now() });
    const h = addMessage('assistant', reply); if (extras) renderIntelligence(extras, h.richHost);
    chat.messages.push({ role: 'assistant', content: reply, extras: extras || undefined, createdAt: Date.now() }); chat.updatedAt = Date.now(); persistConversations();
  } catch { /* ignore */ }
}
async function speakVoice(text, voice) {
  try {
    const r = await _fetch1.call(window, '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice, rate: Number(settings.voiceRate) || 0 }) });
    if (!r.ok) throw new Error('tts'); const url = URL.createObjectURL(await r.blob()); const a = new Audio(url);
    await new Promise(res => { a.onended = res; a.onerror = res; a.play().catch(res); }); URL.revokeObjectURL(url);
  } catch { /* ignore */ }
}

/* ---- expenses (kept on this device) ---- */
const CAT_WORDS = { Food: /lunch|dinner|breakfast|food|tea|chai|coffee|snack|biryani|restaurant|pizza|burger|juice/i, Travel: /bus|taxi|cab|uber|ola|petrol|fuel|auto|train|flight|metro/i, Shopping: /shirt|shoes|clothes|amazon|flipkart|bought|shopping|dress/i, Bills: /bill|recharge|rent|electric|wifi|internet|water|emi/i };
const guessCat = n => Object.keys(CAT_WORDS).find(k => CAT_WORDS[k].test(n)) || 'Other';
function handleExpense(text) {
  const t = text.trim(); settings.expenses = settings.expenses || [];
  let m = t.match(/^(?:i\s+)?(?:spent|paid|bought|expense)\s*(?:rs\.?|₹|inr)?\s*(\d+(?:\.\d+)?)\s*(?:rs|rupees|₹)?\s*(?:on|for|at)?\s*(.*)$/i);
  if (m) {
    const amt = Number(m[1]), note = (m[2] || '').trim() || 'misc', cat = guessCat(note);
    settings.expenses.push({ amt, cat, note: note.slice(0, 60), ts: Date.now() }); settings.expenses = settings.expenses.slice(-500); saveSettings();
    const day = new Date().toDateString(), today = settings.expenses.filter(e => new Date(e.ts).toDateString() === day).reduce((a, e) => a + e.amt, 0);
    mirrorChat(t, `Logged ₹${amt} for ${note} (${cat}). Today so far: ₹${today}.`); return true;
  }
  m = t.match(/^(?:my\s+)?(?:expenses?|spending)(?:\s+(?:report|summary))?(?:\s+(?:for|this)\s+)?\s*(today|week|month)?\??$|^how much (?:did i|have i) spent(?:\s+(?:this\s+)?(today|week|month))?\??$/i);
  if (m) {
    const per = (m[1] || m[2] || 'week').toLowerCase(), days = per === 'today' ? 1 : per === 'month' ? 30 : 7, since = Date.now() - days * 864e5;
    const list = settings.expenses.filter(e => e.ts >= since); if (!list.length) { mirrorChat(t, `No expenses logged for ${per === 'today' ? 'today' : 'this ' + per}. Say “spent 250 on lunch” to add one.`); return true; }
    const by = {}, byDay = {}; list.forEach(e => { by[e.cat] = (by[e.cat] || 0) + e.amt; const d = new Date(e.ts).toISOString().slice(5, 10); byDay[d] = (byDay[d] || 0) + e.amt; });
    const total = list.reduce((a, e) => a + e.amt, 0), dk = Object.keys(byDay).sort();
    const charts = [{ title: `Spending by category (${per})`, type: 'pie', labels: Object.keys(by), values: Object.values(by) }];
    if (dk.length > 1) charts.push({ title: 'Spending per day', type: 'line', labels: dk, values: dk.map(k => byDay[k]) });
    mirrorChat(t, `You spent ₹${total} ${per === 'today' ? 'today' : 'this ' + per} across ${list.length} items. Biggest: ${Object.entries(by).sort((a, b) => b[1] - a[1])[0][0]}.`, { charts }); return true;
  }
  return false;
}
const _send = sendMessage;
sendMessage = async function (raw) {
  const inp = $('#messageInput'), text = String(raw ?? (inp ? inp.value : '')).trim();
  if (text && handleExpense(text)) { if (inp && raw === undefined) { inp.value = ''; inp.dispatchEvent(new Event('input')); } return; }
  return _send(raw);
};

/* ---- alerts ---- */
let lastWatch = 0, watchBusy = false;
function snapGet() { try { return JSON.parse(localStorage.getItem('axu_snap') || 'null'); } catch { return null; } }
async function checkAlerts(manual) {
  if (watchBusy) return; watchBusy = true; lastWatch = Date.now();
  try {
    const d = await postJSON('/api/watch', { integrations: integrationsPayload(), biz: getBiz() }), prev = snapGet(), now = d.snap || {}, msgs = [];
    if (prev) {
      if (now.orders > (prev.orders ?? now.orders)) msgs.push(`${now.orders - prev.orders} new order(s)`);
      if (now.reviews > (prev.reviews ?? now.reviews)) msgs.push(`${now.reviews - prev.reviews} new review(s)`);
      if (now.github > (prev.github ?? now.github)) msgs.push(`${now.github - prev.github} new GitHub notification(s)`);
      if (now.mail > (prev.mail ?? now.mail)) msgs.push(`${now.mail - prev.mail} new email(s)`);
    }
    localStorage.setItem('axu_snap', JSON.stringify(now));
    if (msgs.length) {
      const text = msgs.join(' · '); toast(text); try { navigator.vibrate?.(200); } catch { /* ignore */ }
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('AXO', { body: text, icon: LOGO_URL }); } catch { /* ignore */ }
      if (settings.voiceReplies) neuralSay(text.replace(/[^\w ,.()]/g, ''));
    }
    if (manual) $('#alertMsg').textContent = msgs.length ? msgs.join(' · ') : `Nothing new. ${Object.entries(now).map(([k, v]) => k + ' ' + v).join(', ') || 'Connect Firebase, GitHub or email first.'}`;
  } catch (e) { if (manual) $('#alertMsg').textContent = e.message; }
  watchBusy = false;
}
setInterval(() => { const a = settings.alerts || {}; if (a.on && Date.now() - lastWatch > (Number(a.mins) || 5) * 60000) checkAlerts(false); }, 30000);
$('#alertNow')?.addEventListener('click', () => { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ } checkAlerts(true); });

/* ---- settings fields ---- */
const bzSet = (k, v) => { settings.biz = { ...(settings.biz || {}), [k]: v }; };
const syncs2 = [
  bindField('#bzOrders', () => (settings.biz || {}).orders, v => bzSet('orders', v)), bindField('#bzTotal', () => (settings.biz || {}).total, v => bzSet('total', v)),
  bindField('#bzDate', () => (settings.biz || {}).date, v => bzSet('date', v)), bindField('#bzItems', () => (settings.biz || {}).items, v => bzSet('items', v)),
  bindField('#bzReviews', () => (settings.biz || {}).reviews, v => bzSet('reviews', v)),
  bindField('#alertOn', () => (settings.alerts || {}).on, v => { settings.alerts = { ...(settings.alerts || {}), on: v }; try { if (v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ } }, true),
  bindField('#alertMins', () => (settings.alerts || {}).mins || '5', v => { settings.alerts = { ...(settings.alerts || {}), mins: v }; }),
  bindField('#fbWeb', () => settings.fbWeb, v => { settings.fbWeb = v; }),
].filter(Boolean);
const _as2 = applySettings; applySettings = function () { _as2(); syncs2.forEach(f => f()); renderPlugins(); renderFlows(); };

/* ---- photo understanding ---- */
(function () {
  const actions = $('.composer-actions'); if (!actions) return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'attachBtn'; btn.className = 'composer-icon-button'; btn.title = 'Ask about a photo'; btn.setAttribute('aria-label', 'Ask about a photo'); btn.innerHTML = axIcon('camera', 20);
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
  actions.prepend(btn, file); btn.onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    if (!(settings.ai || {}).key) { toast('Add an AI key in Settings → AI & API for photos.'); return; }
    const q = ($('#messageInput').value || '').trim(); $('#messageInput').value = '';
    let img, thumb;
    try {
      ({ img, thumb } = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => { const mk = (max, qual) => { const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', qual); }; res({ img: mk(1024, .82), thumb: mk(360, .7) }); };
        im.onerror = () => rej(new Error('Could not read that image.')); im.src = URL.createObjectURL(f);
      }));
    } catch (e) { toast(e.message); return; }
    const label = q || 'What is in this photo?', chat = currentChat();
    const uh = addMessage('user', label); attachPhoto(uh.bubble, thumb); chat.messages.push({ role: 'user', content: label, image: thumb, createdAt: Date.now() });
    const ah = addMessage('assistant', 'Looking at the photo…'); let reply;
    try { reply = (await postJSON('/api/vision', { ai: aiPayload(), image: img, question: q })).reply || 'I could not see anything there.'; } catch (e) { reply = 'Photo problem: ' + e.message; }
    ah.bubble.textContent = reply; chat.messages.push({ role: 'assistant', content: reply, createdAt: Date.now() }); chat.updatedAt = Date.now(); persistConversations();
    if (settings.voiceReplies) neuralSay(reply.slice(0, 400));
  };
})();

/* ---- voice note → tasks, reminders, events ---- */
function startVoiceNote() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { toast('Voice input is not supported in this browser.'); return; }
  if (!(settings.ai || {}).key) { toast('Add an AI key in Settings → AI & API first.'); return; }
  const wrap = document.createElement('div'); wrap.className = 'vn-panel';
  wrap.innerHTML = '<div class="vn-card"><strong>' + axIcon('mic') + ' Voice note</strong><span class="vn-live">● Listening… talk freely</span><textarea id="vnText" placeholder="Your words appear here (you can edit)"></textarea><div class="bf-actions"><button class="pill-button go" id="vnDone" type="button">Done</button><button class="pill-button" id="vnCancel" type="button">Cancel</button></div><div id="vnOut"></div></div>';
  document.body.append(wrap); const ta = wrap.querySelector('#vnText'); let rec = null, on = true;
  const begin = () => { if (!on) return; rec = new SR(); rec.lang = settings.voiceLanguage || 'en-IN'; rec.continuous = true; rec.interimResults = false; rec.onresult = ev => { for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) ta.value = (ta.value + ' ' + ev.results[i][0].transcript).trim(); }; rec.onend = () => { if (on) setTimeout(begin, 200); }; try { rec.start(); } catch { /* ignore */ } };
  const stop = () => { on = false; try { rec?.abort(); } catch { /* ignore */ } };
  wrap.querySelector('#vnCancel').onclick = () => { stop(); wrap.remove(); };
  wrap.querySelector('#vnDone').onclick = async () => {
    stop(); const text = ta.value.trim(); if (!text) { wrap.remove(); return; }
    const out = wrap.querySelector('#vnOut'); out.textContent = 'Sorting it out…';
    try {
      const d = (await postJSON('/api/braindump', { ai: aiPayload(), text })).data || {};
      const tasks = [...(d.tasks || []), ...(d.notes || [])].slice(0, 12), rem = (d.reminders || []).slice(0, 8), ev = (d.events || []).slice(0, 6);
      out.innerHTML = `${tasks.length ? '<b>Notes/tasks</b><ul>' + tasks.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : ''}${rem.length ? '<b>Reminders</b><ul>' + rem.map(r => `<li>${esc(r.text)} — in ${esc(r.minutes)} min</li>`).join('') + '</ul>' : ''}${ev.length ? '<b>Events</b><ul>' + ev.map(e => `<li>${esc(e.title)} — ${esc(e.start)}</li>`).join('') + '</ul>' : ''}${!tasks.length && !rem.length && !ev.length ? 'Nothing actionable found.' : ''}`;
      if (tasks.length || rem.length || ev.length) {
        const add = document.createElement('button'); add.className = 'pill-button go'; add.type = 'button'; add.textContent = 'Add all'; out.append(add);
        add.onclick = async () => {
          for (const t of tasks) { try { await postJSON('/api/notes', { text: t }); } catch { /* ignore */ } }
          rem.forEach(r => scheduleReminder({ text: r.text, minutes: Number(r.minutes) || 5 }));
          ev.forEach(e => { const st = String(e.start).replace(/[-: ]/g, '').replace(/^(\d{8})(\d{4}).*/, '$1T$200'); const mins = Number(e.minutes) || 60; const a = document.createElement('a'); a.className = 'result-link'; a.target = '_blank'; a.rel = 'noopener'; a.innerHTML = axIcon('calendar', 16) + ' ' + esc(e.title); a.style.display = 'block'; a.href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${st}/${st}`; out.append(a); });
          add.remove(); toast('Added. Tap any calendar link to save events.'); if (!ev.length) wrap.remove();
        };
      }
    } catch (e) { out.textContent = e.message; }
  };
  begin();
}

/* ---- invoice card ---- */
function renderInvoice(inv, host) {
  const total = inv.items.reduce((a, i) => a + i.qty * i.price, 0), cur = esc(inv.currency || '₹');
  const card = document.createElement('div'); card.className = 'inv';
  const rows = inv.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${cur}${i.price}</td><td>${cur}${(i.qty * i.price).toFixed(2)}</td></tr>`).join('');
  card.innerHTML = `<b>Invoice #${esc(inv.no)}</b> · ${esc(inv.date)}<br>${inv.business ? esc(inv.business) + '<br>' : ''}Bill to: ${esc(inv.customer)}<table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${rows}<tr><td colspan="3"><b>Total</b></td><td><b>${cur}${total.toFixed(2)}</b></td></tr></table>${inv.notes ? '<small>' + esc(inv.notes) + '</small><br>' : ''}`;
  const b = document.createElement('button'); b.className = 'pill-button go'; b.type = 'button'; b.textContent = 'Print / Save PDF'; b.style.marginTop = '8px';
  b.onclick = () => { const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print.'); return; } w.document.write(`<!doctype html><title>Invoice ${esc(inv.no)}</title><style>body{font:14px sans-serif;max-width:640px;margin:30px auto;padding:0 16px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}td:last-child,th:last-child{text-align:right}</style><h2>Invoice #${esc(inv.no)}</h2><p>${esc(inv.date)}<br>${inv.business ? '<b>' + esc(inv.business) + '</b><br>' : ''}Bill to: <b>${esc(inv.customer)}</b></p><table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${rows}<tr><td colspan="3"><b>Total</b></td><td><b>${cur}${total.toFixed(2)}</b></td></tr></table><p>${esc(inv.notes)}</p><script>setTimeout(()=>print(),300)<\/script>`); w.document.close(); };
  card.append(b); host.append(card);
}
const _ri2 = renderIntelligence; renderIntelligence = function (data, host) { _ri2(data, host); if (host && data.invoice && Array.isArray(data.invoice.items)) renderInvoice(data.invoice, host); };

/* ---- node speech bubbles ---- */
function nodeSay(id, text) {
  try {
    if (!node || !nodeGroup || !nodeBots[id] || !window.THREE) return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 200; const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,.96)'; x.beginPath(); x.roundRect ? x.roundRect(8, 8, 496, 150, 26) : x.rect(8, 8, 496, 150); x.fill();
    x.beginPath(); x.moveTo(236, 156); x.lineTo(256, 190); x.lineTo(276, 156); x.fill();
    x.fillStyle = '#111'; x.font = '26px sans-serif'; const words = String(text).split(' '); let line = '', y = 44, n = 0;
    for (const w of words) { const t = line + w + ' '; if (x.measureText(t).width > 460 && line) { x.fillText(line, 28, y); y += 32; line = w + ' '; if (++n >= 3) { line = line.trim() + '…'; break; } } else line = t; }
    x.fillText(line, 28, y);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    sp.scale.set(3.6, 1.4, 1); const b = nodeBots[id]; sp.position.set(b.position.x, b.userData.y0 + 4.2, 0.5); nodeGroup.add(sp);
    setTimeout(() => nodeGroup && nodeGroup.remove(sp), 9000);
  } catch { /* ignore */ }
}

/* ---- workflows ---- */
const flows = () => (settings.flows = settings.flows || []);
function renderFlows() {
  const box = $('#flowList'); if (!box) return; box.innerHTML = '';
  if (!flows().length) box.innerHTML = '<div class="empty-state">No workflows yet. Create one below.</div>';
  flows().forEach((f, i) => {
    const row = document.createElement('div'); row.className = 'flow-item';
    row.innerHTML = `<span><b>${esc(f.name)}</b><small>${f.steps.map(s => esc((botById(s.bot) || {}).name || '?')).join(' → ')}</small></span>`;
    const run = document.createElement('button'); run.className = 'pill-button go'; run.type = 'button'; run.textContent = 'Run'; run.onclick = () => runFlow(f);
    const del = document.createElement('button'); del.className = 'pill-button'; del.type = 'button'; del.textContent = 'Delete'; del.onclick = () => { flows().splice(i, 1); saveSettings(); renderFlows(); };
    const wrap = document.createElement('span'); wrap.style.cssText = 'display:flex;gap:6px'; wrap.append(run, del); row.append(wrap); box.append(row);
  });
}
function addStepRow(bot, prompt) {
  const row = document.createElement('div'); row.className = 'step-row';
  row.innerHTML = `<select>${bots.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select><input maxlength="300" placeholder="What should this bot do?">`;
  if (bot) row.querySelector('select').value = bot; if (prompt) row.querySelector('input').value = prompt; $('#flSteps').append(row);
}
$('#flAddStep')?.addEventListener('click', () => { loadBots(); addStepRow(); });
$('#flowForm')?.addEventListener('submit', ev => {
  ev.preventDefault();
  const steps = $$('#flSteps .step-row').map(r => ({ bot: r.querySelector('select').value, prompt: r.querySelector('input').value.trim() })).filter(s => s.prompt);
  if (!steps.length) { toast('Add at least one step.'); return; }
  flows().push({ id: 'f' + Date.now().toString(36), name: $('#flName').value.trim().slice(0, 30), steps }); saveSettings(); $('#flName').value = ''; $('#flSteps').innerHTML = ''; addStepRow(); renderFlows(); toast('Workflow saved.');
});
async function runFlow(f) {
  const out = $('#flowOut'); out.innerHTML = ''; let prev = '';
  const log = (cls, text) => { const d = document.createElement('div'); d.className = 'bmsg ' + cls; d.textContent = text; out.append(d); out.scrollTop = out.scrollHeight; return d; };
  log('trace', `Running: ${f.name}`);
  for (let i = 0; i < f.steps.length; i++) {
    const s = f.steps[i], bot = botById(s.bot); if (!bot) { log('trace', `Step ${i + 1}: bot missing.`); break; }
    nodeActive[bot.id] = Date.now() + 90000; const wait = log('b', `Step ${i + 1} · ${bot.name} working…`);
    try {
      const d = await postJSON('/api/bot-chat', { message: s.prompt + (prev ? `\n\nResult from the previous step:\n${prev.slice(0, 1500)}` : ''), bot, bots, history: [],
        prefs: { platform: settings.platform, contacts: contactsMap() }, ai: aiPayload(), integrations: integrationsPayload() });
      wait.remove(); nodeActive[bot.id] = Date.now() + 8000; nodeSay(bot.id, d.reply || 'Done');
      (d.trace || []).forEach(t => { const tb = bots.find(x => x.name === t.bot); if (tb) { nodeActive[tb.id] = Date.now() + 8000; nodeSay(tb.id, t.result); } });
      const extras = {}; ['actions', 'confirms', 'images', 'map', 'cards', 'charts', 'invoice', 'news'].forEach(k => { if (d[k] !== undefined) extras[k] = d[k]; });
      const msg = log('b', `${bot.name}: ${d.reply || 'Done.'}`); const host = document.createElement('div'); msg.append(host); renderIntelligence(extras, host); prev = d.reply || '';
    } catch (e) { wait.textContent = `Step ${i + 1} failed: ${e.message}`; break; }
  }
  log('trace', 'Finished');
  return prev;
}
const _rs = runSchedule;
runSchedule = async function (s) {
  const m = /^workflow:\s*(.+)$/i.exec(s.prompt || ''); if (!m) return _rs(s);
  const f = flows().find(x => x.name.toLowerCase() === m[1].trim().toLowerCase()); if (!f) { toast('Workflow not found: ' + m[1]); return; }
  loadBots(); const res = await runFlow(f); toast('Scheduled: ' + f.name + ': ' + String(res).slice(0, 80));
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('AXO · ' + f.name, { body: String(res).slice(0, 140), icon: LOGO_URL }); } catch { /* ignore */ }
};

/* ---- bot tabs: flows + templates ---- */
const TEMPLATES = [
  { name: 'Shop Manager', desc: 'Runs a shop or restaurant: sales, reviews, promos.', bots: [
    { k: 'm', name: 'Manager', color: '#f5c542', role: 'Shop manager. Delegate sales questions to Analyst, review replies to Replier, promo messages to Promoter, then summarise.', up: '', tools: [] },
    { k: 'a', name: 'Analyst', color: '#f472b6', role: 'Sales analyst. Use the orders dashboard and Firebase data, show charts, explain trends simply.', up: 'm', tools: ['firebase_overview', 'firebase_read', 'firebase_trend', 'show_chart', 'orders_dashboard'] },
    { k: 'r', name: 'Replier', color: '#4f9dff', role: 'Reads customer reviews and drafts short, warm, polite replies.', up: 'm', tools: ['firebase_read'] },
    { k: 'p', name: 'Promoter', color: '#34d399', role: 'Writes short promo messages for WhatsApp and social posts. Friendly, with an offer.', up: 'm', tools: ['web_search'] }] },
  { name: 'Study Buddy', desc: 'Explains topics and quizzes you.', bots: [
    { k: 'c', name: 'Coach', color: '#a78bfa', role: 'Study coach. Ask what to learn, delegate explanations to Explainer and practice to Quizmaster.', up: '', tools: [] },
    { k: 'e', name: 'Explainer', color: '#22d3ee', role: 'Explains topics simply with examples. Uses Wikipedia and the web.', up: 'c', tools: ['wikipedia', 'web_search', 'lookup'] },
    { k: 'q', name: 'Quizmaster', color: '#fb923c', role: 'Makes 3 short quiz questions on a topic and checks answers.', up: 'c', tools: [] }] },
  { name: 'Social Media Team', desc: 'Plan, research and write posts.', bots: [
    { k: 'p', name: 'Planner', color: '#f5c542', role: 'Content planner. Break a goal into a posting plan and delegate to Writer and Researcher.', up: '', tools: [] },
    { k: 'w', name: 'Writer', color: '#f472b6', role: 'Writes catchy captions and short posts in the brand voice.', up: 'p', tools: [] },
    { k: 'r', name: 'Researcher', color: '#34d399', role: 'Finds trends and facts for posts using the web.', up: 'p', tools: ['web_search', 'read_url', 'wikipedia'] }] },
];
function importBots(list) {
  loadBots(); const map = {}, stamp = Date.now().toString(36);
  list.forEach((b, i) => { map[b.k || b.id] = 'b' + stamp + i; });
  list.forEach((b, i) => bots.push({ id: map[b.k || b.id], name: b.name, color: b.color, role: b.role, reportsTo: map[b.up ?? b.reportsTo] || '', tools: b.tools || [], link: '', knowledge: b.knowledge || '' }));
  bots = bots.slice(0, 20); saveBots(); selBot = map[list[0].k || list[0].id]; renderStrip(); fillForm(); rebuildStudioBot(); renderSheet(); renderBotMsgs();
}
(function () {
  const tabs = $('#botsTabs'); if (!tabs) return;
  [['flows', 'Workflows'], ['tpl', 'Templates']].forEach(([k, label]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.bt = k; b.textContent = label; tabs.insertBefore(b, $('#botExport')); });
  $$('#botsTabs button[data-bt]').forEach(b => b.addEventListener('click', () => {
    $$('#botsTabs button[data-bt]').forEach(x => x.classList.toggle('on', x === b));
    $('#botsFlows').hidden = b.dataset.bt !== 'flows'; $('#botsTpl').hidden = b.dataset.bt !== 'tpl';
    if (b.dataset.bt === 'flows') { loadBots(); if (!$('#flSteps').children.length) addStepRow(); renderFlows(); }
  }));
  const list = $('#tplList');
  TEMPLATES.forEach(t => {
    const row = document.createElement('div'); row.className = 'flow-item'; row.innerHTML = `<span><b>${esc(t.name)}</b><small>${esc(t.desc)} (${t.bots.length} bots)</small></span>`;
    const add = document.createElement('button'); add.className = 'pill-button go'; add.type = 'button'; add.textContent = 'Add team'; add.onclick = () => { importBots(t.bots); toast(t.name + ' added.'); $$('#botsTabs button')[0].click(); }; row.append(add); list.append(row);
  });
  $('#tplShare')?.addEventListener('click', async () => {
    loadBots(); const slim = bots.map(b => ({ id: b.id, name: b.name, color: b.color, role: b.role, reportsTo: b.reportsTo, tools: b.tools }));
    const link = location.origin + '/#team=' + btoa(unescape(encodeURIComponent(JSON.stringify(slim))));
    try { await navigator.clipboard.writeText(link); toast('Team link copied.'); } catch { prompt('Copy this link:', link); }
  });
  if (location.hash.startsWith('#team=')) {
    try { const l = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(6))))); if (Array.isArray(l) && l.length && confirm(`Add the shared team (${l.length} bots)?`)) importBots(l.slice(0, 12).map(b => ({ id: b.id, name: String(b.name || 'Bot').slice(0, 24), color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#4f9dff', role: String(b.role || '').slice(0, 500), reportsTo: b.reportsTo, tools: Array.isArray(b.tools) ? b.tools.filter(t => BOT_TOOLS.includes(t)) : [] }))); } catch { /* ignore */ }
    history.replaceState(null, '', location.pathname);
  }
})();
// bubbles from normal bot chat
$('#botChatForm')?.addEventListener('submit', () => { const id = selBot; setTimeout(function wait() { const last = ((botChats[id] || []).slice(-1)[0]) || {}; if (last.role === 'assistant' && !last._said) { last._said = true; nodeSay(id, last.content); } else if (!last._said) setTimeout(wait, 1500); }, 1500); });

/* ---- study ---- */
let stPdf = '';
$('#stFile')?.addEventListener('change', async ev => {
  const f = ev.target.files[0]; if (!f) return; stPdf = '';
  if (/\.pdf$/i.test(f.name)) { const buf = new Uint8Array(await f.arrayBuffer()); let s = ''; buf.forEach(b => { s += String.fromCharCode(b); }); stPdf = btoa(s); $('#stText').value = `[PDF: ${f.name}]`; }
  else $('#stText').value = (await f.text()).slice(0, 8000);
});
$$('[data-st]').forEach(b => b.addEventListener('click', async () => {
  const out = $('#stOut'), mode = b.dataset.st, text = $('#stText').value.trim();
  if (!(settings.ai || {}).key) { out.textContent = 'Add an AI key in Settings → AI & API first.'; return; }
  if (!text && !stPdf) { out.textContent = 'Paste some text or add a file first.'; return; }
  out.textContent = 'Working…';
  try {
    const d = (await postJSON('/api/study', { ai: aiPayload(), mode, text: stPdf ? '' : text, pdf: stPdf && /^\[PDF/.test(text) ? stPdf : '' })).data; out.innerHTML = '';
    if (mode === 'summary') { const p = document.createElement('div'); p.className = 'tr-pair'; p.style.whiteSpace = 'pre-wrap'; p.textContent = d.summary || ''; out.append(p); }
    if (mode === 'flashcards') {
      const cards = (d.cards || []).filter(c => c.q && c.a); let i = 0, back = false; const card = document.createElement('div'); card.className = 'fcard'; const nav = document.createElement('div'); nav.className = 'bf-actions'; nav.style.marginTop = '10px';
      const show = () => { card.classList.toggle('back', back); card.textContent = back ? cards[i].a : cards[i].q; info.textContent = `${i + 1} / ${cards.length} · tap card to flip`; };
      const info = document.createElement('small'); const mk = (l, f) => { const x = document.createElement('button'); x.className = 'pill-button'; x.type = 'button'; x.textContent = l; x.onclick = f; return x; };
      card.onclick = () => { back = !back; show(); }; nav.append(mk('◀', () => { i = (i + cards.length - 1) % cards.length; back = false; show(); }), mk('▶', () => { i = (i + 1) % cards.length; back = false; show(); }), info);
      if (!cards.length) { out.textContent = 'No cards made. Try more text.'; return; } out.append(card, nav); show();
    }
    if (mode === 'quiz') {
      let score = 0, done = 0; const qs = (d.questions || []).filter(q => q.q && Array.isArray(q.options)); const tot = document.createElement('div'); tot.className = 'tr-pair'; tot.textContent = 'Score: 0';
      qs.forEach(q => { const box = document.createElement('div'); box.className = 'qq'; box.innerHTML = `<b>${esc(q.q)}</b>`; q.options.forEach((o, oi) => { const ob = document.createElement('button'); ob.type = 'button'; ob.textContent = o; ob.onclick = () => { if (box.dataset.done) return; box.dataset.done = 1; done++; const ok = oi === Number(q.answer); if (ok) score++; ob.classList.add(ok ? 'ok' : 'no'); if (!ok) box.querySelectorAll('button')[Number(q.answer)]?.classList.add('ok'); if (q.why) { const w = document.createElement('small'); w.textContent = q.why; box.append(w); } tot.textContent = `Score: ${score} / ${done} of ${qs.length}`; }; box.append(ob); }); out.append(box); });
      out.append(tot); if (!qs.length) out.textContent = 'No questions made. Try more text.';
    }
  } catch (e) { out.textContent = e.message; }
}));

/* ---- live translate ---- */
const TR_LANG = { en: 'en-IN', hi: 'hi-IN', ur: 'ur-PK' }, TR_VOICE = { en: 'en-IN-PrabhatNeural', hi: 'hi-IN-MadhurNeural', ur: 'ur-PK-AsadNeural' };
let trRec = null, trLive = false;
function trStop() { trLive = false; try { trRec?.abort(); } catch { /* ignore */ } trRec = null; const m = $('#trMic'); if (m) { m.classList.remove('live'); m.innerHTML = axIcon('mic', 20) + ' Tap to speak'; } }
function trListen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { toast('Voice input is not supported in this browser.'); return; }
  const from = $('#trFrom').value, to = $('#trTo').value; const rec = new SR(); trRec = rec; trLive = true; rec.lang = TR_LANG[from]; rec.interimResults = false; rec.continuous = false;
  const m = $('#trMic'); m.classList.add('live'); m.textContent = '● Listening… tap to stop';
  rec.onresult = async ev => {
    const text = ev.results[0][0].transcript; trStop();
    try {
      const d = await postJSON('/api/translate', { text, from, to, ai: aiPayload() }); const row = document.createElement('div'); row.className = 'tr-pair'; row.innerHTML = `<small>${esc(text)}</small><b>${esc(d.text)}</b>`; $('#trLog').prepend(row);
      await speakVoice(d.text, TR_VOICE[to] || settings.voiceName);
      if ($('#trConv').checked) { const a = $('#trFrom'), b = $('#trTo'), t = a.value; a.value = b.value; b.value = t; trListen(); }
    } catch (e) { toast(e.message); }
  };
  rec.onerror = ev => { if (ev.error === 'not-allowed') toast('Allow the microphone.'); trStop(); }; rec.onend = () => { if (trLive && trRec === rec) trStop(); };
  try { rec.start(); } catch { trStop(); }
}
$('#trMic')?.addEventListener('click', () => (trLive ? trStop() : trListen()));
$('#trSwap')?.addEventListener('click', () => { const a = $('#trFrom'), b = $('#trTo'), t = a.value; a.value = b.value; b.value = t; });

/* ---- browser AI handoff: no provider API key is sent or needed ---- */
const EXTERNAL_AI = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  claude: { name: 'Claude', url: 'https://claude.ai/new' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/app' }
};
async function buildAXOContext() {
  let notes = [];
  try {
    const response = await fetch('/api/notes', { cache: 'no-store' });
    if (response.ok) { const data = await response.json(); notes = (data.notes || []).slice(-12).map(x => String(x.text || '').slice(0, 500)); }
  } catch { /* context sharing still works with browser-local material */ }
  const rows = (activeConversation?.messages || []).slice(-12).map(m => ({
    role: m.role === 'assistant' ? 'AXO' : 'User',
    text: String(m.content || '').slice(0, 1800)
  })).filter(m => m.text);
  const memories = (settings.memory || []).slice(-12).map(x => String(x).slice(0, 240));
  return [
    'AXO CONTEXT — shared by the user from their own AXO browser session.',
    'Use this as context only. It is not permission to access AXO, other accounts, or private data.',
    'Never assume you can read live AXO data. Ask the user to share more when needed.',
    memories.length ? '\nUSER-APPROVED AXO MEMORIES\n' + memories.map(x => '- ' + x).join('\n') : '',
    notes.length ? '\nSAVED AXO NOTES\n' + notes.map(x => '- ' + x).join('\n') : '',
    rows.length ? '\nRECENT CONVERSATION\n' + rows.map(x => `${x.role}: ${x.text}`).join('\n\n') : '',
    '\nPlease help with the current task using this context and clearly identify any assumptions.'
  ].filter(Boolean).join('\n').slice(0, 14000);
}
function legacyCopy(text) {
  const field = document.createElement('textarea'); field.value = text; field.setAttribute('readonly', '');
  field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field); field.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; } field.remove(); return ok;
}
document.querySelectorAll('[data-ai-handoff]').forEach(button => button.addEventListener('click', async () => {
  const target = EXTERNAL_AI[button.dataset.aiHandoff]; if (!target) return;
  let popup = null; try { popup = window.open('about:blank', '_blank'); if (popup) popup.opener = null; } catch { popup = null; }
  const context = await buildAXOContext();
  let copied = false;
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(context); copied = true; } } catch { copied = false; }
  if (!copied) copied = legacyCopy(context);
  if (popup && !popup.closed) { try { popup.location.replace(target.url); } catch { popup = null; } }
  if (!popup) { try { window.open(target.url, '_blank', 'noopener,noreferrer'); } catch { /* browser blocked it */ } }
  toast(copied ? `AXO context copied. Paste it into ${target.name}.` : `Opening ${target.name}. Clipboard access was blocked; export or copy context manually.`);
}));

/* ---- built-in plugin gallery ---- */
const BUILTIN_PLUGINS = [
  { name: 'Open Library', category: 'Books & research', icon: 'book', description: 'Search book titles, authors and editions.', url: 'https://openlibrary.org/search.json?q={query}', params: 'query' },
  { name: 'Dictionary Lookup', category: 'Language', icon: 'book', description: 'Definitions, phonetics and word examples.', url: 'https://api.dictionaryapi.dev/api/v2/entries/en/{word}', params: 'word' },
  { name: 'Word Explorer', category: 'Language', icon: 'search', description: 'Find related words and vocabulary connections.', url: 'https://api.datamuse.com/words?ml={word}', params: 'word' },
  { name: 'GitHub Repositories', category: 'Developer tools', icon: 'github', description: 'Find public code repositories and project details.', url: 'https://api.github.com/search/repositories?q={query}', params: 'query' },
  { name: 'TV & Shows', category: 'Entertainment', icon: 'image', description: 'Search TV programmes and show metadata.', url: 'https://api.tvmaze.com/search/shows?q={query}', params: 'query' },
  { name: 'Anime Explorer', category: 'Entertainment', icon: 'star', description: 'Search anime titles and public catalogue details.', url: 'https://api.jikan.moe/v4/anime?q={query}', params: 'query' },
  { name: 'Country Facts', category: 'Public data', icon: 'globe', description: 'Look up country names and public country records.', url: 'https://restcountries.com/v3.1/name/{country}', params: 'country' },
  { name: 'Species Finder', category: 'Science & nature', icon: 'image', description: 'Search public taxonomy records from iNaturalist.', url: 'https://api.inaturalist.org/v1/taxa/autocomplete?q={query}', params: 'query' },
  { name: 'Spaceflight News', category: 'Science & news', icon: 'globe', description: 'Search public spaceflight articles and reports.', url: 'https://api.spaceflightnewsapi.net/v4/articles/?search={query}', params: 'query' }
];
async function runBuiltinPlugin(name, query) {
  const value = String(query || '').trim();
  if (!value) { toast('Enter a search term first.'); return; }
  try {
    toast(`Searching ${name}…`);
    const result = await postJSON('/api/plugin-run', { name, query: value });
    let output = String(result.output || 'No result text returned.');
    try { output = JSON.stringify(JSON.parse(output), null, 2); } catch { /* keep plain text */ }
    closeSettings(); showPanel('chat');
    mirrorChat(`Run ${name}: ${value}`, `**${name} results**\n\nSource: ${result.source}\n\n${output.slice(0, 2600)}`);
  } catch (error) { toast(error.message || `${name} failed.`); }
}

function renderPlugins() {
  const gallery = $('#builtInPluginGrid');
  const saved = settings.plugins || [];
  if (gallery) {
    gallery.innerHTML = '';
    BUILTIN_PLUGINS.forEach(plugin => {
      const isAdded = saved.some(x => String(x.name || '').toLowerCase() === plugin.name.toLowerCase());
      const card = document.createElement('article'); card.className = 'plugin-card';
      const logo = document.createElement('div'); logo.className = 'plugin-logo'; logo.innerHTML = axIcon(plugin.icon, 25);
      const meta = document.createElement('div'); meta.className = 'plugin-meta';
      meta.innerHTML = `<span>${esc(plugin.category)} · PUBLIC API</span><strong>${esc(plugin.name)}</strong><p>${esc(plugin.description)}</p><small>No separate plugin key · public endpoint</small>`;
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pill-button' + (isAdded ? ' added' : ' go'); btn.textContent = isAdded ? 'Remove plugin' : 'Add plugin';
      btn.addEventListener('click', () => {
        settings.plugins = settings.plugins || [];
        const index = settings.plugins.findIndex(x => String(x.name || '').toLowerCase() === plugin.name.toLowerCase());
        if (index >= 0) settings.plugins.splice(index, 1);
        else if (settings.plugins.length >= 16) { toast('You can add up to 16 plugins.'); return; }
        else settings.plugins.push({ ...plugin, method: 'GET', header: '', builtin: true });
        saveSettings(); renderPlugins();
        toast(index >= 0 ? `${plugin.name} removed.` : `${plugin.name} added.`);
      });
      card.append(logo, meta);
      if (isAdded) {
        const controls = document.createElement('div'); controls.className = 'plugin-run-controls';
        const input = document.createElement('input'); input.type = 'search'; input.maxLength = 120; input.placeholder = plugin.params === 'word' ? 'Enter a word' : plugin.params === 'country' ? 'Enter a country' : 'Enter a search'; input.setAttribute('aria-label', `Search ${plugin.name}`);
        const run = document.createElement('button'); run.type = 'button'; run.className = 'pill-button go'; run.textContent = 'Run';
        run.addEventListener('click', () => runBuiltinPlugin(plugin.name, input.value));
        input.addEventListener('keydown', event => { if (event.key === 'Enter') run.click(); });
        controls.append(input, run); card.append(controls);
      }
      card.append(btn); gallery.append(card);
    });
  }
  const box = $('#plList'); if (!box) return; box.innerHTML = '';
  saved.forEach((plugin, i) => {
    const row = document.createElement('div'); row.className = 'setting-row plugin-saved-row';
    const summary = document.createElement('span'); summary.innerHTML = `<strong>${esc(plugin.name)}</strong><small>${esc(plugin.description)} · ${esc(plugin.category || 'Custom API')}</small>`;
    const remove = document.createElement('button'); remove.className = 'pill-button'; remove.type = 'button'; remove.textContent = 'Remove';
    remove.addEventListener('click', () => { settings.plugins.splice(i, 1); saveSettings(); renderPlugins(); });
    row.append(summary, remove); box.append(row);
  });
}
$('#plForm')?.addEventListener('submit', ev => {
  ev.preventDefault(); const url = $('#plUrl').value.trim();
  if (!/^https:\/\//i.test(url)) { toast('Plugin URL must start with https://'); return; }
  settings.plugins = settings.plugins || []; if (settings.plugins.length >= 16) { toast('Up to 16 plugins.'); return; }
  settings.plugins.push({ name: $('#plName').value.trim(), description: $('#plDesc').value.trim(), url, method: $('#plMethod').value, params: $('#plParams').value.trim(), header: $('#plHeader').value.trim(), category: 'Custom API', icon: 'globe' });
  saveSettings(); ev.target.reset(); renderPlugins(); toast('Plugin added.');
});

/* Settings cross-links and local SVG illustrations. */
document.querySelectorAll('[data-sec-jump]').forEach(button => button.addEventListener('click', () => showSettingsSection(button.dataset.secJump)));
document.querySelectorAll('[data-panel-jump]').forEach(button => button.addEventListener('click', () => { closeSettings(); showPanel(button.dataset.panelJump); }));
document.querySelectorAll('.privacy-symbol[data-icon]').forEach(node => { node.innerHTML = axIcon(node.dataset.icon || 'shield', 24); });

/* ---- cloud sync (your own Firebase project) ---- */
let fbReady = null;
function loadFirebaseSdk() {
  if (window.firebase && firebase.apps) return Promise.resolve();
  return fbReady || (fbReady = new Promise((res, rej) => {
    const urls = ['app', 'auth', 'firestore'].map(n => `https://www.gstatic.com/firebasejs/10.12.2/firebase-${n}-compat.js`); let i = 0;
    const next = () => { if (i >= urls.length) return res(); const s = document.createElement('script'); s.src = urls[i++]; s.onload = next; s.onerror = () => { fbReady = null; rej(new Error('Could not load Firebase. Check your internet.')); }; document.head.append(s); }; next();
  }));
}
async function fbInit() {
  let cfg; try { cfg = JSON.parse(settings.fbWeb || ''); } catch { throw new Error('Paste your Firebase web config as JSON first.'); }
  await loadFirebaseSdk(); if (!firebase.apps.length) firebase.initializeApp(cfg); return firebase;
}
function bundle() {
  const s = JSON.parse(JSON.stringify(settings)); SECRETS.forEach(([g, k]) => { if (s[g]) s[g][k] = ''; }); delete s.fbWeb;
  return { axo: 1, settings: s, bots: JSON.parse(localStorage.getItem(BOT_KEY) || 'null') };
}
const cloudMsg = t => { const m = $('#cloudMsg'); if (m) m.textContent = t; };
$('#cloudIn')?.addEventListener('click', async () => { try { const fb = await fbInit(); const r = await fb.auth().signInWithPopup(new fb.auth.GoogleAuthProvider()); $('#cloudWho').textContent = r.user.email || 'Signed in'; cloudMsg('Signed in.'); } catch (e) { cloudMsg(e.message); } });
$('#cloudOut')?.addEventListener('click', async () => { try { const fb = await fbInit(); await fb.auth().signOut(); $('#cloudWho').textContent = 'Not signed in'; cloudMsg('Signed out.'); } catch (e) { cloudMsg(e.message); } });
$('#cloudPush')?.addEventListener('click', async () => {
  try { const fb = await fbInit(), u = fb.auth().currentUser; if (!u) throw new Error('Sign in first.'); await fb.firestore().collection('axoSync').doc(u.uid).set({ json: JSON.stringify(bundle()), updated: Date.now() }); cloudMsg('Uploaded (keys left out).'); } catch (e) { cloudMsg(e.message); }
});
$('#cloudPull')?.addEventListener('click', async () => {
  try {
    const fb = await fbInit(), u = fb.auth().currentUser; if (!u) throw new Error('Sign in first.');
    const snap = await fb.firestore().collection('axoSync').doc(u.uid).get(); if (!snap.exists) throw new Error('Nothing uploaded yet.');
    const b = JSON.parse(snap.data().json); if (b.axo !== 1) throw new Error('Unreadable data.');
    const keep = SECRETS.map(([g, k]) => [g, k, (settings[g] || {})[k] || '']), web = settings.fbWeb;
    settings = { ...settings, ...b.settings, fbWeb: web }; keep.forEach(([g, k, v]) => { settings[g] = { ...(settings[g] || {}), [k]: v || (settings[g] || {})[k] || '' }; });
    saveSettings(); if (Array.isArray(b.bots) && b.bots.length) localStorage.setItem(BOT_KEY, JSON.stringify(b.bots)); applySettings(); cloudMsg('Downloaded. Re-enter API keys on this device.');
  } catch (e) { cloudMsg(e.message); }
});

/* ---- sidebar tools + welcome chips ---- */
(function () {
  const apps = document.querySelector('.side-tool[data-panel="apps"]'); if (!apps) return;
  [['study', 'book', 'Study'], ['translate', 'globe', 'Translate']].forEach(([panel, ico, label]) => {
    const b = document.createElement('button'); b.className = 'side-tool'; b.type = 'button'; b.dataset.panel = panel; b.innerHTML = `${axIcon(ico, 18)}<span>${label}</span>`;
    b.addEventListener('click', () => showPanel(panel)); apps.after(b);
  });
})();
const _rcs = renderConnectStrip;
renderConnectStrip = function () {
  _rcs(); const strip = $('#connectStrip'); if (!strip) return;
  const add = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.append(iconLabel(label)); b.onclick = fn; strip.append(b); };
  add('mic|Voice note', startVoiceNote);
  if ((settings.firebase || {}).service_account) add('chart|Orders dashboard', () => sendMessage('orders dashboard'));
  add('wallet|Expenses', () => sendMessage('expenses this week'));
};
renderWelcome();
