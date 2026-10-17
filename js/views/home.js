// Accueil : la synthèse du jour.
import { get } from '../store.js';
import {
  esc, today, fmtLongDate, fmtDate, nextSunday, countdown, diffDays, startOfWeek,
} from '../util.js';
import { bindActions, header, empty } from '../ui.js';
import { icon } from '../icons.js';
import {
  todayTasks, weekTasks, weekOnlyTasks, taskList, taskActions, addTask, saveTasks,
} from '../tasks.js';
import { quoteOfTheDay } from '../quotes.js';
import * as google from '../integrations/google.js';
import * as ms from '../integrations/microsoft.js';
import { ispEventsOn, ispEventHref, ispEventLabel } from './isp.js';
import { sessionsOn, sessionLine, nextSession, sessionActions } from './sport.js';
import { birthdaysOn } from './perso.js';

function greeting() {
  const h = new Date().getHours();
  return h < 18 ? 'Bonjour' : 'Bonsoir';
}

function appointments(d) {
  const rows = [];
  for (const e of google.eventsOn(d)) {
    rows.push(`
      <li class="item event">
        <span class="cal-dot" style="background:${esc(e.color)}"></span>
        <span class="event-time">${e.allDay ? 'Journée' : esc(e.start)}</span>
        <span class="item-main static">
          <span class="item-title">${esc(e.title)}</span>
          <span class="item-meta">${esc(e.calName)}${e.location ? ` · ${esc(e.location)}` : ''}</span>
        </span>
      </li>`);
  }
  for (const e of ispEventsOn(d)) {
    rows.push(`
      <li class="item event">
        <span class="cal-dot isp"></span>
        <span class="event-time">${e.time ? esc(e.time) : 'ISP'}</span>
        <a class="item-main" href="${ispEventHref(e)}">
          <span class="item-title">${esc(e.title)}</span>
          <span class="item-meta">${esc(ispEventLabel(e))}</span>
        </a>
      </li>`);
  }
  for (const b of birthdaysOn(d)) {
    rows.push(`
      <li class="item event">
        <span class="cal-dot birthday"></span>
        <span class="event-time">Anniv.</span>
        <span class="item-main static"><span class="item-title">${esc(b.name)}${b.age ? ` · ${b.age} ans` : ''}</span></span>
      </li>`);
  }

  let status = '';
  if (!google.isConfigured()) {
    status = `<p class="hint">Google Agenda n'est pas encore relié. <a href="#/reglages">Le connecter</a></p>`;
  } else if (!google.tokenValid()) {
    status = `<button class="link-btn" data-act="gcal-connect">${icon('refresh', 15)} Actualiser l'agenda</button>`;
  }
  return `${rows.length ? `<ul class="list">${rows.join('')}</ul>` : empty('Aucun rendez-vous aujourd\'hui.')}${status}`;
}

function sport(d) {
  const sessions = sessionsOn(d);
  const goal = get().sport.goal;
  const goalLine = goal.date && diffDays(d, goal.date) >= 0
    ? `<p class="goal-line">${esc(goal.name || 'Objectif')} · <strong>${countdown(goal.date)}</strong></p>` : '';
  if (sessions.length) return `<ul class="list">${sessions.map((s) => sessionLine(s)).join('')}</ul>${goalLine}`;
  const next = nextSession(d);
  return `${empty('Pas de séance prévue : jour de repos.')}${next ? `<p class="hint">Prochaine séance : ${esc(fmtDate(next.date, { weekday: 'long' }))} — ${esc(next.title || next.type)}</p>` : ''}${goalLine}`;
}

export function render() {
  const s = get();
  const d = today();
  const q = quoteOfTheDay(d);
  const todays = todayTasks();
  const week = weekTasks();
  const floating = weekOnlyTasks();
  const doneCount = todays.filter((t) => t.done).length;
  const weekAll = [...floating, ...week];
  const weekDone = weekAll.filter((t) => t.done).length;

  const msPaused = ms.isConfigured() && s.settings.ms.listPerso && !ms.isConnected();
  const pending = google.isConfigured() && !google.remindersReady() ? google.pendingReminders() : 0;

  return `
    ${header(`${greeting()} ${s.settings.name || ''}`, { subtitle: esc(fmtLongDate(d)) })}
    ${pending ? `<button class="banner" data-act="gcal-connect">${icon('bell', 16)} ${pending > 1 ? `${pending} éléments en attente` : '1 élément en attente'} d'envoi à Google — <strong>actualiser</strong></button>` : ''}
    ${msPaused ? `<button class="banner" data-act="ms-reconnect">${icon('refresh', 16)} Synchronisation To Do en pause — <strong>reconnecter</strong></button>` : ''}

    <section class="card">
      <div class="card-head">
        <h2>Tâches du jour</h2>
        <span class="muted">${todays.length ? `${doneCount}/${todays.length}` : ''}</span>
        <button class="icon-btn small" data-act="add-task" data-due="${d}" aria-label="Ajouter une tâche pour aujourd'hui">${icon('plus', 18)}</button>
      </div>
      ${todays.length ? taskList(todays) : empty('Rien de prévu aujourd\'hui.')}
    </section>

    <section class="card">
      <div class="card-head"><h2>Rendez-vous</h2></div>
      ${appointments(d)}
    </section>

    <section class="card">
      <div class="card-head"><h2>Séance du jour</h2><a class="muted" href="#/sport">Planning</a></div>
      ${sport(d)}
    </section>

    <figure class="quote">
      <blockquote>${esc(q.text)}</blockquote>
      <figcaption>${esc(q.author)}</figcaption>
    </figure>

    <section class="card">
      <div class="card-head">
        <h2>Cette semaine</h2>
        <span class="muted">${weekAll.length ? `${weekDone}/${weekAll.length}` : ''}</span>
        <button class="icon-btn small" data-act="add-task" data-week="${startOfWeek(d)}" aria-label="Ajouter une tâche pour la semaine">${icon('plus', 18)}</button>
      </div>
      <form class="inline-add" data-form="week-add">
        <input id="week-input" name="title" placeholder="Nouvelle tâche…" autocomplete="off" enterkeyhint="done" aria-label="Nouvelle tâche pour la semaine">
        <button class="btn primary" type="submit">Ajouter</button>
      </form>
      ${floating.length ? `<h3 class="subhead">À faire dans la semaine</h3>${taskList(floating, { hideThisWeek: true })}` : ''}
      ${week.length ? `<h3 class="subhead">Prévues d'ici ${esc(fmtDate(nextSunday(d), { weekday: 'long', day: 'numeric' }))}</h3>${taskList(week)}` : ''}
      ${weekAll.length ? '' : empty('Aucune autre tâche cette semaine.')}
    </section>`;
}

export function mount(root) {
  root.querySelector('[data-form="week-add"]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = e.target.elements.title.value.trim();
    if (!title) return;
    addTask({ title, week: startOfWeek(today()) });
    saveTasks();
  });
  bindActions(root, {
    ...taskActions,
    ...sessionActions,
    'gcal-connect': () => google.connect('#/accueil'),
    'ms-reconnect': () => ms.connect('#/accueil'),
  });
}
