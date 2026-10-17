// Organisation personnelle : tâches, agenda, habitudes, courses, anniversaires.
import { get, commit } from '../store.js';
import {
  esc, uid, today, addDays, diffDays, fmtDate, fmtLongDate, relDay, MONTHS, parseYmd,
} from '../util.js';
import { bindActions, header, empty, fab, openForm, toast } from '../ui.js';
import { icon } from '../icons.js';
import { sortTasks, taskList, taskActions } from '../tasks.js';
import * as google from '../integrations/google.js';
import { ispEventsOn, ispEventHref, ispEventLabel } from './isp.js';
import { sessionsOn } from './sport.js';

const TABS = [['taches', 'Tâches'], ['agenda', 'Agenda'], ['habitudes', 'Habitudes'], ['courses', 'Courses'], ['anniversaires', 'Anniversaires']];

// ---------- Tâches ----------

// Liste de tâches groupée par période ; partagée avec l'onglet « Actions » de l'ISP.
export function groupedTasks(area, filter = () => true) {
  const d = today();
  const sunday = addDays(d, 7 - ((parseYmd(d).getDay() + 6) % 7) - 1);
  const mine = get().tasks.filter((t) => t.area === area && filter(t));
  const open = mine.filter((t) => !t.done);
  const groups = [
    ['En retard', open.filter((t) => t.due && t.due < d)],
    ["Aujourd'hui", open.filter((t) => t.due === d)],
    ['Cette semaine', open.filter((t) => t.due > d && t.due <= sunday)],
    ['Plus tard', open.filter((t) => t.due > sunday)],
    ['Sans échéance', open.filter((t) => !t.due)],
    ['Terminées (7 derniers jours)', mine.filter((t) => t.done && t.doneAt && diffDays(t.doneAt, d) <= 7)],
  ].filter(([, list]) => list.length);
  if (!groups.length) return empty('Aucune tâche. Appuyez sur + pour en ajouter une.');
  return groups.map(([title, list]) => `
    <section class="group">
      <h3>${esc(title)} <span class="muted">${list.length}</span></h3>
      ${taskList(sortTasks(list))}
    </section>`).join('');
}

function tasksTab() {
  return `${groupedTasks('perso')}${fab('add-task', 'Ajouter une tâche', 'data-area="perso"')}`;
}

// ---------- Agenda ----------

