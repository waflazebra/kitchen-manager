// Kitchen Manager prototype — plain JS, no build step. Data lives in this browser (localStorage).

const STORE_KEY = 'kitchen-manager-v1';
const MAIN_TYPES = ['ENTREES', 'SOUPS', 'BREAD/ROLLS/STARCH'];
const LOCATIONS = ['Dry', 'Cooler', 'Freezer'];

let state;
const ui = { tab: 'week', date: null, invFilter: 'All', invSearch: '', recipeEdit: null, reportFrom: null, reportTo: null, orderFrom: null, orderEdits: {}, menuStatus: {}, invAction: null };

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
const monday = s => { const d = parseIso(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const weekdays = mon => [0, 1, 2, 3, 4].map(i => addDays(mon, i));
const isWeekend = s => [0, 6].includes(parseIso(s).getDay());
const nextSchoolDay = s => { while (isWeekend(s)) s = addDays(s, 1); return s; };
const schoolDaysFrom = (s, n) => { const out = []; s = nextSchoolDay(s); while (out.length < n) { if (!isWeekend(s)) out.push(s); s = addDays(s, 1); } return out; };
const mvDate = s => { const [y, m, d] = s.split('-'); return `${m}-${d}-${y}`; };
const fmtDay = (s, o = { weekday: 'short', month: 'short', day: 'numeric' }) => parseIso(s).toLocaleDateString('en-US', o);
const todayIso = () => iso(new Date());

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').trim().toLowerCase();
const sum = a => a.reduce((x, y) => x + y, 0);
const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
const uid = () => Math.random().toString(36).slice(2, 10);
const S = () => state.schools[state.current];
const invById = id => S().inventory.find(i => i.id === id);

function fmtQty(item, q) {
  if (!item) return round(q);
  const neg = q < 0; q = Math.abs(q);
  let txt;
  if (item.packSize && q >= item.packSize) {
    const packs = Math.floor(q / item.packSize), rem = round(q - packs * item.packSize, 1);
    txt = `${packs} ${item.packName}${packs > 1 ? 's' : ''}` + (rem ? ` + ${rem} ${item.unit}` : '');
  } else txt = `${round(q, 1)} ${item.unit}`;
  return (neg ? '−' : '') + txt;
}

/* ---------- storage ---------- */
function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (e) { /* fall through */ }
  return makeSeed();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save in this browser. Use Settings → Download backup.'); }
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

/* ---------- menu (MealViewer) ---------- */
function parseMealViewer(j) {
  const out = {};
  for (const day of j.menuSchedules || []) {
    const d = day.dateInformation.dateFull.slice(0, 10);
    const m = { breakfast: [], lunch: [] };
    for (const b of day.menuBlocks || []) {
      const k = /breakfast/i.test(b.blockName) ? 'breakfast' : /lunch/i.test(b.blockName) ? 'lunch' : null;
      if (!k) continue;
      for (const line of b.cafeteriaLineList?.data || [])
        for (const f of line.foodItemList?.data || [])
          m[k].push({ name: f.item_Name.trim(), type: f.item_Type, portion: f.portionUnit || '', allergens: (f.allergens || []).map(a => a.name) });
    }
    if (m.breakfast.length || m.lunch.length) out[d] = m;
  }
  return out;
}
const menuSig = m => JSON.stringify([m.breakfast.map(i => i.name), m.lunch.map(i => i.name)]);

async function loadWeek(mon, force = false) {
  const s = S();
  if (!force && (s.menusFetched[mon] || ui.menuStatus[mon] === 'offline')) return;
  if (ui.menuStatus[mon] === 'loading') return;
  ui.menuStatus[mon] = 'loading';
  try {
    const url = `https://api.mealviewer.com/api/v4/school/${encodeURIComponent(s.mvSlug)}/${mvDate(mon)}/${mvDate(addDays(mon, 4))}/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('MealViewer answered ' + res.status);
    const parsed = parseMealViewer(await res.json());
    const changed = [];
    for (const [d, m] of Object.entries(parsed)) {
      if (d < mon || d > addDays(mon, 4)) continue;
      const old = s.menus[d];
      if (old && menuSig(old) !== menuSig(m)) { m.changedAt = Date.now(); changed.push(d); }
      else if (old?.changedAt) m.changedAt = old.changedAt;
      s.menus[d] = m;
    }
    s.menusFetched[mon] = Date.now();
    ui.menuStatus[mon] = 'ok';
    if (changed.length) toast(`Menu changed on ${changed.map(d => fmtDay(d)).join(', ')}`);
  } catch (e) {
    ui.menuStatus[mon] = 'offline';
    if (typeof MENU_SNAPSHOT !== 'undefined')
      for (const [d, m] of Object.entries(MENU_SNAPSHOT)) if (d >= mon && d <= addDays(mon, 4) && !s.menus[d]) s.menus[d] = m;
  }
  save(); render();
}
function ensureMenus(dates) { for (const mon of new Set(dates.map(monday))) loadWeek(mon); }

/* ---------- counts, extras, plan ---------- */
const isMainItem = i => MAIN_TYPES.includes(i.type);

function options(date) {
  const s = S(), m = s.menus[date];
  const mains = (m?.lunch || []).filter(i => i.type === 'ENTREES').map(i => i.name);
  return [{ key: 'main', label: 'Main lunch', dish: mains.join(' + ') || 'Main lunch' },
    ...s.alternates.map(a => ({ key: 'alt:' + a, label: a, dish: a }))];
}
function dayCounts(date) {
  const s = S();
  return s.counts[date] || (s.counts[date] = { classes: {}, staff: {}, breakfast: null });
}
function hasCounts(date) { const c = S().counts[date]; return !!c && (Object.keys(c.classes).length > 0 || c.breakfast != null); }
function sheetsIn(date) { const c = S().counts[date]; return c ? S().classes.filter(cl => c.classes[cl.id] && Object.keys(c.classes[cl.id]).length).length : 0; }
function totals(date) {
  const c = S().counts[date], t = {};
  if (!c) return t;
  for (const row of [...Object.values(c.classes), c.staff]) for (const [k, v] of Object.entries(row || {})) t[k] = (t[k] || 0) + (+v || 0);
  return t;
}

function suggestExtra(dish, total) {
  const s = S();
  const h = s.history.filter(x => x.dish === dish && x.ordered > 0).slice(-8);
  let pct = s.settings.extraPct / 100, basis = `No history yet — default ${s.settings.extraPct}%`;
  if (h.length) {
    const ratios = h.map(x => Math.max(0, (x.made - x.leftover + x.short - x.ordered) / x.ordered));
    const avg = sum(ratios) / ratios.length;
    pct = avg + 0.02;
    const shorts = h.filter(x => x.short > 0).length;
    basis = `Last ${h.length} time${h.length > 1 ? 's' : ''}: ${Math.round(avg * 100)}% more than ordered got eaten` + (shorts ? `, ran short ${shorts}×` : '');
  }
  if (!total) return { n: 0, basis };
  return { n: Math.max(s.settings.extraMin, Math.ceil(total * pct)), basis };
}

function milkShare(name, n, list) {
  const milks = list.filter(i => i.type === 'MILK');
  if (milks.length < 2) return n;
  const choc = /choc/i.test(name), share = S().settings.chocShare / 100;
  const plain = milks.filter(i => !/choc/i.test(i.name)).length || 1, chocN = milks.length - plain || 1;
  return Math.ceil(choc ? n * share / chocN : n * (1 - share) / plain);
}

function plan(date, { forecast = false } = {}) {
  const s = S(), m = s.menus[date], opts = options(date);
  let tot = totals(date), source = 'counts';
  let bCount = s.counts[date]?.breakfast;
  if (forecast && !hasCounts(date)) { tot = { ...s.settings.estimate }; bCount = s.settings.estimate.breakfast; source = 'estimate'; }
  const ov = s.extrasOverride[date] || {};
  const rows = opts.map(o => {
    const total = tot[o.key] || 0, sg = suggestExtra(o.dish, total);
    const extra = ov[o.key] ?? sg.n;
    return { ...o, total, suggest: sg.n, basis: sg.basis, extra, make: total + extra, overridden: ov[o.key] != null };
  });
  const lunchMake = sum(rows.map(r => r.make)), mainMake = rows[0].make;
  const bMake = bCount ? bCount + Math.ceil(bCount * s.settings.breakfastExtraPct / 100) : 0;
  const items = [];
  if (m) {
    for (const i of m.breakfast) items.push({ meal: 'Breakfast', name: i.name, type: i.type, portion: i.portion, servings: i.type === 'MILK' ? milkShare(i.name, bMake, m.breakfast) : bMake });
    for (const i of m.lunch) {
      const n = isMainItem(i) ? mainMake : i.type === 'MILK' ? milkShare(i.name, lunchMake, m.lunch) : lunchMake;
      items.push({ meal: 'Lunch', name: i.name, type: i.type, portion: i.portion, servings: n });
    }
  }
  for (const r of rows.slice(1)) if (r.make) items.push({ meal: 'Alternate', name: r.dish, type: 'ALTERNATE', portion: '', servings: r.make });
  const need = {}, missing = [];
  for (const it of items) {
    if (!it.servings) continue;
    const rec = s.recipes[norm(it.name)];
    if (!rec) { missing.push(it.name); continue; }
    for (const g of rec.ingredients) need[g.inv] = (need[g.inv] || 0) + g.qty * it.servings;
  }
  return { date, rows, items, need, missing: [...new Set(missing)], source, lunchTotal: sum(rows.map(r => r.total)), lunchMake, bCount: bCount || 0, bMake, hasMenu: !!m };
}

/* ---------- inventory actions ---------- */
function logTx(invId, type, qty, note = '', date = todayIso(), ref) {
  const it = invById(invId); if (!it) return;
  it.onHand = round(it.onHand + qty, 3);
  S().log.push({ id: uid(), date, inv: invId, type, qty: round(qty, 3), note, ref });
}
function stockStatus(it) {
  if (it.onHand <= 0) return ['Out', 'bad'];
  if (it.onHand < it.par) return ['Low', 'warn'];
  return ['OK', 'ok'];
}
function markServed(date, rows) {
  const s = S(), p = plan(date);
  s.served[date] = { at: Date.now(), rows };
  for (const r of rows) if (r.ordered || r.made) s.history.push({ date, dish: r.dish, ordered: r.ordered, made: r.made, leftover: r.leftover, short: r.short, ref: date });
  for (const [inv, q] of Object.entries(p.need)) logTx(inv, 'use', -q, 'Served ' + fmtDay(date), date, 'served:' + date);
  save();
}
function undoServed(date) {
  const s = S();
  for (const tx of s.log.filter(t => t.ref === 'served:' + date)) { const it = invById(tx.inv); if (it) it.onHand = round(it.onHand - tx.qty, 3); }
  s.log = s.log.filter(t => t.ref !== 'served:' + date);
  s.history = s.history.filter(h => h.ref !== date);
  delete s.served[date];
  save();
}

/* ---------- order request ---------- */
function orderCalc() {
  const s = S(), days = schoolDaysFrom(ui.orderFrom, s.settings.orderDays);
  ensureMenus(days);
  const need = {}, missing = new Set(), noMenu = [], estDays = [];
  for (const d of days) {
    if (s.served[d]) continue;
    if (!s.menus[d]) { noMenu.push(d); continue; }
    const p = plan(d, { forecast: true });
    if (p.source === 'estimate') estDays.push(d);
    p.missing.forEach(x => missing.add(x));
    for (const [k, v] of Object.entries(p.need)) need[k] = (need[k] || 0) + v;
  }
  const lines = s.inventory.map(it => {
    const n = need[it.id] || 0, shortBy = Math.max(0, n + it.par - it.onHand);
    const packs = it.packSize ? Math.ceil(shortBy / it.packSize) : Math.ceil(shortBy);
    const qty = ui.orderEdits[it.id] ?? packs;
    return { it, need: n, shortBy, packs, qty };
  }).filter(l => l.packs > 0 || ui.orderEdits[l.it.id] > 0);
  return { days, lines, missing: [...missing], noMenu, estDays };
}
function orderText(o) {
  const s = S();
  const by = {};
  for (const l of o.lines.filter(l => l.qty > 0)) (by[l.it.loc] ||= []).push(l);
  let t = `Order request — ${s.name}\nCovers ${fmtDay(o.days[0])} to ${fmtDay(o.days.at(-1))} (${o.days.length} school days)\n`;
  for (const loc of LOCATIONS.concat(Object.keys(by).filter(l => !LOCATIONS.includes(l)))) {
    if (!by[loc]) continue;
    t += `\n${loc.toUpperCase()}\n`;
    for (const l of by[loc]) t += `- ${l.it.name}: ${l.qty} ${l.it.packSize ? l.it.packName + (l.qty > 1 ? 's' : '') + ` (${l.it.packSize} ${l.it.unit})` : l.it.unit}\n`;
  }
  return t;
}

/* ---------- rendering ---------- */
const TABS = [['week', 'This week'], ['counts', 'Counts'], ['plan', 'Production'], ['inventory', 'Inventory'], ['order', 'Order request'], ['recipes', 'Recipes'], ['tips', 'Tips'], ['settings', 'Settings']];

function render() {
  const s = S();
  document.getElementById('school-name').textContent = s.name;
  document.getElementById('example-flag').hidden = !s.example;
  document.getElementById('lock-btn').hidden = !state.pin;
  document.getElementById('nav').innerHTML = TABS.map(([k, l]) => `<button class="tab${ui.tab === k ? ' on' : ''}" data-act="tab" data-tab="${k}">${l}${k === 'inventory' && lowCount() ? ` <span class="badge">${lowCount()}</span>` : ''}</button>`).join('');
  const view = document.getElementById('view');
  const fns = { week: viewWeek, counts: viewCounts, plan: viewPlan, inventory: viewInventory, order: viewOrder, recipes: viewRecipes, tips: viewTips, settings: viewSettings };
  view.innerHTML = fns[ui.tab]();
  try { localStorage.setItem(STORE_KEY + ':ui', JSON.stringify({ tab: ui.tab, date: ui.date })); } catch (e) { }
}
const lowCount = () => S().inventory.filter(i => i.onHand < i.par).length;

function dayChips(active, act = 'pick-day') {
  const mon = monday(active);
  return `<div class="daynav">
    <button class="ghost" data-act="${act}" data-date="${addDays(active, -7)}" aria-label="Previous week">‹</button>
    ${weekdays(mon).map(d => `<button class="chip${d === active ? ' on' : ''}${d === todayIso() ? ' is-today' : ''}" data-act="${act}" data-date="${d}">${fmtDay(d, { weekday: 'short' })} <b>${parseIso(d).getDate()}</b></button>`).join('')}
    <button class="ghost" data-act="${act}" data-date="${addDays(active, 7)}" aria-label="Next week">›</button>
    ${todayButton()}
  </div>`;
}
function todayButton() {
  const t = nextSchoolDay(todayIso());
  return ui.date === t ? '' : `<button class="btn ghost today-btn" data-act="go-today">Today</button>`;
}
function menuNote(date) {
  const st = ui.menuStatus[monday(date)];
  if (st === 'loading') return `<span class="muted">Loading menu from MealViewer…</span>`;
  if (st === 'offline') return `<span class="pill warn">MealViewer unreachable — using saved menu</span>`;
  return '';
}

function viewWeek() {
  const s = S(), mon = monday(ui.date), days = weekdays(mon);
  ensureMenus(days);
  const next5 = schoolDaysFrom(todayIso(), 5);
  ensureMenus(next5);
  const upcoming = next5.filter(d => s.menus[d] && !s.served[d]);
  const need = {}; const missing = new Set();
  for (const d of upcoming) { const p = plan(d, { forecast: true }); p.missing.forEach(x => missing.add(x)); for (const [k, v] of Object.entries(p.need)) need[k] = (need[k] || 0) + v; }
  const shortItems = s.inventory.filter(it => (need[it.id] || 0) > it.onHand);
  const low = s.inventory.filter(it => it.onHand < it.par && !shortItems.includes(it));

  const steps = [
    ['Menu', 'Pulled from MealViewer', 'auto'],
    ['Class sheets', 'Type in circled numbers', 'manual'],
    ['Totals + extras', 'Added up, extras suggested', 'auto'],
    ['Production + pull list', 'Scaled from recipes', 'auto'],
    ['Served', 'One click subtracts stock', 'auto'],
    ['Order request', 'Shortfalls → list for director', 'auto'],
  ];
  return `
  <section class="flow" aria-label="Daily workflow">
    ${steps.map(([t, d, k]) => `<div class="step ${k}"><span class="kind">${k === 'auto' ? 'Automatic' : 'You'}</span><strong>${t}</strong><span>${d}</span></div>`).join('<span class="arrow" aria-hidden="true">→</span>')}
  </section>

  <div class="weekhead">
    <button class="ghost" data-act="pick-day" data-date="${addDays(ui.date, -7)}" aria-label="Previous week">‹</button>
    <h2>Week of ${fmtDay(mon, { month: 'long', day: 'numeric' })}</h2>
    <button class="ghost" data-act="pick-day" data-date="${addDays(ui.date, 7)}" aria-label="Next week">›</button>
    ${todayButton()}
    ${menuNote(mon)}
  </div>
  <div class="folders">
    <div class="tabs" role="tablist" aria-label="Days of the week">${days.map(dayTab).join('')}</div>
    ${dayFolder(ui.date)}
  </div>

  <div class="two">
    <section class="panel">
      <h3>Not enough on hand for the next 5 school days</h3>
      <p class="muted small">Uses entered counts where you have them, otherwise the estimate in Settings.</p>
      ${shortItems.length ? `<table class="tbl"><thead><tr><th>Item</th><th class="n">Needed</th><th class="n">On hand</th></tr></thead><tbody>
        ${shortItems.map(it => `<tr><td>${esc(it.name)}</td><td class="n">${fmtQty(it, need[it.id])}</td><td class="n bad-t">${fmtQty(it, it.onHand)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="ok-t">Enough stock for the next 5 days.</p>'}
      ${low.length ? `<p class="small"><b>Below par:</b> ${low.map(i => esc(i.name)).join(', ')}</p>` : ''}
      <button class="btn" data-act="goto" data-tab="order">Build order request</button>
    </section>
    <section class="panel">
      <h3>Dishes without a recipe</h3>
      <p class="muted small">These aren't counted in ingredient totals yet. Add each one once and it's reused every time the dish comes back.</p>
      ${missing.size ? `<ul class="plain">${[...missing].map(n => `<li><button class="link" data-act="edit-recipe" data-name="${esc(n)}">${esc(n)}</button></li>`).join('')}</ul>` : '<p class="ok-t">Every dish this week has a recipe.</p>'}
    </section>
  </div>`;
}

function dayStatus(d) {
  const s = S(), inn = sheetsIn(d);
  if (s.served[d]) return '<span class="pill ok">Served</span>';
  if (inn === s.classes.length) return '<span class="pill ok">Counts done</span>';
  if (inn) return '<span class="pill warn">Counts partial</span>';
  return '<span class="pill">Waiting on sheets</span>';
}
const entreeOf = m => m ? m.lunch.filter(i => i.type === 'ENTREES').map(i => i.name).join(' + ') : '';
const todayTag = d => d === todayIso() ? '<span class="today-tag">Today</span>' : '';

function dayTab(d) {
  const m = S().menus[d], entree = entreeOf(m), on = d === ui.date;
  return `<div class="ftab${on ? ' on' : ''}${d === todayIso() ? ' today' : ''}" data-act="pick-day" data-date="${d}" role="tab" tabindex="0" aria-selected="${on}" aria-label="${fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' })}${entree ? ': ' + esc(entree) : ''}">
    <span class="tab-emoji" aria-hidden="true">${m ? dishEmojis(entree) : '·'}</span>
    <span class="tab-text">
      <span class="tab-day">${fmtDay(d, { weekday: 'short' })} <b>${parseIso(d).getDate()}</b>${todayTag(d)}</span>
      <span class="tab-dish">${m ? esc(entree || '—') : 'No menu yet'}</span>
    </span>
    <span class="tab-num" aria-hidden="true">${parseIso(d).getDate()}</span>
  </div>`;
}

function dayFolder(d) {
  const s = S(), m = s.menus[d], p = m ? plan(d) : null, entree = entreeOf(m), tips = m ? tipsFor(d) : [];
  const list = items => items.length ? items.map(i => `<li>${emo(i.name)} ${esc(i.name)}</li>`).join('') : '<li class="muted">—</li>';
  return `<section class="folder${d === todayIso() ? ' today' : ''}" role="tabpanel">
    <div class="f-main">
      <p class="f-date">${fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' })} ${todayTag(d)}</p>
      ${m ? `<div class="dish-emoji" aria-hidden="true">${dishEmojis(entree)}</div><p class="entree">${esc(entree || '—')}</p>${m.changedAt ? '<span class="pill warn">Menu changed</span>' : ''}` : '<p class="muted">No menu yet for this day.</p>'}
      <dl class="kv">
        <div><dt>Sheets</dt><dd>${sheetsIn(d)}/${s.classes.length}</dd></div>
        <div><dt>Lunches</dt><dd>${p && p.lunchTotal ? `${p.lunchTotal} <small>+${p.lunchMake - p.lunchTotal}</small>` : '—'}</dd></div>
        <div><dt>Breakfast</dt><dd>${p && p.bCount ? p.bCount : '—'}</dd></div>
      </dl>
      <div class="status">${dayStatus(d)}${p && p.missing.length ? `<span class="pill warn">${p.missing.length} need recipe</span>` : ''}</div>
      <div class="actions"><button class="btn" data-act="goto" data-tab="counts" data-date="${d}">Counts</button><button class="btn ghost" data-act="goto" data-tab="plan" data-date="${d}">Production</button></div>
    </div>
    ${m ? `<div><h4>Lunch</h4><ul class="menu-list">${list(m.lunch.filter(i => i.type !== 'ENTREES'))}</ul></div>
    <div><h4>Breakfast</h4><ul class="menu-list">${list(m.breakfast)}</ul></div>
    <div><h4>Tips</h4>${tips.length ? `<ul class="menu-list">${tips.map(t => `<li><button class="link" data-act="goto" data-tab="plan" data-date="${d}">${esc(t.title)}</button></li>`).join('')}</ul>` : '<p class="muted small">No tips for this menu.</p>'}</div>` : ''}
  </section>`;
}

function viewCounts() {
  const s = S(), d = ui.date, c = dayCounts(d), opts = options(d), t = totals(d);
  ensureMenus([d]);
  const cell = (cid, k, v) => `<td class="n"><input type="number" inputmode="numeric" min="0" id="cnt-${cid}-${k.replace(/\W/g, '_')}" data-cnt="${cid}|${esc(k)}" value="${v ?? ''}" aria-label="${esc(k)}"></td>`;
  return `
  <div class="row-head"><h2>Class sheets · ${fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>${menuNote(d)}</div>
  ${dayChips(d)}
  <p class="muted">Type the circled number from each column. Leave a cell empty for zero. Totals update as you type. Tab moves across a row, the same way you read a sheet.</p>
  <div class="scroll">
  <table class="tbl grid">
    <thead><tr><th>Class</th>${opts.map(o => `<th class="n">${emo(o.dish)} ${esc(o.label)}${o.key === 'main' ? `<br><small>${esc(o.dish)}</small>` : ''}</th>`).join('')}<th class="n">Row</th></tr></thead>
    <tbody>
      ${s.classes.map(cl => { const row = c.classes[cl.id] || {}; return `<tr class="${Object.keys(row).length ? 'in' : ''}"><th>Gr ${esc(cl.grade)} · ${esc(cl.teacher)}</th>${opts.map(o => cell(cl.id, o.key, row[o.key])).join('')}<td class="n" id="rowtot-${cl.id}">${sum(Object.values(row).map(Number)) || ''}</td></tr>`; }).join('')}
      <tr class="staff"><th>Teacher / staff requests</th>${opts.map(o => cell('staff', o.key, c.staff[o.key])).join('')}<td class="n" id="rowtot-staff">${sum(Object.values(c.staff).map(Number)) || ''}</td></tr>
    </tbody>
    <tfoot><tr><th>Total ordered</th>${opts.map(o => `<td class="n" id="tot-${o.key.replace(/\W/g, '_')}">${t[o.key] || 0}</td>`).join('')}<td class="n" id="tot-all">${sum(Object.values(t))}</td></tr></tfoot>
  </table>
  </div>
  <div class="two">
    <section class="panel">
      <h3>Breakfast count</h3>
      <label class="field"><span>Students eating breakfast</span><input type="number" min="0" id="breakfast-count" data-bcount value="${c.breakfast ?? ''}"></label>
      <p class="small muted" id="sheets-status">${sheetsIn(d)} of ${s.classes.length} sheets entered.</p>
      <button class="btn" data-act="goto" data-tab="plan" data-date="${d}">See production plan →</button>
    </section>
    <section class="panel future">
      <h3>Read sheets from a photo <span class="pill">Phase 2</span></h3>
      <p class="small">Take one photo per sheet (or the whole stack laid out). The system reads the grade, teacher and circled numbers, fills this table, and highlights anything it isn't sure about for you to check before saving.</p>
      <p class="small muted">Needs a small server piece (Cloudflare Worker) to call an AI vision model. Your sheet format already reads well: printed column headings and circled totals.</p>
    </section>
  </div>`;
}

function updateCountTotals() {
  const d = ui.date, c = dayCounts(d), t = totals(d);
  for (const o of options(d)) { const el = document.getElementById('tot-' + o.key.replace(/\W/g, '_')); if (el) el.textContent = t[o.key] || 0; }
  document.getElementById('tot-all').textContent = sum(Object.values(t));
  for (const [cid, row] of [...Object.entries(c.classes), ['staff', c.staff]]) {
    const el = document.getElementById('rowtot-' + cid); if (el) el.textContent = sum(Object.values(row).map(Number)) || '';
    const tr = el?.closest('tr'); if (tr && cid !== 'staff') tr.classList.toggle('in', Object.keys(row).length > 0);
  }
  document.getElementById('sheets-status').textContent = `${sheetsIn(d)} of ${S().classes.length} sheets entered.`;
}

function viewPlan() {
  const s = S(), d = ui.date;
  ensureMenus([d]);
  const p = plan(d), served = s.served[d];
  const needRows = Object.entries(p.need).map(([id, q]) => ({ it: invById(id), q })).filter(x => x.it).sort((a, b) => a.it.loc.localeCompare(b.it.loc) || a.it.name.localeCompare(b.it.name));
  return `
  <div class="row-head"><h2>Production · ${fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>${menuNote(d)}</div>
  ${dayChips(d)}
  ${!p.hasMenu ? '<p class="panel">No menu for this day yet.</p>' : ''}
  ${tipsPanel(d)}
  ${!hasCounts(d) ? `<p class="callout">No class sheets entered for this day. <button class="link" data-act="goto" data-tab="counts" data-date="${d}">Enter counts</button></p>` : ''}
  <section class="panel">
    <h3>How many to make</h3>
    <div class="scroll"><table class="tbl">
      <thead><tr><th>Choice</th><th class="n">Ordered</th><th class="n">Extras</th><th class="n">Make</th><th>Why this many extras</th></tr></thead>
      <tbody>${p.rows.map(r => `<tr>
        <td>${emo(r.dish)} <b>${esc(r.label)}</b>${r.key === 'main' ? `<br><small>${esc(r.dish)}</small>` : ''}</td>
        <td class="n">${r.total}</td>
        <td class="n"><input type="number" min="0" class="sm" data-extra="${esc(r.key)}" value="${r.extra}" aria-label="Extras for ${esc(r.label)}">${r.overridden ? `<button class="link small" data-act="reset-extra" data-key="${esc(r.key)}">use ${r.suggest}</button>` : ''}</td>
        <td class="n big">${r.make}</td>
        <td class="small muted">${esc(r.basis)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><th>Lunch total</th><td class="n">${p.lunchTotal}</td><td class="n">${p.lunchMake - p.lunchTotal}</td><td class="n big">${p.lunchMake}</td><td></td></tr>
      <tr><th>Breakfast</th><td class="n">${p.bCount}</td><td class="n">${p.bMake - p.bCount}</td><td class="n big">${p.bMake}</td><td class="small muted">${s.settings.breakfastExtraPct}% buffer</td></tr></tfoot>
    </table></div>
  </section>

  <div class="two">
    <section class="panel">
      <h3>Prep sheet</h3>
      <table class="tbl"><thead><tr><th>Item</th><th class="n">Servings</th><th>Portion</th></tr></thead><tbody>
      ${['Breakfast', 'Lunch', 'Alternate'].map(meal => { const its = p.items.filter(i => i.meal === meal && i.servings); return its.length ? `<tr class="group"><th colspan="3">${meal}</th></tr>` + its.map(i => `<tr><td>${emo(i.name)} ${esc(i.name)} ${s.recipes[norm(i.name)] ? '' : `<button class="pill warn" data-act="edit-recipe" data-name="${esc(i.name)}">needs recipe</button>`}</td><td class="n">${i.servings}</td><td class="small">${esc(i.portion)}</td></tr>`).join('') : ''; }).join('')}
      </tbody></table>
      <p class="small muted">Milk split ${100 - s.settings.chocShare}% plain / ${s.settings.chocShare}% chocolate. Fruit, vegetables and milk go to every lunch, including the alternates.</p>
    </section>
    <section class="panel">
      <h3>Pull list</h3>
      <p class="small muted">What to take out of storage, scaled from recipes.</p>
      ${needRows.length ? `<table class="tbl"><thead><tr><th>Ingredient</th><th>Where</th><th class="n">Need</th><th class="n">On hand</th></tr></thead><tbody>
        ${needRows.map(({ it, q }) => `<tr><td>${esc(it.name)}</td><td class="small">${esc(it.loc)}</td><td class="n">${fmtQty(it, q)}</td><td class="n ${q > it.onHand ? 'bad-t' : ''}">${fmtQty(it, it.onHand)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Nothing to pull yet.</p>'}
      ${p.missing.length ? `<p class="callout small">Not included: ${p.missing.map(n => `<button class="link" data-act="edit-recipe" data-name="${esc(n)}">${esc(n)}</button>`).join(', ')}. Add a recipe to include it.</p>` : ''}
    </section>
  </div>

  <section class="panel ${served ? 'done' : ''}">
    <h3>After service</h3>
    ${served ? `<p><span class="pill ok">Served</span> Ingredients were subtracted from inventory on ${new Date(served.at).toLocaleString()}.</p>
      <table class="tbl"><thead><tr><th>Choice</th><th class="n">Made</th><th class="n">Left over</th><th class="n">Ran short by</th></tr></thead><tbody>
      ${served.rows.map(r => `<tr><td>${emo(r.dish)} ${esc(r.dish)}</td><td class="n">${r.made}</td><td class="n">${r.leftover}</td><td class="n">${r.short}</td></tr>`).join('')}</tbody></table>
      <button class="btn ghost" data-act="undo-served">Undo and put stock back</button>` : `
      <p class="small muted">Write down leftovers (or how many more kids wanted it). This is what the extras suggestion learns from. Marking served subtracts the pull list from inventory.</p>
      <table class="tbl"><thead><tr><th>Choice</th><th class="n">Made</th><th class="n">Left over</th><th class="n">Ran short by</th></tr></thead><tbody>
      ${p.rows.filter(r => r.make).map(r => `<tr><td>${emo(r.dish)} ${esc(r.dish)}</td><td class="n">${r.make}</td><td class="n"><input type="number" min="0" class="sm" id="left-${esc(r.key)}" data-left="${esc(r.key)}" value="0"></td><td class="n"><input type="number" min="0" class="sm" id="short-${esc(r.key)}" data-short="${esc(r.key)}" value="0"></td></tr>`).join('')}
      </tbody></table>
      <button class="btn" data-act="mark-served" ${p.lunchMake || p.bMake ? '' : 'disabled'}>Mark served and subtract from inventory</button>`}
  </section>`;
}

function viewInventory() {
  const s = S();
  const q = norm(ui.invSearch);
  const items = s.inventory.filter(i => (ui.invFilter === 'All' || (ui.invFilter === 'Low' ? i.onHand < i.par : i.loc === ui.invFilter)) && (!q || norm(i.name).includes(q)));
  ui.reportFrom ||= addDays(todayIso(), -14); ui.reportTo ||= todayIso();
  const inRange = s.log.filter(t => t.date >= ui.reportFrom && t.date <= ui.reportTo);
  const rep = {};
  for (const t of inRange) { const r = rep[t.inv] ||= { restock: 0, use: 0, adj: 0 }; if (t.type === 'restock') r.restock += t.qty; else if (t.type === 'use') r.use -= t.qty; else r.adj += t.qty; }
  const act = ui.invAction;
  const opts = sel => s.inventory.map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
  return `
  <div class="row-head"><h2>Inventory</h2><span class="muted">${s.inventory.length} items · ${lowCount()} below par</span></div>
  <section class="panel actionbar">
    <div class="seg" role="group" aria-label="Action">
      ${[['restock', 'Log delivery'], ['count', 'Shelf count'], ['waste', 'Waste / spoiled'], ['new', 'New item']].map(([k, l]) => `<button class="${act?.type === k ? 'on' : ''}" data-act="inv-action" data-type="${k}">${l}</button>`).join('')}
    </div>
    ${act ? (act.type === 'new' ? `
      <form class="formrow" data-form="new-item">
        <label class="field"><span>Name</span><input id="ni-name" required></label>
        <label class="field"><span>Where</span><select id="ni-loc">${LOCATIONS.map(l => `<option>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Recipe unit</span><input id="ni-unit" placeholder="oz, each, cup…" required></label>
        <label class="field"><span>Comes in (optional)</span><input id="ni-pack" placeholder="case"></label>
        <label class="field"><span>Units per pack</span><input id="ni-packsize" type="number" min="0" step="any"></label>
        <label class="field"><span>Par level</span><input id="ni-par" type="number" min="0" step="any" value="0"></label>
        <label class="field"><span>On hand now</span><input id="ni-onhand" type="number" min="0" step="any" value="0"></label>
        <button class="btn">Add item</button>
      </form>` : (() => {
      const it = invById(act.inv) || s.inventory[0];
      return `<form class="formrow" data-form="inv-tx">
        <label class="field"><span>Item</span><select id="tx-item" data-act-change="tx-item">${opts(it.id)}</select></label>
        ${act.type === 'count' ? `<label class="field"><span>Counted on shelf (${esc(it.unit)})</span><input id="tx-qty" type="number" min="0" step="any" required></label>` : `
        <label class="field"><span>Amount</span><input id="tx-qty" type="number" min="0" step="any" required></label>
        <label class="field"><span>In</span><select id="tx-unit">${it.packSize ? `<option value="pack">${esc(it.packName)}s (${it.packSize} ${esc(it.unit)})</option>` : ''}<option value="unit">${esc(it.unit)}</option></select></label>`}
        <label class="field"><span>Date</span><input id="tx-date" type="date" value="${todayIso()}"></label>
        <label class="field grow"><span>Note</span><input id="tx-note" placeholder="${act.type === 'restock' ? 'Vendor, invoice #' : 'Optional'}"></label>
        <button class="btn">${act.type === 'restock' ? 'Add to stock' : act.type === 'count' ? 'Save count' : 'Remove from stock'}</button>
        <span class="small muted">Now: ${fmtQty(it, it.onHand)}</span>
      </form>`;
    })()) : '<p class="small muted">Deliveries add stock. Serving a day subtracts its pull list automatically. A shelf count corrects any drift.</p>'}
  </section>

  <div class="filters">
    <div class="seg" role="group" aria-label="Filter">${['All', 'Low', ...LOCATIONS].map(f => `<button class="${ui.invFilter === f ? 'on' : ''}" data-act="inv-filter" data-f="${f}">${f === 'Low' ? 'Below par' : f}</button>`).join('')}</div>
    <input type="search" id="inv-search" placeholder="Search items" value="${esc(ui.invSearch)}" aria-label="Search items">
  </div>
  <div class="scroll"><table class="tbl inv">
    <thead><tr><th>Item</th><th>Where</th><th class="n">On hand</th><th class="n">Par</th><th>Status</th><th class="n">Restocked*</th><th class="n">Used*</th><th></th></tr></thead>
    <tbody>${items.map(it => { const [st, cls] = stockStatus(it), r = rep[it.id] || {}; return `<tr>
      <td>${esc(it.name)}<br><small class="muted">${it.packSize ? `${esc(it.packName)} = ${it.packSize} ${esc(it.unit)}` : esc(it.unit)}</small></td>
      <td class="small">${esc(it.loc)}</td>
      <td class="n">${fmtQty(it, it.onHand)}</td>
      <td class="n"><input type="number" min="0" step="any" class="sm" data-par="${it.id}" value="${it.par}" aria-label="Par for ${esc(it.name)}"></td>
      <td><span class="pill ${cls}">${st}</span></td>
      <td class="n">${r.restock ? fmtQty(it, r.restock) : '—'}</td>
      <td class="n">${r.use ? fmtQty(it, r.use) : '—'}</td>
      <td><button class="link small" data-act="inv-action" data-type="restock" data-inv="${it.id}">+ Delivery</button></td></tr>`; }).join('')}
    </tbody></table></div>
  <p class="small muted">* Between <input type="date" id="rep-from" value="${ui.reportFrom}"> and <input type="date" id="rep-to" value="${ui.reportTo}">. Par is the amount you always want on the shelf; edit it right in the table.</p>

  <section class="panel">
    <h3>Recent activity</h3>
    <div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>Item</th><th>What</th><th class="n">Change</th><th>Note</th></tr></thead><tbody>
    ${s.log.slice(-25).reverse().map(t => { const it = invById(t.inv); return `<tr><td class="small">${fmtDay(t.date)}</td><td>${esc(it?.name || t.inv)}</td><td><span class="pill ${t.type === 'restock' ? 'ok' : t.type === 'use' ? '' : 'warn'}">${{ restock: 'Delivery', use: 'Used', count: 'Count fix', waste: 'Waste' }[t.type]}</span></td><td class="n">${t.qty > 0 ? '+' : ''}${fmtQty(it, t.qty)}</td><td class="small muted">${esc(t.note)}</td></tr>`; }).join('')}
    </tbody></table></div>
  </section>`;
}

function viewOrder() {
  const s = S();
  ui.orderFrom ||= nextSchoolDay(addDays(todayIso(), 1));
  const o = orderCalc();
  return `
  <div class="row-head"><h2>Order request for the kitchen director</h2></div>
  <section class="panel">
    <div class="formrow">
      <label class="field"><span>Starting</span><input type="date" id="order-from" value="${ui.orderFrom}"></label>
      <label class="field"><span>School days to cover</span><input type="number" min="1" max="30" id="order-days" value="${s.settings.orderDays}"></label>
      <p class="small muted grow">Order = what the menu needs over these days + par level − what's on the shelf, rounded up to whole packs. Change any quantity before sending.</p>
    </div>
    ${o.estDays.length ? `<p class="small">Using the Settings estimate for ${o.estDays.length} day${o.estDays.length > 1 ? 's' : ''} without class sheets yet.</p>` : ''}
    ${o.noMenu.length ? `<p class="callout small">No menu yet for ${o.noMenu.map(d => fmtDay(d)).join(', ')} — those days aren't counted.</p>` : ''}
    ${o.missing.length ? `<p class="callout small">No recipe for ${o.missing.map(n => `<button class="link" data-act="edit-recipe" data-name="${esc(n)}">${esc(n)}</button>`).join(', ')} — not counted.</p>` : ''}
  </section>
  <div class="scroll"><table class="tbl">
    <thead><tr><th>Item</th><th>Where</th><th class="n">Menu needs</th><th class="n">On hand</th><th class="n">Par</th><th class="n">Order</th></tr></thead>
    <tbody>${o.lines.length ? o.lines.map(l => `<tr><td>${esc(l.it.name)}</td><td class="small">${esc(l.it.loc)}</td><td class="n">${fmtQty(l.it, l.need)}</td><td class="n">${fmtQty(l.it, l.it.onHand)}</td><td class="n">${fmtQty(l.it, l.it.par)}</td>
      <td class="n"><input type="number" min="0" class="sm" data-orderqty="${l.it.id}" value="${l.qty}" aria-label="Order quantity for ${esc(l.it.name)}"> ${esc(l.it.packSize ? l.it.packName + 's' : l.it.unit)}</td></tr>`).join('') : '<tr><td colspan="6" class="ok-t">Nothing to order for this period.</td></tr>'}
    </tbody></table></div>
  <section class="panel">
    <h3>Message to send</h3>
    <textarea id="order-text" rows="10" readonly>${esc(orderText(o))}</textarea>
    <div class="formrow"><button class="btn" data-act="copy-order">Copy message</button><button class="btn ghost" data-act="csv-order">Download spreadsheet (CSV)</button><button class="btn ghost" data-act="save-order">Mark as sent</button></div>
    ${s.orders.length ? `<p class="small muted">Last sent ${new Date(s.orders.at(-1).at).toLocaleString()} (${s.orders.at(-1).lines.length} lines).</p>` : ''}
  </section>`;
}

function allDishes() {
  const s = S(), seen = new Map();
  for (const [d, m] of Object.entries(s.menus).sort()) for (const meal of ['breakfast', 'lunch']) for (const i of m[meal]) {
    const k = norm(i.name); const e = seen.get(k) || { name: i.name, meal: meal === 'breakfast' ? 'Breakfast' : 'Lunch', type: i.type, dates: [] };
    e.dates.push(d); seen.set(k, e);
  }
  for (const a of s.alternates) if (!seen.has(norm(a))) seen.set(norm(a), { name: a, meal: 'Alternate', type: 'ALTERNATE', dates: [] });
  for (const r of Object.values(s.recipes)) if (!seen.has(norm(r.name))) seen.set(norm(r.name), { name: r.name, meal: '—', type: '', dates: [] });
  return [...seen.values()];
}

function viewRecipes() {
  const s = S(), dishes = allDishes(), today = todayIso();
  const ed = ui.recipeEdit;
  const missingN = dishes.filter(d => !s.recipes[norm(d.name)]).length;
  return `
  <div class="row-head"><h2>Recipes</h2><span class="muted">${dishes.length - missingN} done · ${missingN} to add</span></div>
  <p class="muted">A recipe is just "per serving, this much of each ingredient". The system scales it to the day's numbers. Start rough and adjust it as you learn.</p>
  ${ed ? recipeEditor(ed) : ''}
  <div class="scroll"><table class="tbl">
    <thead><tr><th>Dish</th><th>Meal</th><th>Next served</th><th>Recipe</th></tr></thead>
    <tbody>${dishes.sort((a, b) => (!!s.recipes[norm(a.name)] - !!s.recipes[norm(b.name)]) || a.name.localeCompare(b.name)).map(d => {
      const r = s.recipes[norm(d.name)], next = d.dates.find(x => x >= today);
      return `<tr><td>${emo(d.name)} ${esc(d.name)}</td><td class="small">${esc(d.meal)}</td><td class="small">${d.meal === 'Alternate' ? 'Daily' : next ? fmtDay(next) : '—'}</td>
        <td>${r ? `<button class="link" data-act="edit-recipe" data-name="${esc(d.name)}">${r.ingredients.map(g => esc(invById(g.inv)?.name || g.inv)).join(', ') || 'Edit'}</button>` : `<button class="pill warn" data-act="edit-recipe" data-name="${esc(d.name)}">Add recipe</button>`}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function recipeEditor(ed) {
  const s = S();
  const opt = sel => `<option value="">Choose…</option>` + s.inventory.slice().sort((a, b) => a.name.localeCompare(b.name)).map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)} (${esc(i.unit)})</option>`).join('');
  return `<section class="panel editor">
    <h3>${esc(ed.name)}</h3>
    <form data-form="recipe">
      <table class="tbl"><thead><tr><th>Ingredient</th><th class="n">Per serving</th><th></th></tr></thead><tbody>
      ${ed.ingredients.map((g, i) => `<tr><td><select id="ri-inv-${i}" data-ri="${i}" data-f="inv">${opt(g.inv)}</select></td><td class="n"><input type="number" min="0" step="any" class="sm" id="ri-qty-${i}" data-ri="${i}" data-f="qty" value="${g.qty ?? ''}"> <span class="small">${esc(invById(g.inv)?.unit || '')}</span></td><td><button type="button" class="link small" data-act="ri-del" data-i="${i}">Remove</button></td></tr>`).join('')}
      </tbody></table>
      <div class="formrow"><button type="button" class="btn ghost" data-act="ri-add">+ Ingredient</button>
        <span class="small muted">Not in the list? Add it under Inventory → New item.</span></div>
      <label class="field"><span>Notes for staff</span><textarea id="ri-notes" rows="2">${esc(ed.notes || '')}</textarea></label>
      <div class="formrow"><button class="btn">Save recipe</button><button type="button" class="btn ghost" data-act="ri-cancel">Cancel</button>
      ${s.recipes[norm(ed.name)] ? '<button type="button" class="link small" data-act="ri-delete">Delete recipe</button>' : ''}</div>
    </form></section>`;
}

function viewSettings() {
  const s = S(), st = s.settings;
  return `
  <div class="row-head"><h2>Settings</h2></div>
  <div class="two">
    <section class="panel">
      <h3>School</h3>
      <label class="field"><span>Name</span><input data-set="name" value="${esc(s.name)}"></label>
      <label class="field"><span>MealViewer school ID</span><input data-set="mvSlug" value="${esc(s.mvSlug)}"></label>
      <p class="small muted">The part after /school/ in the MealViewer link.</p>
      <button class="btn ghost" data-act="refresh-menu">Reload this week's menu</button>
      <h3>Alternates (every day)</h3>
      <textarea id="alts" rows="5">${esc(s.alternates.join('\n'))}</textarea>
      <p class="small muted">One per line, matching the columns on the class sheet.</p>
    </section>
    <section class="panel">
      <h3>Extras and estimates</h3>
      <label class="field"><span>Default extras when a dish has no history (%)</span><input type="number" min="0" data-setn="extraPct" value="${st.extraPct}"></label>
      <label class="field"><span>Minimum extras per choice</span><input type="number" min="0" data-setn="extraMin" value="${st.extraMin}"></label>
      <label class="field"><span>Breakfast extras (%)</span><input type="number" min="0" data-setn="breakfastExtraPct" value="${st.breakfastExtraPct}"></label>
      <label class="field"><span>Chocolate milk share (%)</span><input type="number" min="0" max="100" data-setn="chocShare" value="${st.chocShare}"></label>
      <h3>Typical day (used for days without sheets)</h3>
      ${['main', ...s.alternates.map(a => 'alt:' + a), 'breakfast'].map(k => `<label class="field inline"><span>${esc(k === 'main' ? 'Main lunch' : k === 'breakfast' ? 'Breakfast' : k.slice(4))}</span><input type="number" min="0" class="sm" data-est="${esc(k)}" value="${st.estimate[k] ?? 0}"></label>`).join('')}
    </section>
  </div>
  <section class="panel">
    <h3>Classes</h3>
    <div class="scroll"><table class="tbl"><thead><tr><th>Grade</th><th>Teacher</th><th></th></tr></thead><tbody>
      ${s.classes.map(c => `<tr><td><input class="sm" data-cls="${c.id}" data-f="grade" value="${esc(c.grade)}" aria-label="Grade"></td><td><input data-cls="${c.id}" data-f="teacher" value="${esc(c.teacher)}" aria-label="Teacher"></td><td><button class="link small" data-act="del-class" data-id="${c.id}">Remove</button></td></tr>`).join('')}
    </tbody></table></div>
    <button class="btn ghost" data-act="add-class">+ Add class</button>
  </section>
  ${pinSettings()}
  <section class="panel">
    <h3>Your data</h3>
    <p class="small">Everything is saved in this browser on this computer. Download a backup now and then. The same file restores it here or on another computer.</p>
    <div class="formrow">
      <button class="btn" data-act="export">Download backup</button>
      <label class="btn ghost filebtn">Restore from backup<input type="file" id="import-file" accept="application/json"></label>
      ${s.example ? '<button class="btn ghost" data-act="clear-examples">Clear example data</button>' : ''}
      <button class="link small" data-act="reset" id="reset-btn">Reset to the demo</button>
    </div>
    <h3>Schools</h3>
    <p class="small muted">Each school keeps its own menu, classes, recipes and inventory.</p>
    <div class="formrow">
      <select id="school-switch">${Object.values(state.schools).map(x => `<option value="${x.id}" ${x.id === state.current ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <button class="btn ghost" data-act="add-school">+ Add a school</button>
    </div>
  </section>`;
}

/* ---------- dish emoji ---------- */
// First match wins, so specific names come before general ones.
const DISH_EMOJI = [
  ['pizza', '🍕'], ['burger', '🍔'], ['patty', '🍔'], ['hot dog', '🌭'], ['sausage', '🌭'],
  ['grilled cheese', '🥪'], ['toasted cheese', '🥪'], ['sunbutter', '🥪'], ['sandwich', '🥪'], ['wrap', '🌯'],
  ['taco', '🌮'], ['burrito', '🌯'], ['nacho', '🌮'], ['quesadilla', '🌮'],
  ['tomato soup', '🍅'], ['soup', '🥣'], ['chili', '🥣'], ['stew', '🥣'],
  ['lasagna', '🍝'], ['spaghetti', '🍝'], ['pasta', '🍝'], ['ziti', '🍝'], ['macaroni', '🍝'], ['mac ', '🍝'], ['ravioli', '🍝'],
  ['waffle', '🧇'], ['pancake', '🥞'], ['french toast', '🍞'],
  ['nugget', '🍗'], ['tender', '🍗'], ['popcorn chicken', '🍗'], ['fish', '🐟'], [' egg', '🍳'],
  ['dumpling', '🥟'], [' rice', '🍚'], ['curry', '🍛'],
  ['salad', '🥗'], ['caesar', '🥗'], ['chicken', '🍗'],
  ['tater tot', '🍟'], ['tots', '🍟'], ['fries', '🍟'], ['potato', '🥔'],
  ['bagel', '🥯'], ['dinner roll', '🍞'], ['roll', '🍞'], ['bread', '🍞'], ['muffin', '🧁'],
  ['cinnamon toast crunch', '🥣'], ['cheerios', '🥣'], ['corn flakes', '🥣'], ['coco puff', '🥣'], ['cereal', '🥣'], ['granola', '🥣'],
  ['yogurt', '🍨'], ['string cheese', '🧀'], ['cheese', '🧀'],
  ['chocolate milk', '🍫'], ['milk', '🥛'],
  ['kale', '🥬'], ['celery', '🥬'], ['lettuce', '🥬'], ['spinach', '🥬'], ['broccoli', '🥦'], ['california blend', '🥦'], ['veggie', '🥦'],
  ['carrot', '🥕'], ['corn', '🌽'], ['chick pea', '🫘'], ['chickpea', '🫘'], ['bean', '🫘'], ['cucumber', '🥒'], ['pepper', '🫑'],
  ['apple', '🍎'], ['pear', '🍐'], ['orange', '🍊'], ['peach', '🍑'], ['banana', '🍌'], ['grape', '🍇'], ['strawberr', '🍓'],
  ['melon', '🍉'], ['pineapple', '🍍'], ['cherr', '🍒'], ['mixed fruit', '🍒'], ['fruit', '🍏'],
];
function dishEmojis(name) {
  return String(name || '').split(' + ').map(part => {
    const n = ' ' + norm(part) + ' ';
    return (DISH_EMOJI.find(([k]) => n.includes(k)) || [, '🍽️'])[1];
  }).join('');
}
const emo = name => `<span class="emo" aria-hidden="true">${dishEmojis(name)}</span>`;

/* ---------- kitchen tips ---------- */
// Starter tips come from tips.js; each kitchen can edit, hide or add its own (stored per school).
const tipStore = () => (S().tips ||= { custom: [], edits: {}, hidden: {} });
function tipMatches(match, name) {
  const n = norm(name);
  return String(match).split(',').map(p => norm(p).split(/\s+/).filter(Boolean)).some(words => words.length && words.every(w => n.includes(w)));
}
function allTips() {
  const t = tipStore();
  const starters = TIP_LIBRARY.map(x => ({ ...x, ...(t.edits[x.id] || {}), starter: true, edited: !!t.edits[x.id], hidden: !!t.hidden[x.id] }));
  return [...t.custom.map(x => ({ ...x, starter: false, hidden: false })), ...starters];
}
function tipsFor(date) {
  const m = S().menus[date]; if (!m) return [];
  const dishes = [...m.lunch.filter(i => i.type === 'ENTREES'), ...m.lunch.filter(i => i.type !== 'ENTREES'), ...m.breakfast].map(i => i.name);
  const out = [];
  for (const tip of allTips()) {
    if (tip.hidden) continue;
    const dish = dishes.find(d => tipMatches(tip.match, d));
    if (dish) out.push({ ...tip, dish });
  }
  return out.sort((a, b) => dishes.indexOf(a.dish) - dishes.indexOf(b.dish));
}
function tipsPanel(date) {
  const tips = tipsFor(date);
  if (!tips.length) return '';
  return `<section class="panel tips">
    <h3>Heads-up for today</h3>
    ${tips.map(t => `<div class="tipitem">
      <p class="tiphead"><b>${esc(t.title)}</b> <span class="small muted">· ${emo(t.dish)} ${esc(t.dish)}</span></p>
      <p>${esc(t.text)}</p>
      <div class="tipacts"><button class="link small" data-act="tip-edit" data-id="${esc(t.id)}">Edit</button>${t.starter ? `<button class="link small" data-act="tip-hide" data-id="${esc(t.id)}">Hide for our kitchen</button>` : ''}</div>
    </div>`).join('')}
  </section>`;
}

function viewTips() {
  const tips = allTips(), ed = ui.tipEdit, today = todayIso();
  const upcoming = Object.keys(S().menus).filter(d => d >= today).sort();
  const nextFor = t => upcoming.find(d => Object.values(S().menus[d]).flat().some(i => tipMatches(t.match, i.name)));
  const row = t => { const nx = nextFor(t); return `<article class="tipitem ${t.hidden ? 'off' : ''}">
    <p class="tiphead"><b>${esc(t.title)}</b> ${t.starter ? `<span class="pill">${t.edited ? 'Starter, edited' : 'Starter'}</span>` : '<span class="pill ok">Ours</span>'} ${t.hidden ? '<span class="pill warn">Hidden</span>' : ''}</p>
    <p>${esc(t.text)}</p>
    <p class="small muted">Shows when a dish name has: ${esc(t.match)}${nx ? ` · next: ${fmtDay(nx)}` : ''}</p>
    <div class="tipacts"><button class="link small" data-act="tip-edit" data-id="${esc(t.id)}">Edit</button>
      ${t.starter ? (t.hidden ? `<button class="link small" data-act="tip-unhide" data-id="${esc(t.id)}">Show again</button>` : `<button class="link small" data-act="tip-hide" data-id="${esc(t.id)}">Hide</button>`) : ''}</div>
  </article>`; };
  return `
  <div class="row-head"><h2>Kitchen tips</h2><span class="muted">${tips.filter(t => !t.hidden).length} active</span></div>
  <p class="muted">Tips show up on the Production page when a matching dish is on the menu. Starter tips are general good practice. Edit them to fit your kitchen and add what you learn.</p>
  <div><button class="btn" data-act="tip-new">+ Add a tip</button></div>
  ${ed ? `<section class="panel editor"><h3>${ed.id ? 'Edit tip' : 'New tip'}</h3>
    <form data-form="tip">
      <label class="field"><span>Title</span><input id="tip-title" required value="${esc(ed.title)}"></label>
      <label class="field"><span>Show when the dish name has (separate with commas)</span><input id="tip-match" required value="${esc(ed.match)}" placeholder="cheese patty, cheeseburger"></label>
      <label class="field"><span>Tip</span><textarea id="tip-text" rows="3" required>${esc(ed.text)}</textarea></label>
      <div class="formrow"><button class="btn">Save tip</button><button type="button" class="btn ghost" data-act="tip-cancel">Cancel</button>
        ${ed.starter && ed.edited ? '<button type="button" class="link small" data-act="tip-reset">Go back to the starter wording</button>' : ''}
        ${ed.id && !ed.starter ? '<button type="button" class="link small" data-act="tip-delete">Delete tip</button>' : ''}</div>
    </form></section>` : ''}
  <div class="tiplist">${tips.filter(t => !t.hidden).map(row).join('')}</div>
  ${tips.some(t => t.hidden) ? `<h3>Hidden</h3><div class="tiplist">${tips.filter(t => t.hidden).map(row).join('')}</div>` : ''}`;
}

/* ---------- PIN lock ---------- */
// A simple lock against accidental changes at a shared computer. Not real security: the data itself isn't encrypted.
const lock = { locked: false, entry: '', fails: 0, waitUntil: 0, last: Date.now(), msg: '', resetStep: false };

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0; for (const b of data) h = (h * 31 + b) >>> 0;
  return 'x' + h.toString(16);
}
async function checkPin(pin) { return !!state.pin && (await hashPin(pin, state.pin.salt)) === state.pin.hash; }
async function setPin(pin) {
  const salt = uid() + uid();
  state.pin = { salt, hash: await hashPin(pin, salt), len: pin.length, idleMin: state.pin?.idleMin ?? 15 };
  save();
}
const validPin = p => /^\d{4,6}$/.test(p);

function backupAge() {
  if (!state.lastBackup) return ['No backup downloaded yet', true];
  const days = Math.floor((Date.now() - state.lastBackup) / 86400000);
  return [`Last backup: ${days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'}`, days > 7];
}

function lockNow() {
  if (!state.pin) return;
  Object.assign(lock, { locked: true, entry: '', msg: '', resetStep: false });
  renderLock();
}
function unlock() {
  Object.assign(lock, { locked: false, entry: '', fails: 0, msg: '', resetStep: false, last: Date.now() });
  renderLock(); render();
}
function renderLock() {
  const box = document.getElementById('lock');
  document.body.classList.toggle('locked', lock.locked);
  box.hidden = !lock.locked;
  if (!lock.locked) { box.innerHTML = ''; return; }
  const [age, stale] = backupAge(), waiting = Date.now() < lock.waitUntil;
  box.innerHTML = `<div class="lockbox">
    <span class="mark" aria-hidden="true"></span>
    <h1>${esc(S().name)}</h1>
    <p class="muted">Kitchen Manager · enter your PIN</p>
    <div class="dots" aria-label="${lock.entry.length} of ${state.pin.len} digits entered">${Array.from({ length: state.pin.len }, (_, i) => `<span class="${i < lock.entry.length ? 'on' : ''}"></span>`).join('')}</div>
    <p class="lockmsg" role="alert">${esc(lock.msg)}</p>
    <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => `<button type="button" ${k ? '' : 'disabled'} ${waiting && k ? 'aria-disabled="true"' : ''} data-act="${k === '⌫' ? 'pin-back' : 'pin-key'}" data-k="${k}" aria-label="${k === '⌫' ? 'Delete' : k}">${k}</button>`).join('')}</div>
    <p class="small ${stale ? 'bad-t' : 'muted'}">${age}</p>
    ${lock.resetStep ? `<p class="small">This removes the PIN and keeps all your data. Type <b>RESET PIN</b> to confirm.</p>
      <form data-form="pin-reset"><input id="pin-reset-text" autocomplete="off" aria-label="Type RESET PIN"><button class="btn">Reset</button></form>`
      : '<button class="link small" data-act="pin-forgot">Forgot PIN?</button>'}
  </div>`;
}
async function pinKey(k) {
  if (!lock.locked || lock.entry.length >= state.pin.len) return;
  if (Date.now() < lock.waitUntil) { lock.msg = `Too many tries. Wait ${Math.ceil((lock.waitUntil - Date.now()) / 1000)} seconds.`; return renderLock(); }
  lock.entry += k; lock.msg = '';
  renderLock();
  if (lock.entry.length < state.pin.len) return;
  if (await checkPin(lock.entry)) return unlock();
  lock.entry = ''; lock.fails++;
  if (lock.fails >= 5) {
    lock.fails = 0; lock.waitUntil = Date.now() + 30000;
    lock.msg = 'Too many tries. Wait 30 seconds.';
    setTimeout(() => { if (lock.locked) { lock.msg = ''; renderLock(); } }, 30000);
  } else lock.msg = 'Wrong PIN. Try again.';
  renderLock();
}

function pinSettings() {
  const p = state.pin, [age] = backupAge();
  const pinInput = (id, label) => `<label class="field"><span>${label}</span><input type="password" inputmode="numeric" autocomplete="off" pattern="\\d{4,6}" maxlength="6" id="${id}" required></label>`;
  return `<section class="panel">
    <h3>PIN lock</h3>
    <p class="small muted">Asks for a PIN when the app opens and after it sits unused, so nobody at the kitchen computer changes numbers by accident. It's a simple lock, not strong security.</p>
    ${state.pinResetAt ? `<p class="small callout">The PIN was reset from the lock screen on ${new Date(state.pinResetAt).toLocaleString()}.</p>` : ''}
    ${!p ? `<form class="formrow" data-form="pin-set">${pinInput('pin-new', 'New PIN (4–6 digits)')}${pinInput('pin-new2', 'Type it again')}<button class="btn">Turn on PIN</button></form>` : `
      <p><span class="pill ok">On</span> ${p.len}-digit PIN.</p>
      <label class="field inline"><span>Lock after being unused for</span><select id="pin-idle">${[[5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [0, 'Never (only on open or Lock)']].map(([v, l]) => `<option value="${v}" ${p.idleMin === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <form class="formrow" data-form="pin-change">${pinInput('pin-cur', 'Current PIN')}${pinInput('pin-new', 'New PIN')}${pinInput('pin-new2', 'New PIN again')}<button class="btn ghost">Change PIN</button></form>
      <form class="formrow" data-form="pin-remove">${pinInput('pin-cur2', 'Current PIN')}<button class="btn ghost">Turn off PIN</button></form>`}
    <p class="small muted">${age}.</p>
  </section>`;
}

/* ---------- events ---------- */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const actions = {
  tab: el => { ui.tab = el.dataset.tab; ui.recipeEdit = null; render(); window.scrollTo(0, 0); },
  goto: el => { if (el.dataset.date) ui.date = el.dataset.date; ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  'pick-day': el => { ui.date = nextSchoolDay(el.dataset.date); render(); },
  'go-today': () => { ui.date = nextSchoolDay(todayIso()); render(); },
  'reset-extra': el => { delete S().extrasOverride[ui.date][el.dataset.key]; save(); render(); },
  'mark-served': () => {
    const rows = plan(ui.date).rows.filter(r => r.make).map(r => ({
      key: r.key, dish: r.dish, ordered: r.total, made: r.make,
      leftover: +document.querySelector(`[data-left="${CSS.escape(r.key)}"]`).value || 0,
      short: +document.querySelector(`[data-short="${CSS.escape(r.key)}"]`).value || 0,
    }));
    markServed(ui.date, rows); toast('Marked served. Inventory updated.'); render();
  },
  'undo-served': () => { undoServed(ui.date); toast('Undone. Stock put back.'); render(); },
  'inv-action': el => { ui.invAction = ui.invAction?.type === el.dataset.type && !el.dataset.inv ? null : { type: el.dataset.type, inv: el.dataset.inv || ui.invAction?.inv }; render(); document.getElementById('tx-qty')?.focus(); },
  'inv-filter': el => { ui.invFilter = el.dataset.f; render(); },
  'edit-recipe': el => {
    const name = el.dataset.name, r = S().recipes[norm(name)];
    ui.recipeEdit = r ? JSON.parse(JSON.stringify(r)) : { name, ingredients: [{ inv: '', qty: 1 }], notes: '' };
    ui.tab = 'recipes'; render(); window.scrollTo(0, 0);
  },
  'ri-add': () => { ui.recipeEdit.ingredients.push({ inv: '', qty: 1 }); render(); },
  'ri-del': el => { ui.recipeEdit.ingredients.splice(+el.dataset.i, 1); render(); },
  'ri-cancel': () => { ui.recipeEdit = null; render(); },
  'tip-new': () => { ui.tipEdit = { title: '', match: '', text: '' }; ui.tab = 'tips'; render(); window.scrollTo(0, 0); },
  'tip-edit': el => { const t = allTips().find(x => x.id === el.dataset.id); ui.tipEdit = { ...t }; ui.tab = 'tips'; render(); window.scrollTo(0, 0); },
  'tip-cancel': () => { ui.tipEdit = null; render(); },
  'tip-hide': el => { tipStore().hidden[el.dataset.id] = true; save(); toast('Tip hidden. Show it again from the Tips tab.'); render(); },
  'tip-unhide': el => { delete tipStore().hidden[el.dataset.id]; save(); render(); },
  'tip-reset': () => { delete tipStore().edits[ui.tipEdit.id]; ui.tipEdit = null; save(); toast('Back to the starter wording'); render(); },
  'tip-delete': () => { const t = tipStore(); t.custom = t.custom.filter(x => x.id !== ui.tipEdit.id); ui.tipEdit = null; save(); toast('Tip deleted'); render(); },
  'ri-delete': () => { delete S().recipes[norm(ui.recipeEdit.name)]; ui.recipeEdit = null; save(); toast('Recipe deleted'); render(); },
  'copy-order': () => {
    const ta = document.getElementById('order-text');
    navigator.clipboard?.writeText(ta.value).then(() => toast('Copied. Paste it into an email or text to the director.'), () => { ta.select(); toast('Press Ctrl/Cmd+C to copy'); }) ?? (ta.select(), toast('Press Ctrl/Cmd+C to copy'));
  },
  'csv-order': () => {
    const o = orderCalc();
    const rows = [['Item', 'Storage', 'Order qty', 'Pack', 'Units per pack', 'Menu needs', 'On hand', 'Par'], ...o.lines.filter(l => l.qty > 0).map(l => [l.it.name, l.it.loc, l.qty, l.it.packName || l.it.unit, l.it.packSize || 1, round(l.need), round(l.it.onHand), l.it.par])];
    download(`order-${ui.orderFrom}.csv`, rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  },
  'save-order': () => { const o = orderCalc(); S().orders.push({ at: Date.now(), from: ui.orderFrom, lines: o.lines.filter(l => l.qty > 0).map(l => ({ inv: l.it.id, qty: l.qty })) }); ui.orderEdits = {}; save(); toast('Saved as sent'); render(); },
  'refresh-menu': () => { loadWeek(monday(ui.date), true); toast('Reloading menu…'); },
  'add-class': () => { S().classes.push({ id: 'c' + uid(), grade: '', teacher: '' }); save(); render(); },
  'del-class': el => { const s = S(); s.classes = s.classes.filter(c => c.id !== el.dataset.id); save(); render(); },
  export: () => { state.lastBackup = Date.now(); save(); download(`kitchen-backup-${todayIso()}.json`, JSON.stringify(state, null, 1), 'application/json'); render(); },
  lock: () => lockNow(),
  'pin-key': el => pinKey(el.dataset.k),
  'pin-back': () => { lock.entry = lock.entry.slice(0, -1); renderLock(); },
  'pin-forgot': () => { lock.resetStep = true; renderLock(); document.getElementById('pin-reset-text')?.focus(); },
  'clear-examples': el => {
    if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = 'Click again to clear counts, history and activity'; return; }
    const s = S(); s.counts = {}; s.history = []; s.log = []; s.served = {}; s.extrasOverride = {}; s.orders = []; s.example = false;
    for (const it of s.inventory) it.onHand = 0;
    save(); toast('Example data cleared. Do a shelf count to set real stock.'); render();
  },
  reset: el => {
    if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = 'Click again to erase everything and reload the demo'; return; }
    state = makeSeed(); save(); ui.tab = 'week'; render();
  },
  'add-school': () => {
    const id = 'school-' + uid(), base = makeSeed().schools['happy-hollow'];
    state.schools[id] = { ...base, id, name: 'New school', mvSlug: '', example: false, classes: [], counts: {}, history: [], log: [], served: {}, menus: {}, menusFetched: {}, orders: [], extrasOverride: {}, inventory: base.inventory.map(i => ({ ...i, onHand: 0 })) };
    state.current = id; save(); toast('School added. Set its name and MealViewer ID.'); render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el, e); }
});

document.addEventListener('input', e => {
  const t = e.target, s = S();
  if (t.dataset.cnt) {
    const [cid, key] = t.dataset.cnt.split('|'), c = dayCounts(ui.date);
    const row = cid === 'staff' ? c.staff : (c.classes[cid] ||= {});
    if (t.value === '') delete row[key]; else row[key] = Math.max(0, +t.value);
    if (cid !== 'staff' && !Object.keys(row).length) delete c.classes[cid];
    save(); updateCountTotals(); return;
  }
  if (t.dataset.bcount !== undefined) { dayCounts(ui.date).breakfast = t.value === '' ? null : +t.value; save(); return; }
  if (t.id === 'inv-search') { ui.invSearch = t.value; const pos = t.selectionStart; render(); const n = document.getElementById('inv-search'); n.focus(); n.setSelectionRange(pos, pos); return; }
  if (t.dataset.ri !== undefined) { const g = ui.recipeEdit.ingredients[+t.dataset.ri]; g[t.dataset.f] = t.dataset.f === 'qty' ? +t.value : t.value; return; }
  if (t.id === 'ri-notes') { ui.recipeEdit.notes = t.value; return; }
});

document.addEventListener('change', e => {
  const t = e.target, s = S();
  if (t.dataset.extra) { (s.extrasOverride[ui.date] ||= {})[t.dataset.extra] = Math.max(0, +t.value || 0); save(); render(); }
  else if (t.dataset.par) { invById(t.dataset.par).par = +t.value || 0; save(); render(); }
  else if (t.dataset.orderqty) { ui.orderEdits[t.dataset.orderqty] = +t.value || 0; render(); }
  else if (t.id === 'tx-item') { ui.invAction.inv = t.value; render(); }
  else if (t.dataset.ri !== undefined && t.dataset.f === 'inv') render();
  else if (t.id === 'rep-from' || t.id === 'rep-to') { ui[t.id === 'rep-from' ? 'reportFrom' : 'reportTo'] = t.value; render(); }
  else if (t.id === 'order-from') { ui.orderFrom = t.value; render(); }
  else if (t.id === 'order-days') { s.settings.orderDays = Math.max(1, +t.value || 10); save(); render(); }
  else if (t.dataset.set) { s[t.dataset.set] = t.value.trim(); if (t.dataset.set === 'mvSlug') { s.menusFetched = {}; } save(); render(); }
  else if (t.dataset.setn) { s.settings[t.dataset.setn] = +t.value || 0; save(); }
  else if (t.dataset.est) { s.settings.estimate[t.dataset.est] = +t.value || 0; save(); }
  else if (t.id === 'alts') { s.alternates = t.value.split('\n').map(x => x.trim()).filter(Boolean); save(); render(); }
  else if (t.dataset.cls) { s.classes.find(c => c.id === t.dataset.cls)[t.dataset.f] = t.value.trim(); save(); }
  else if (t.id === 'pin-idle') { state.pin.idleMin = +t.value; save(); toast('Saved'); }
  else if (t.id === 'school-switch') { state.current = t.value; save(); render(); }
  else if (t.id === 'import-file' && t.files[0]) {
    t.files[0].text().then(txt => { const j = JSON.parse(txt); if (!j.schools) throw new Error(); state = j; save(); toast('Backup restored'); render(); }).catch(() => toast("That file isn't a Kitchen Manager backup."));
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.dataset.form, s = S(), v = id => document.getElementById(id).value;
  if (f === 'pin-reset') {
    if (v('pin-reset-text').trim().toUpperCase() !== 'RESET PIN') { lock.msg = 'Type RESET PIN exactly to confirm.'; return renderLock(); }
    state.pin = null; state.pinResetAt = Date.now(); save(); unlock(); toast('PIN removed. Set a new one in Settings.');
  } else if (f === 'pin-set' || f === 'pin-change') {
    if (f === 'pin-change' && !(await checkPin(v('pin-cur')))) return toast('Current PIN is wrong.');
    if (!validPin(v('pin-new'))) return toast('Use 4 to 6 digits.');
    if (v('pin-new') !== v('pin-new2')) return toast("The two PINs don't match.");
    await setPin(v('pin-new')); delete state.pinResetAt; save(); render();
    toast(f === 'pin-set' ? 'PIN is on. Use Lock at the top to test it.' : 'PIN changed');
  } else if (f === 'pin-remove') {
    if (!(await checkPin(v('pin-cur2')))) return toast('Current PIN is wrong.');
    state.pin = null; save(); render(); toast('PIN turned off');
  } else if (f === 'inv-tx') {
    const it = invById(v('tx-item')), type = ui.invAction.type;
    let q = +v('tx-qty'); if (!(q >= 0)) return;
    if (type === 'count') { logTx(it.id, 'count', q - it.onHand, v('tx-note') || 'Shelf count', v('tx-date')); toast(`${it.name}: set to ${fmtQty(it, it.onHand)}`); }
    else {
      if (document.getElementById('tx-unit')?.value === 'pack') q *= it.packSize;
      logTx(it.id, type, type === 'restock' ? q : -q, v('tx-note'), v('tx-date'));
      toast(`${it.name}: ${type === 'restock' ? 'added' : 'removed'} ${fmtQty(it, q)}`);
    }
    save(); render(); document.getElementById('tx-qty')?.focus();
  } else if (f === 'new-item') {
    const id = norm(v('ni-name')).replace(/\W+/g, '-') + '-' + uid().slice(0, 3);
    s.inventory.push({ id, name: v('ni-name').trim(), loc: v('ni-loc'), unit: v('ni-unit').trim(), packName: v('ni-pack').trim() || '', packSize: +v('ni-packsize') || 0, par: +v('ni-par') || 0, onHand: 0 });
    const oh = +v('ni-onhand'); if (oh) logTx(id, 'count', oh, 'Starting count');
    ui.invAction = null; save(); toast('Item added'); render();
  } else if (f === 'tip') {
    const ed = ui.tipEdit, t = tipStore(), vals = { title: v('tip-title').trim(), match: v('tip-match').trim(), text: v('tip-text').trim() };
    if (ed.starter) t.edits[ed.id] = vals;
    else if (ed.id) Object.assign(t.custom.find(x => x.id === ed.id), vals);
    else t.custom.unshift({ id: 'tip-' + uid(), ...vals });
    ui.tipEdit = null; save(); toast('Tip saved'); render();
  } else if (f === 'recipe') {
    const ed = ui.recipeEdit;
    ed.ingredients = ed.ingredients.filter(g => g.inv && g.qty > 0);
    s.recipes[norm(ed.name)] = ed; ui.recipeEdit = null; save(); toast(`Saved recipe for ${ed.name}`); render();
  }
});

/* ---------- start ---------- */
state = load();
try { const u = JSON.parse(localStorage.getItem(STORE_KEY + ':ui') || '{}'); if (u.tab) ui.tab = u.tab; if (u.date) ui.date = u.date; } catch (e) { }
ui.date = nextSchoolDay(ui.date || todayIso());
render();
lockNow();

document.addEventListener('keydown', e => {
  if (!lock.locked && (e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('keydown', e => {
  if (!lock.locked || e.target.closest?.('input')) return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); pinKey(e.key); }
  else if (e.key === 'Backspace') { e.preventDefault(); lock.entry = lock.entry.slice(0, -1); renderLock(); }
});
for (const ev of ['pointerdown', 'keydown', 'input', 'scroll']) addEventListener(ev, () => { if (!lock.locked) lock.last = Date.now(); }, { passive: true, capture: true });
setInterval(() => {
  if (state.pin?.idleMin && !lock.locked && Date.now() - lock.last > state.pin.idleMin * 60000) lockNow();
}, 15000);
