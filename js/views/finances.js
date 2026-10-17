// Finances : dépenses et revenus du mois, charges fixes récurrentes, épargne.
import { get, commit, save } from '../store.js';
import {
  esc, uid, today, monthKey, addMonths, fmtMonth, fmtMoney, fmtDate, daysInMonth,
} from '../util.js';
import { bindActions, header, empty, fab, openForm, toast } from '../ui.js';
import { icon } from '../icons.js';

const TABS = [['mois', 'Mois'], ['charges', 'Charges fixes'], ['epargne', 'Épargne']];

const fin = () => get().finances;
const catName = (id) => fin().categories.find((c) => c.id === id)?.name || 'Sans catégorie';

// Ajoute les charges fixes du mois (une seule fois par charge et par mois).
export function generateRecurring(key = monthKey()) {
  if (key > monthKey()) return;
  const f = fin();
  const done = f.generated[key] || [];
  let added = false;
  for (const r of f.recurring) {
    if (!r.active || !r.amount || done.includes(r.id) || (r.startMonth && r.startMonth > key)) continue;
    const day = Math.min(r.day || 1, daysInMonth(key));
    f.transactions.push({
      id: uid(), date: `${key}-${String(day).padStart(2, '0')}`, label: r.label, amount: r.amount,
      kind: r.kind, categoryId: r.categoryId, recurringId: r.id,
    });
    done.push(r.id);
    added = true;
  }
  f.generated[key] = done;
  if (added) save();
}

function categoryOptions(kind) {
  return fin().categories
    .filter((c) => !kind || c.kind === kind)
    .map((c) => ({ value: c.id, label: c.name, group: c.kind === 'revenu' ? 'Revenus' : 'Dépenses' }));
}

// ---------- Mois ----------

function monthTab(param) {
  const key = /^\d{4}-\d{2}$/.test(param || '') ? param : monthKey();
  generateRecurring(key);
  const tx = fin().transactions.filter((t) => t.date.startsWith(key)).sort((a, b) => b.date.localeCompare(a.date));
  const income = tx.filter((t) => t.kind === 'revenu').reduce((n, t) => n + t.amount, 0);
  const spent = tx.filter((t) => t.kind === 'depense').reduce((n, t) => n + t.amount, 0);

  const byCat = new Map();
  for (const t of tx.filter((x) => x.kind === 'depense')) byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + t.amount);
  const budgeted = fin().categories.filter((c) => c.kind === 'depense' && c.budget && !byCat.has(c.id));
  budgeted.forEach((c) => byCat.set(c.id, 0));
  const rows = [...byCat].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([id, v]) => Math.max(v, fin().categories.find((c) => c.id === id)?.budget || 0)));

  const meters = rows.map(([id, v]) => {
    const c = fin().categories.find((x) => x.id === id);
    const over = c?.budget && v > c.budget;
    return `
      <div class="meter-row" title="${esc(catName(id))} : ${fmtMoney(v)}${c?.budget ? ` sur ${fmtMoney(c.budget)} de budget` : ''}">
        <div class="meter-label"><span>${esc(catName(id))}</span>
          <span class="${over ? 'late' : ''}">${over ? `${icon('alert', 13)} ` : ''}${fmtMoney(v)}${c?.budget ? ` <span class="muted">/ ${fmtMoney(c.budget, true)}</span>` : ''}</span></div>
        <div class="meter"><span class="meter-fill ${over ? 'over' : ''}" style="width:${(v / max) * 100}%"></span>${c?.budget ? `<span class="meter-budget" style="left:${(c.budget / max) * 100}%"></span>` : ''}</div>
      </div>`;
  }).join('');

  const list = tx.map((t) => `
    <li class="item">
      <button class="item-main" data-act="tx-edit" data-id="${t.id}">
        <span class="item-title">${esc(t.label || catName(t.categoryId))}</span>
        <span class="item-meta">${esc(fmtDate(t.date, { day: 'numeric', month: 'short' }))} · ${esc(catName(t.categoryId))}${t.recurringId ? ' · charge fixe' : ''}</span>
      </button>
      <span class="amount ${t.kind === 'revenu' ? 'in' : ''}">${t.kind === 'revenu' ? '+' : '−'}${fmtMoney(t.amount)}</span>
    </li>`).join('');

  return `
    <div class="toolbar">
      <a class="icon-btn small" href="#/finances/mois/${addMonths(key, -1)}" aria-label="Mois précédent">${icon('chevronLeft', 18)}</a>
      <strong>${esc(fmtMonth(key))}</strong>
      <a class="icon-btn small" href="#/finances/mois/${addMonths(key, 1)}" aria-label="Mois suivant">${icon('chevronRight', 18)}</a>
    </div>
    <div class="tiles">
      <div class="tile"><p class="tile-label">Revenus</p><p class="tile-value">${fmtMoney(income, true)}</p></div>
      <div class="tile"><p class="tile-label">Dépenses</p><p class="tile-value">${fmtMoney(spent, true)}</p></div>
      <div class="tile"><p class="tile-label">Reste</p><p class="tile-value ${income - spent < 0 ? 'late' : ''}">${fmtMoney(income - spent, true)}</p></div>
    </div>
    ${rows.length ? `<section class="card"><div class="card-head"><h2>Dépenses par catégorie</h2></div>${meters}</section>` : ''}
    <section class="card">
      <div class="card-head"><h2>Opérations</h2><span class="muted">${tx.length}</span></div>
      ${tx.length ? `<ul class="list">${list}</ul>` : empty('Aucune opération ce mois-ci.')}
    </section>
    ${fab('tx-add', 'Ajouter une opération', `data-month="${key}"`)}`;
}