function agendaTab() {
  const g = get().settings.google;
  if (!google.isConfigured()) {
    return `<div class="card"><p>Reliez votre Google Agenda pour voir ici vos rendez-vous, avec la couleur de chaque agenda.</p>
      <a class="btn primary" href="#/reglages">Configurer Google Agenda</a></div>`;
  }
  const cals = Object.entries(g.calendars);
  const legend = cals.length ? `
    <div class="chips-row">
      ${cals.map(([id, c]) => `<button class="chip-toggle ${c.show ? 'on' : ''}" data-act="toggle-cal" data-id="${esc(id)}" aria-pressed="${c.show}">
        <span class="cal-dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</button>`).join('')}
    </div>` : '';
  const status = google.tokenValid()
    ? `<button class="link-btn" data-act="gcal-refresh">${icon('refresh', 15)} Actualiser</button>`
    : `<button class="link-btn" data-act="gcal-connect">${icon('refresh', 15)} ${google.hasCache() ? 'Actualiser (reconnexion Google)' : 'Se connecter à Google'}</button>`;
  const last = google.lastFetch();

  const d = today();
  const days = [];
  for (let i = 0; i < 30; i += 1) {
    const day = addDays(d, i);
    const rows = [
      ...google.eventsOn(day).map((e) => `
        <li class="item event"><span class="cal-dot" style="background:${esc(e.color)}"></span>
          <span class="event-time">${e.allDay ? 'Journée' : `${esc(e.start)}<br><small>${esc(e.end)}</small>`}</span>
          <span class="item-main static"><span class="item-title">${esc(e.title)}</span>
          <span class="item-meta">${esc(e.calName)}${e.location ? ` · ${esc(e.location)}` : ''}</span></span></li>`),
      ...ispEventsOn(day).map((e) => `
        <li class="item event"><span class="cal-dot isp"></span><span class="event-time">${e.time ? esc(e.time) : 'ISP'}</span>
          <a class="item-main" href="${ispEventHref(e)}"><span class="item-title">${esc(e.title)}</span><span class="item-meta">${esc(ispEventLabel(e))}</span></a></li>`),
      ...sessionsOn(day).map((x) => `
        <li class="item event ${x.done ? 'done' : ''}"><span class="cal-dot sport"></span><span class="event-time">${x.time ? esc(x.time) : 'Sport'}</span>
          <a class="item-main" href="#/sport/planning/${day}"><span class="item-title">${esc(x.type)}${x.title ? ` · ${esc(x.title)}` : ''}</span>
          <span class="item-meta">${[x.distance != null ? `${String(x.distance).replace('.', ',')} km` : '', x.duration != null ? `${x.duration} min` : '', x.done ? 'réalisée' : ''].filter(Boolean).join(' · ')}</span></a></li>`),
      ...birthdaysOn(day).map((b) => `
        <li class="item event"><span class="cal-dot birthday"></span><span class="event-time">Anniv.</span>
          <span class="item-main static"><span class="item-title">${esc(b.name)}${b.age ? ` · ${b.age} ans` : ''}</span></span></li>`),
    ];
    if (rows.length) days.push(`<section class="group"><h3>${esc(relDay(day) === fmtDate(day) ? fmtLongDate(day) : `${relDay(day)} · ${fmtDate(day, { day: 'numeric', month: 'long' })}`)}</h3><ul class="list">${rows.join('')}</ul></section>`);
  }
  return `
    ${legend}
    <div class="toolbar">${status}${last ? `<span class="muted small">Mis à jour ${esc(new Date(last).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</span>` : ''}</div>
    ${days.length ? days.join('') : empty('Aucun rendez-vous dans les 30 prochains jours.')}`;
}

// ---------- Habitudes ----------

const HABITS = [
  { key: 'sleep', label: 'Sommeil', unit: 'h', step: 0.5, ok: (v, t) => v >= t.sleep, target: (t) => `${t.sleep} h` },
  { key: 'steps', label: 'Pas', unit: 'pas', step: 500, ok: (v, t) => v >= t.steps, target: (t) => `${t.steps.toLocaleString('fr-FR')} pas` },
  { key: 'relax', label: 'Détente / lecture', unit: 'min', step: 5, ok: (v, t) => v >= t.relax, target: (t) => `${t.relax} min le soir` },
];

function habitsTab(d) {
  const { targets, log } = get().habits;
  const entry = log[d] || {};
  const cards = HABITS.map((h) => {
    const v = entry[h.key];
    const ok = v != null && h.ok(v, targets);
    return `
      <div class="habit ${ok ? 'ok' : ''}">
        <div>
          <p class="habit-label">${esc(h.label)}</p>
          <p class="muted small">Objectif : ${esc(h.target(targets))}</p>
        </div>
        <div class="stepper">
          <button data-act="habit-step" data-key="${h.key}" data-delta="-${h.step}" aria-label="Moins">−</button>
          <input type="number" inputmode="decimal" id="habit-${h.key}" data-habit="${h.key}" value="${v ?? ''}" placeholder="—" aria-label="${esc(h.label)} (${h.unit})">
          <button data-act="habit-step" data-key="${h.key}" data-delta="${h.step}" aria-label="Plus">+</button>
        </div>
        <span class="habit-status" aria-label="${ok ? 'Objectif atteint' : 'Objectif non atteint'}">${ok ? icon('check', 18) : ''}</span>
      </div>`;
  }).join('');

  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
  const grid = `
    <table class="habit-grid">
      <thead><tr><th></th>${days.map((x) => `<th>${esc(fmtDate(x, { weekday: 'narrow' }))}<br><small>${parseYmd(x).getDate()}</small></th>`).join('')}</tr></thead>
      <tbody>${HABITS.map((h) => `<tr><th>${esc(h.label)}</th>${days.map((x) => {
        const v = log[x]?.[h.key];
        const ok = v != null && h.ok(v, targets);
        return `<td class="${ok ? 'ok' : v != null ? 'miss' : ''}" title="${v ?? ''}">${ok ? '●' : v != null ? '○' : '·'}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table>
    <p class="muted small">● objectif atteint · ○ renseigné mais non atteint · · non renseigné</p>`;

  return `
    <div class="toolbar">
      <button class="icon-btn small" data-act="habit-day" data-day="${addDays(d, -1)}" aria-label="Jour précédent">${icon('chevronLeft', 18)}</button>
      <strong>${esc(relDay(d) === fmtDate(d) ? fmtLongDate(d) : relDay(d))}</strong>
      <button class="icon-btn small" data-act="habit-day" data-day="${addDays(d, 1)}" ${d >= today() ? 'disabled' : ''} aria-label="Jour suivant">${icon('chevronRight', 18)}</button>
    </div>
    <section class="card">${cards}</section>
    <section class="card"><div class="card-head"><h2>7 derniers jours</h2></div>${grid}</section>
    <button class="btn ghost" data-act="habit-targets">Modifier les objectifs</button>
    <p class="hint">Les pas se saisissent à la main : une application web ne peut pas lire Apple Santé.</p>`;
}

function setHabit(day, key, value) {
  const { log } = get().habits;
  log[day] = { ...(log[day] || {}), [key]: value };
  commit();
}

// ---------- Courses ----------

function coursesTab() {
  const items = get().courses;
  const open = items.filter((c) => !c.done);
  const done = items.filter((c) => c.done);
  const row = (c) => `
    <li class="item task ${c.done ? 'done' : ''}">
      <button class="check ${c.done ? 'on' : ''}" data-act="course-toggle" data-id="${c.id}" aria-pressed="${c.done}" aria-label="${esc(c.label)}">${icon('check', 16)}</button>
      <span class="item-main static"><span class="item-title">${esc(c.label)}</span></span>
      <button class="icon-btn small" data-act="course-del" data-id="${c.id}" aria-label="Retirer ${esc(c.label)}">${icon('close', 16)}</button>
    </li>`;
  return `
    <form class="inline-add" data-form="course">
      <input id="course-input" name="label" placeholder="Ajouter un article…" autocomplete="off" enterkeyhint="done">
      <button class="btn primary" type="submit">Ajouter</button>
    </form>
    ${open.length ? `<ul class="list">${open.map(row).join('')}</ul>` : empty('La liste est vide.')}
    ${done.length ? `<section class="group"><h3>Dans le panier <span class="muted">${done.length}</span></h3><ul class="list">${done.map(row).join('')}</ul>
      <button class="btn ghost" data-act="course-clear">Vider le panier</button></section>` : ''}`;
}

// ---------- Anniversaires ----------

function nextOccurrence(b, from = today()) {
  const year = parseYmd(from).getFullYear();
  let d = `${year}-${b.date}`;
  if (b.date === '02-29' && new Date(year, 1, 29).getMonth() !== 1) d = `${year}-02-28`;
  if (d < from) d = `${year + 1}-${b.date === '02-29' ? '02-28' : b.date}`;
  return d;
}

export function birthdaysOn(day) {
  const md = day.slice(5);
  return get().birthdays
    .filter((b) => b.date === md)
    .map((b) => ({ ...b, age: b.year ? Number(day.slice(0, 4)) - b.year : null }));
}

function birthdaysTab() {
  const d = today();
  const list = get().birthdays
    .map((b) => ({ ...b, next: nextOccurrence(b, d) }))
    .sort((a, b) => a.next.localeCompare(b.next));
  return `
    ${list.length ? `<ul class="list">${list.map((b) => {
      const inDays = diffDays(d, b.next);
      const age = b.year ? Number(b.next.slice(0, 4)) - b.year : null;
      return `<li class="item"><button class="item-main" data-act="bday-edit" data-id="${b.id}">
        <span class="item-title">${esc(b.name)}</span>
        <span class="item-meta">${esc(fmtDate(b.next, { day: 'numeric', month: 'long' }))}${age ? ` · ${age} ans` : ''}</span></button>
        <span class="badge ${inDays <= 7 ? 'soon' : ''}">${inDays === 0 ? "Aujourd'hui" : `dans ${inDays} j`}</span></li>`;
    }).join('')}</ul>` : empty('Aucun anniversaire enregistré.')}
    ${fab('bday-add', 'Ajouter un anniversaire')}`;
}

function birthdayForm(b) {
  const [m, day] = b ? b.date.split('-').map(Number) : [null, null];
  openForm({
    title: b ? 'Modifier' : 'Nouvel anniversaire',
    fields: [
      { name: 'name', label: 'Prénom / nom', required: true, value: b?.name },
      { name: 'day', label: 'Jour', type: 'number', min: 1, step: 1, required: true, value: day },
      { name: 'month', label: 'Mois', type: 'select', value: m || 1, options: MONTHS.map((x, i) => ({ value: i + 1, label: x })) },
      { name: 'year', label: 'Année de naissance (facultatif)', type: 'number', step: 1, value: b?.year },
    ],
    onSubmit(v) {
      if (!(v.day >= 1 && v.day <= 31)) { toast('Jour invalide'); return false; }
      const date = `${String(v.month).padStart(2, '0')}-${String(v.day).padStart(2, '0')}`;
      if (b) Object.assign(b, { name: v.name, date, year: v.year });
      else get().birthdays.push({ id: uid(), name: v.name, date, year: v.year });
      commit();
    },
    onDelete: b ? () => {
      if (!confirm(`Supprimer l'anniversaire de ${b.name} ?`)) return false;
      get().birthdays = get().birthdays.filter((x) => x !== b);
      commit();
    } : null,
  });
}

