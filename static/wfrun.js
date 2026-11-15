/* Shared workflow helpers: real step runner, saved list, schedule. Used by /workflow and the main app. */
window.AXOWF = {
  prefs() { try { return JSON.parse(localStorage.getItem('axo_preferences_v1') || '{}'); } catch { return {}; } },
  integ() { const s = this.prefs(); return { gmail: s.gmail || {}, telegram: s.telegram || {}, sheets: s.sheets || {} }; },
  ai() { const a = this.prefs().ai || {}; return { provider: a.provider, url: a.url, key: a.key }; },
  list() { try { return JSON.parse(localStorage.getItem('axo_wf_saved') || '[]'); } catch { return []; } },
  store(arr) { try { localStorage.setItem('axo_wf_saved', JSON.stringify(arr.slice(0, 40))); } catch { } },
  save(wf) {
    const clean = JSON.parse(JSON.stringify(wf)); clean.id = clean.id || 'wf' + Date.now().toString(36); clean.ts = Date.now();
    const a = this.list().filter(x => x.id !== clean.id); a.unshift(clean); this.store(a); wf.id = clean.id; return clean;
  },
  remove(id) { this.store(this.list().filter(x => x.id !== id)); },
  async step(node, ctx) {
    try {
      const r = await fetch('/api/workflow/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ node: { kind: node.kind, cfg: node.cfg, title: node.title }, ctx, integrations: this.integ(), ai: this.ai() }) });
      return await r.json();
    } catch (e) { return { ok: false, error: 'Server not reachable.' }; }
  },
  /** Runs the graph for real. hooks: start(node), done(node, res). Returns true if every step succeeded. */
  async run(wf, hooks = {}) {
    const by = Object.fromEntries(wf.nodes.map(n => [n.id, n])); let cur = wf.nodes[0], ctx = '', ok = true; const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id); hooks.start && hooks.start(cur);
      const res = await this.step(cur, ctx);
      (cur.history = cur.history || []).unshift({ t: Date.now(), ok: !!res.ok, msg: res.ok ? res.output : res.error }); cur.history = cur.history.slice(0, 8);
      hooks.done && hooks.done(cur, res);
      if (!res.ok) { ok = false; break; }
      ctx = String(res.output || ctx).slice(0, 3000);
      cur = by[(cur.next || [])[res.branch] || (cur.next || [])[0]];
    }
    return ok;
  },
  /** Runs saved workflows whose daily time has arrived (called from any open AXO page). */
  async tick() {
    const now = new Date(), hm = now.toTimeString().slice(0, 5), day = now.toDateString(); let changed = false; const all = this.list();
    for (const wf of all) {
      const s = wf.schedule; if (!s || !s.on || s.time !== hm || s.last === day) continue;
      if (localStorage.getItem('axo_wf_lock') === wf.id + day) continue; localStorage.setItem('axo_wf_lock', wf.id + day);
      s.last = day; changed = true; this.store(all); await this.run(wf); this.store(all);
      try { new Notification('AXO workflow ran', { body: wf.title }); } catch { }
    }
    return changed;
  },
};