function txForm(t, month) {
  const defDate = month === monthKey() || !month ? today() : `${month}-01`;
  openForm({
    title: t ? 'Modifier l\'opération' : 'Nouvelle opération',
    fields: [
      { name: 'kind', label: 'Type', type: 'select', value: t?.kind || 'depense', options: [{ value: 'depense', label: 'Dépense' }, { value: 'revenu', label: 'Revenu' }] },
      { name: 'amount', label: 'Montant (€)', type: 'number', required: true, min: 0, value: t?.amount },
      { name: 'categoryId', label: 'Catégorie', type: 'select', value: t?.categoryId, options: categoryOptions() },
      { name: 'label', label: 'Libellé', value: t?.label, placeholder: 'Ex. : Courses Biocoop' },
      { name: 'date', label: 'Date', type: 'date', required: true, value: t?.date || defDate },
    ],
    onSubmit(v) {
      if (!(v.amount > 0)) { toast('Montant invalide'); return false; }
      const cat = fin().categories.find((c) => c.id === v.categoryId);
      if (cat && cat.kind !== v.kind) v.kind = cat.kind;
      if (t) Object.assign(t, v);
      else fin().transactions.push({ id: uid(), ...v });
      commit();
    },
    onDelete: t ? () => {
      if (!confirm('Supprimer cette opération ?')) return false;
      fin().transactions = fin().transactions.filter((x) => x !== t);
      commit();
    } : null,
  });
}

// ---------- Charges fixes et catégories ----------

