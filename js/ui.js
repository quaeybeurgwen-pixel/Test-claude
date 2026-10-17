// Composants d'interface : feuille modale, formulaire générique, message éphémère.
import { esc } from './util.js';
import { icon } from './icons.js';

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

let current = null;

export function closeSheet() {
  if (!current) return;
  const el = current;
  current = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 200);
}

// Ouvre une feuille montant du bas de l'écran ; renvoie l'élément de contenu.
export function openSheet(title, html) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Fermer">${icon('close')}</button>
      </div>
      <div class="sheet-body">${html}</div>
    </div>`;
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) closeSheet();
  });
  document.body.appendChild(wrap);
  current = wrap;
  requestAnimationFrame(() => wrap.classList.add('open'));
  return wrap.querySelector('.sheet-body');
}

function fieldHtml(f) {
  const id = `f-${f.name}`;
  const req = f.required ? 'required' : '';
  const val = f.value ?? '';
  const label = `<label for="${id}">${esc(f.label)}</label>`;
  const hint = f.hint ? `<small class="hint">${esc(f.hint)}</small>` : '';
  switch (f.type) {
    case 'textarea':
      return `<div class="field">${label}<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" ${req} placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>${hint}</div>`;
    case 'select': {
      const groups = new Map();
      for (const o of f.options) {
        const g = o.group || '';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(o);
      }
      const opt = (o) => `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`;
      const inner = [...groups].map(([g, list]) => (g
        ? `<optgroup label="${esc(g)}">${list.map(opt).join('')}</optgroup>`
        : list.map(opt).join(''))).join('');
      return `<div class="field">${label}<select id="${id}" name="${f.name}" ${req}>${inner}</select>${hint}</div>`;
    }
    case 'checkbox':
      return `<div class="field field-check"><input type="checkbox" id="${id}" name="${f.name}" ${val ? 'checked' : ''}><label for="${id}">${esc(f.label)}</label>${hint}</div>`;
    case 'number':
      return `<div class="field">${label}<input type="number" id="${id}" name="${f.name}" value="${esc(val)}" step="${f.step || 'any'}" inputmode="decimal" ${f.min != null ? `min="${f.min}"` : ''} ${req} placeholder="${esc(f.placeholder || '')}">${hint}</div>`;
    default:
      return `<div class="field">${label}<input type="${f.type || 'text'}" id="${id}" name="${f.name}" value="${esc(val)}" ${req} placeholder="${esc(f.placeholder || '')}" autocomplete="off">${hint}</div>`;
  }
}

function readValues(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else out[f.name] = el.value.trim() === '' ? null : el.value.trim();
  }
  return out;
}

// Formulaire générique. onSubmit renvoie false pour garder la feuille ouverte.
export function openForm({ title, fields, submitLabel = 'Enregistrer', onSubmit, onDelete, deleteLabel = 'Supprimer', intro = '' }) {
  const body = openSheet(title, `
    <form class="form" novalidate>
      ${intro}
      ${fields.map(fieldHtml).join('')}
      <div class="form-actions">
        ${onDelete ? `<button type="button" class="btn ghost danger" data-delete>${esc(deleteLabel)}</button>` : ''}
        <button type="submit" class="btn primary">${esc(submitLabel)}</button>
      </div>
    </form>`);
  const form = body.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const missing = fields.find((f) => f.required && !form.elements[f.name]?.value.trim());
    if (missing) {
      toast(`« ${missing.label} » est obligatoire`);
      form.elements[missing.name].focus();
      return;
    }
    if ((await onSubmit(readValues(form, fields))) !== false) closeSheet();
  });
  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if ((await onDelete()) !== false) closeSheet();
  });
  return body;
}

// Délégation des clics sur les éléments portant data-act.
export function bindActions(root, actions) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = actions[el.dataset.act];
    if (fn) {
      e.preventDefault();
      fn(el.dataset, el, e);
    }
  });
}

export function header(title, { subtitle = '', tabs = null, active = '', base = '' } = {}) {
  const tabsHtml = tabs ? `
    <div class="subtabs" role="tablist">
      ${tabs.map(([key, label]) => `<a role="tab" href="#/${base}/${key}" class="${key === active ? 'active' : ''}" aria-selected="${key === active}">${esc(label)}</a>`).join('')}
    </div>` : '';
  return `
    <header class="top">
      <div>
        <h1>${esc(title)}</h1>
        ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
      </div>
      <a href="#/reglages" class="icon-btn" aria-label="Réglages">${icon('settings')}</a>
    </header>
    ${tabsHtml}`;
}

export function empty(text) {
  return `<p class="empty">${esc(text)}</p>`;
}

export function fab(act, label, data = '') {
  return `<button class="fab" data-act="${act}" ${data} aria-label="${esc(label)}">${icon('plus', 26)}</button>`;
}
