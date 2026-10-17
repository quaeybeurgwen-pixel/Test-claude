// Sport : planning des séances (course à pied, crossfit…) et objectif marathon.
import { get, commit } from '../store.js';
import { esc, uid, today, addDays, diffDays, fmtDate, fmtLongDate, startOfWeek, countdown } from '../util.js';
import { bindActions, header, fab, openForm } from '../ui.js';
import { icon } from '../icons.js';
import { requestReminderSync, sessionState, isConfigured as googleConfigured } from '../integrations/google.js';

const TABS = [['planning', 'Planning'], ['objectif', 'Objectif']];
const TYPES = ['Course à pied', 'Crossfit', 'Renforcement', 'Mobilité / étirements', 'Vélo', 'Natation', 'Autre'];
const FEELINGS = ['', 'Très difficile', 'Difficile', 'Correct', 'Bien', 'Excellent'];

const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99');

export const sessionsOn = (day) => get().sport.sessions.filter((s) => s.date === day).sort(byTime);

export function nextSession(day) {
  return get().sport.sessions.filter((s) => s.date > day).sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b))[0];
}

function summary(s) {
  const dist = s.done && s.actualDistance != null ? s.actualDistance : s.distance;
  const dur = s.done && s.actualDuration != null ? s.actualDuration : s.duration;
  return [s.time, dist != null ? `${String(dist).replace('.', ',')} km` : '', dur != null ? `${dur} min` : ''].filter(Boolean).join(' · ');
}

const typeClass = (type) => (type === 'Course à pied' ? 'run' : type === 'Crossfit' ? 'crossfit' : 'other');

export function sessionLine(s) {
  return `
    <li class="item task ${s.done ? 'done' : ''}">
      <button class="check ${s.done ? 'on' : ''}" data-act="session-toggle" data-id="${s.id}" aria-pressed="${!!s.done}" aria-label="Séance faite : ${esc(s.title || s.type)}">${icon('check', 16)}</button>
      <button class="item-main" data-act="session-edit" data-id="${s.id}">
        <span class="item-title"><span class="chip chip-${typeClass(s.type)}">${esc(s.type)}</span>${esc(s.title || '')}</span>
        ${summary(s) ? `<span class="item-meta">${esc(summary(s))}</span>` : ''}
        ${s.details ? `<span class="item-meta details">${esc(s.details)}</span>` : ''}
        ${googleState(s)}
      </button>
    </li>`;
}

function googleState(s) {
  const st = googleConfigured() ? sessionState(s) : null;
  if (st === 'sent') return `<span class="item-meta with-icon">${icon('calendar', 13)}Dans Google Agenda ${icon('check', 12)}</span>`;
  if (st === 'pending') return `<span class="item-meta late with-icon">${icon('calendar', 13)}Pas encore envoyée à Google</span>`;
  return '';
}