// ---------- Vue ----------

const validDay = (p) => (/^\d{4}-\d{2}-\d{2}$/.test(p || '') && p <= today() ? p : today());

export function render(sub = 'taches', param) {
  const tab = TABS.some(([k]) => k === sub) ? sub : 'taches';
  const body = {
    taches: tasksTab, agenda: agendaTab, habitudes: () => habitsTab(validDay(param)), courses: coursesTab, anniversaires: birthdaysTab,
  }[tab]();
  return `${header('Organisation perso', { tabs: TABS, active: tab, base: 'perso' })}${body}`;
}

export function mount(root, sub, param) {
  const habitDay = validDay(param);
  bindActions(root, {
    ...taskActions,
    'toggle-cal': (d) => {
      const c = get().settings.google.calendars[d.id];
      c.show = !c.show;
      commit();
      if (c.show && google.tokenValid()) google.refresh().catch((e) => toast(e.message));
    },
    'gcal-refresh': () => google.refresh().then(() => toast('Agenda à jour')).catch((e) => toast(e.message)),
    'gcal-connect': () => google.connect('#/perso/agenda'),
    'habit-day': (d) => { location.hash = `#/perso/habitudes/${d.day}`; },
    'habit-step': (d) => {
      const cur = get().habits.log[habitDay]?.[d.key] ?? (d.key === 'sleep' ? get().habits.targets.sleep : 0);
      setHabit(habitDay, d.key, Math.max(0, Math.round((cur + Number(d.delta)) * 10) / 10));
    },
    'habit-targets': () => {
      const t = get().habits.targets;
      openForm({
        title: 'Objectifs',
        fields: [
          { name: 'sleep', label: 'Sommeil (heures)', type: 'number', value: t.sleep, required: true },
          { name: 'steps', label: 'Pas par jour', type: 'number', value: t.steps, required: true },
          { name: 'relax', label: 'Détente / lecture (minutes)', type: 'number', value: t.relax, required: true },
        ],
        onSubmit(v) { Object.assign(t, v); commit(); },
      });
    },
    'course-toggle': (d) => {
      const c = get().courses.find((x) => x.id === d.id);
      c.done = !c.done;
      commit();
    },
    'course-del': (d) => { get().courses = get().courses.filter((x) => x.id !== d.id); commit(); },
    'course-clear': () => { get().courses = get().courses.filter((x) => !x.done); commit(); },
    'bday-add': () => birthdayForm(null),
    'bday-edit': (d) => birthdayForm(get().birthdays.find((b) => b.id === d.id)),
  });

  root.querySelectorAll('[data-habit]').forEach((input) => {
    input.addEventListener('change', () => {
      setHabit(habitDay, input.dataset.habit, input.value === '' ? null : Number(input.value));
    });
  });

  root.querySelector('[data-form="course"]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = e.target.elements.label.value.trim();
    if (!label) return;
    get().courses.push({ id: uid(), label, done: false });
    commit();
  });
}