function chargesTab() {
  const rec = [...fin().recurring].sort((a, b) => (a.day || 1) - (b.day || 1));
  const total = rec.filter((r) => r.active && r.kind === 'depense').reduce((n, r) => n + (r.amount || 0), 0);
  const income = rec.filter((r) => r.active && r.kind === 'revenu').reduce((n, r) => n + (r.amount || 0), 0);
  const cats = [...fin().categories].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'fr'));
  return `
    <div class="tiles">
      <div class="tile"><p class="tile-label">Charges fixes / mois</p><p class="tile-value">${fmtMoney(total, true)}</p></div>
      <div class="tile"><p class="tile-label">Revenus fixes / mois</p><p class="tile-value">${fmtMoney(income, true)}</p></div>
    </div>
    <p class="hint">Chaque charge fixe est ajoutée automatiquement aux opérations du mois, à son jour de prélèvement.</p>
    <ul class="list">${rec.map((r) => `
      <li class="item ${r.active ? '' : 'inactive'}">
        <button class="item-main" data-act="rec-edit" data-id="${r.id}">
          <span class="item-title">${esc(r.label)}</span>
          <span class="item-meta">le ${r.day || 1} du mois · ${esc(catName(r.categoryId))}${r.active ? '' : ' · en pause'}</span>
        </button>
        <span class="amount ${r.kind === 'revenu' ? 'in' : ''}">${r.amount ? fmtMoney(r.amount) : '<span class="late">à renseigner</span>'}</span>
      </li>`).join('')}</ul>
    <button class="btn ghost" data-act="rec-add">${icon('plus', 16)} Ajouter une charge ou un revenu fixe</button>

    <section class="card">
      <div class="card-head"><h2>Catégories et budgets</h2></div>
      <ul class="list">${cats.map((c) => `
        <li class="item"><button class="item-main" data-act="cat-edit" data-id="${c.id}">
          <span class="item-title">${esc(c.name)}</span>
          <span class="item-meta">${c.kind === 'revenu' ? 'Revenu' : 'Dépense'}${c.budget ? ` · budget ${fmtMoney(c.budget, true)} / mois` : ''}</span>
        </button></li>`).join('')}</ul>
      <button class="btn ghost" data-act="cat-add">${icon('plus', 16)} Nouvelle catégorie</button>
    </section>`;
}

function recForm(r) {
  openForm({
    title: r ? r.label : 'Nouvelle charge fixe',
    fields: [
      { name: 'label', label: 'Libellé', required: true, value: r?.label, placeholder: 'Ex. : Loyer' },
      { name: 'amount', label: 'Montant mensuel (€)', type: 'number', min: 0, value: r?.amount },
      { name: 'categoryId', label: 'Catégorie', type: 'select', value: r?.categoryId, options: categoryOptions() },
      { name: 'day', label: 'Jour du prélèvement', type: 'number', step: 1, min: 1, value: r?.day || 1 },
      { name: 'active', label: 'Active', type: 'checkbox', value: r ? r.active : true },
    ],
    onSubmit(v) {
      const kind = fin().categories.find((c) => c.id === v.categoryId)?.kind || 'depense';
      const day = Math.min(31, Math.max(1, Math.round(v.day || 1)));
      if (r) Object.assign(r, v, { kind, day });
      else fin().recurring.push({ id: uid(), ...v, kind, day, startMonth: monthKey() });
      commit();
    },
    onDelete: r ? () => {
      if (!confirm(`Supprimer « ${r.label} » ? Les opérations déjà créées sont conservées.`)) return false;
      fin().recurring = fin().recurring.filter((x) => x !== r);
      commit();
    } : null,
  });
}

function catForm(c) {
  const used = c && (fin().transactions.some((t) => t.categoryId === c.id) || fin().recurring.some((r) => r.categoryId === c.id));
  openForm({
    title: c ? c.name : 'Nouvelle catégorie',
    fields: [
      { name: 'name', label: 'Nom', required: true, value: c?.name },
      { name: 'kind', label: 'Type', type: 'select', value: c?.kind || 'depense', options: [{ value: 'depense', label: 'Dépense' }, { value: 'revenu', label: 'Revenu' }] },
      { name: 'budget', label: 'Budget mensuel (€, facultatif)', type: 'number', min: 0, value: c?.budget },
    ],
    onSubmit(v) {
      if (c) Object.assign(c, v);
      else fin().categories.push({ id: uid(), ...v });
      commit();
    },
    onDelete: c && !used ? () => {
      fin().categories = fin().categories.filter((x) => x !== c);
      commit();
    } : null,
  });
}

// ---------- Épargne ----------