function sessionForm(s, defaults = {}) {
  const v0 = s || { type: 'Course à pied', ...defaults };
  openForm({
    title: s ? 'Modifier la séance' : 'Nouvelle séance',
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, value: v0.date },
      { name: 'time', label: 'Heure (facultatif)', type: 'time', value: v0.time },
      { name: 'type', label: 'Type', type: 'select', value: v0.type, options: TYPES.map((t) => ({ value: t, label: t })) },
      { name: 'title', label: 'Intitulé', value: v0.title, placeholder: 'Ex. : Sortie longue, Fractionné 10×400 m, WOD…' },
      { name: 'details', label: 'Contenu de la séance', type: 'textarea', value: v0.details, placeholder: 'Échauffement 20 min, 6×1000 m à allure semi…' },
      { name: 'distance', label: 'Distance prévue (km)', type: 'number', value: v0.distance },
      { name: 'duration', label: 'Durée prévue (min)', type: 'number', step: 1, value: v0.duration },
      ...(s ? [
        { name: 'done', label: 'Séance réalisée', type: 'checkbox', value: s.done },
        { name: 'actualDistance', label: 'Distance réalisée (km)', type: 'number', value: s.actualDistance },
        { name: 'actualDuration', label: 'Durée réalisée (min)', type: 'number', step: 1, value: s.actualDuration },
        { name: 'feeling', label: 'Ressenti', type: 'select', value: s.feeling || '', options: FEELINGS.map((f, i) => ({ value: i || '', label: f || '—' })) },
        { name: 'notes', label: 'Notes', type: 'textarea', value: s.notes },
      ] : [
        { name: 'repeat', label: 'Répéter chaque semaine pendant… (nombre de semaines)', type: 'number', step: 1, min: 0, value: 0, hint: 'Pratique pour les séances de crossfit fixes.' },
      ]),
    ],
    onSubmit(v) {
      if (s) {
        Object.assign(s, v, { feeling: v.feeling ? Number(v.feeling) : null });
      } else {
        const { repeat, ...data } = v;
        for (let i = 0; i <= Math.min(repeat || 0, 52); i += 1) {
          get().sport.sessions.push({ id: uid(), ...data, date: addDays(v.date, 7 * i), done: false });
        }
      }
      commit();
      requestReminderSync();
    },
    onDelete: s ? () => {
      if (!confirm('Supprimer cette séance ?')) return false;
      if (s.gcal) get().gcalDeleted.push({ id: s.gcal.id, calId: s.gcal.calId });
      get().sport.sessions = get().sport.sessions.filter((x) => x !== s);
      commit();
      requestReminderSync();
    } : null,
  });
}

export const sessionActions = {
  'session-toggle': (d) => {
    const s = get().sport.sessions.find((x) => x.id === d.id);
    s.done = !s.done;
    commit();
  },
  'session-edit': (d) => sessionForm(get().sport.sessions.find((x) => x.id === d.id)),
};

// Kilomètres de course d'une semaine (prévus / réalisés).
function weekKm(monday) {
  const end = addDays(monday, 6);
  const runs = get().sport.sessions.filter((s) => s.type === 'Course à pied' && s.date >= monday && s.date <= end);
  const planned = runs.reduce((n, s) => n + (s.distance || 0), 0);
  const done = runs.filter((s) => s.done).reduce((n, s) => n + (s.actualDistance ?? s.distance ?? 0), 0);
  return { planned, done };
}

const km = (n) => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} km`;

function goalCard() {
  const g = get().sport.goal;
  if (!g.date) {
    return `<section class="card"><p>Renseignez la date de votre marathon pour afficher le compte à rebours.</p>
      <button class="btn primary" data-act="goal-edit">Définir l'objectif</button></section>`;
  }
  const d = diffDays(today(), g.date);
  return `
    <section class="card goal">
      <div>
        <p class="muted small">${esc(g.name || 'Objectif')}${g.target ? ` · objectif ${esc(g.target)}` : ''}</p>
        <p class="goal-count">${d >= 0 ? countdown(g.date) : 'Terminé'}</p>
        <p class="muted small">${esc(fmtLongDate(g.date))}${d > 0 ? ` · ${Math.floor(d / 7)} semaines et ${d % 7} j` : ''}</p>
      </div>
      <button class="icon-btn small" data-act="goal-edit" aria-label="Modifier l'objectif">${icon('settings', 18)}</button>
    </section>`;
}