function savingsTab() {
  const accounts = fin().savings;
  const total = accounts.reduce((n, a) => n + (a.balance || 0), 0);
  return `
    <div class="tiles"><div class="tile wide"><p class="tile-label">Épargne totale</p><p class="tile-value big">${fmtMoney(total, true)}</p></div></div>
    ${accounts.map((a) => {
      const last = a.history[a.history.length - 1];
      const prev = a.history[a.history.length - 2];
      const delta = last && prev ? last.balance - prev.balance : null;
      const pct = a.ceiling ? Math.min(100, (a.balance / a.ceiling) * 100) : null;
      return `
        <section class="card saving">
          <div class="card-head">
            <h2>${esc(a.name)}</h2>
            <button class="icon-btn small" data-act="sav-edit" data-id="${a.id}" aria-label="Modifier ${esc(a.name)}">${icon('settings', 16)}</button>
          </div>
          <p class="tile-value">${fmtMoney(a.balance)}</p>
          ${delta != null ? `<p class="muted small">${delta >= 0 ? '+' : '−'}${fmtMoney(Math.abs(delta))} depuis le ${esc(fmtDate(prev.date, { day: 'numeric', month: 'short' }))}</p>` : ''}
          ${pct != null ? `<div class="meter" title="${Math.round(pct)} % du plafond"><span class="meter-fill" style="width:${pct}%"></span></div>
            <p class="muted small">${Math.round(pct)} % du plafond de ${fmtMoney(a.ceiling, true)}</p>` : ''}
          <p class="muted small">${last ? `Solde mis à jour le ${esc(fmtDate(last.date, { day: 'numeric', month: 'long', year: 'numeric' }))}` : 'Solde jamais renseigné'}</p>
          <button class="btn ghost" data-act="sav-update" data-id="${a.id}">Mettre à jour le solde</button>
        </section>`;
    }).join('')}
    <button class="btn ghost" data-act="sav-add">${icon('plus', 16)} Ajouter un placement</button>`;
}

function savingUpdate(a) {
  openForm({
    title: `Solde ${a.name}`,
    fields: [
      { name: 'balance', label: 'Nouveau solde (€)', type: 'number', required: true, value: a.balance },
      { name: 'date', label: 'Date', type: 'date', required: true, value: today() },
    ],
    onSubmit(v) {
      a.history.push({ date: v.date, balance: v.balance });
      a.history.sort((x, y) => x.date.localeCompare(y.date));
      a.balance = a.history[a.history.length - 1].balance;
      commit();
    },
  });
}

function savingForm(a) {
  openForm({
    title: a ? a.name : 'Nouveau placement',
    fields: [
      { name: 'name', label: 'Nom', required: true, value: a?.name, placeholder: 'Ex. : Livret Jeune, PEA…' },
      { name: 'ceiling', label: 'Plafond (€, facultatif)', type: 'number', min: 0, value: a?.ceiling },
    ],
    onSubmit(v) {
      if (a) Object.assign(a, v);
      else fin().savings.push({ id: uid(), ...v, balance: 0, history: [] });
      commit();
    },
    onDelete: a ? () => {
      if (!confirm(`Supprimer ${a.name} et son historique ?`)) return false;
      fin().savings = fin().savings.filter((x) => x !== a);
      commit();
    } : null,
  });
}

// ---------- Vue ----------

export function render(sub = 'mois', param) {
  const tab = TABS.some(([k]) => k === sub) ? sub : 'mois';
  const body = { mois: () => monthTab(param), charges: chargesTab, epargne: savingsTab }[tab]();
  return `${header('Finances', { tabs: TABS, active: tab, base: 'finances' })}${body}`;
}

export function mount(root) {
  const find = (list, id) => list.find((x) => x.id === id);
  bindActions(root, {
    'tx-add': (d) => txForm(null, d.month),
    'tx-edit': (d) => txForm(find(fin().transactions, d.id)),
    'rec-add': () => recForm(null),
    'rec-edit': (d) => recForm(find(fin().recurring, d.id)),
    'cat-add': () => catForm(null),
    'cat-edit': (d) => catForm(find(fin().categories, d.id)),
    'sav-add': () => savingForm(null),
    'sav-edit': (d) => savingForm(find(fin().savings, d.id)),
    'sav-update': (d) => savingUpdate(find(fin().savings, d.id)),
  });
}