function planningTab(param) {
  const monday = startOfWeek(/^\d{4}-\d{2}-\d{2}$/.test(param || '') ? param : today());
  const { planned, done } = weekKm(monday);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return `
    ${goalCard()}
    <div class="toolbar">
      <a class="icon-btn small" href="#/sport/planning/${addDays(monday, -7)}" aria-label="Semaine précédente">${icon('chevronLeft', 18)}</a>
      <strong>Semaine du ${esc(fmtDate(monday, { day: 'numeric', month: 'long' }))}</strong>
      <a class="icon-btn small" href="#/sport/planning/${addDays(monday, 7)}" aria-label="Semaine suivante">${icon('chevronRight', 18)}</a>
    </div>
    <p class="muted small center">Course : ${km(done)} réalisés sur ${km(planned)} prévus</p>
    ${days.map((day) => {
      const list = sessionsOn(day);
      return `
        <section class="day ${day === today() ? 'is-today' : ''}">
          <div class="day-head">
            <h3>${esc(fmtDate(day, { weekday: 'long', day: 'numeric' }))}</h3>
            <button class="icon-btn small" data-act="session-add" data-date="${day}" aria-label="Ajouter une séance le ${esc(fmtDate(day, { weekday: 'long', day: 'numeric' }))}">${icon('plus', 16)}</button>
          </div>
          ${list.length ? `<ul class="list">${list.map(sessionLine).join('')}</ul>` : '<p class="muted small rest">Repos</p>'}
        </section>`;
    }).join('')}
    ${fab('session-add', 'Ajouter une séance', `data-date="${today() >= monday && today() <= addDays(monday, 6) ? today() : monday}"`)}`;
}

function objectiveTab() {
  const thisMonday = startOfWeek(today());
  const weeks = Array.from({ length: 10 }, (_, i) => addDays(thisMonday, 7 * (i - 9)));
  const data = weeks.map((w) => ({ w, ...weekKm(w) }));
  const max = Math.max(1, ...data.map((x) => Math.max(x.done, x.planned)));
  const bars = data.map((x) => `
    <div class="bar-col" title="Semaine du ${esc(fmtDate(x.w, { day: 'numeric', month: 'short' }))} : ${km(x.done)} sur ${km(x.planned)} prévus" tabindex="0">
      <span class="bar-value">${x.done ? Math.round(x.done) : ''}</span>
      <span class="bar-track"><span class="bar-planned" style="height:${(x.planned / max) * 100}%"></span><span class="bar-fill" style="height:${(x.done / max) * 100}%"></span></span>
      <span class="bar-label">${esc(fmtDate(x.w, { day: 'numeric', month: 'numeric' }))}</span>
    </div>`).join('');
  const total = data.reduce((n, x) => n + x.done, 0);
  return `
    ${goalCard()}
    <section class="card">
      <div class="card-head"><h2>Kilomètres de course par semaine</h2></div>
      <div class="bars" role="img" aria-label="Kilomètres réalisés sur les 10 dernières semaines">${bars}</div>
      <p class="legend"><span class="key fill"></span>réalisés <span class="key planned"></span>prévus · total 10 semaines : ${km(total)}</p>
      <table class="sr-only"><caption>Kilomètres par semaine</caption><tr><th>Semaine</th><th>Réalisés</th><th>Prévus</th></tr>
        ${data.map((x) => `<tr><td>${esc(x.w)}</td><td>${km(x.done)}</td><td>${km(x.planned)}</td></tr>`).join('')}</table>
    </section>
    <section class="card">
      <div class="card-head"><h2>Strava / Garmin</h2></div>
      <p class="muted">La connexion à Strava est prévue dans une prochaine version : vos sorties Garmin remontent déjà dans Strava, ce qui permettra de cocher automatiquement les séances réalisées.</p>
    </section>`;
}

export function render(sub = 'planning', param) {
  const tab = TABS.some(([k]) => k === sub) ? sub : 'planning';
  return `${header('Sport', { tabs: TABS, active: tab, base: 'sport' })}${tab === 'planning' ? planningTab(param) : objectiveTab()}`;
}

export function mount(root) {
  bindActions(root, {
    ...sessionActions,
    'session-add': (d) => sessionForm(null, { date: d.date || today() }),
    'goal-edit': () => {
      const g = get().sport.goal;
      openForm({
        title: 'Objectif',
        fields: [
          { name: 'name', label: 'Course', value: g.name, placeholder: 'Ex. : Marathon de Paris' },
          { name: 'date', label: 'Date', type: 'date', value: g.date },
          { name: 'target', label: 'Temps visé', value: g.target, placeholder: 'Ex. : 3 h 45' },
        ],
        onSubmit(v) { Object.assign(g, v); commit(); },
      });
    },
  });
}
