// ISP : actions, échéances (concours, concours blancs…) avec actions datées, polycopiés, élèves.
import { get, commit } from '../store.js';
import { esc, uid, today, addDays, diffDays, fmtDate, fmtLongDate, countdown, relDay } from '../util.js';
import { bindActions, header, empty, fab, openForm, openSheet, toast } from '../ui.js';
import { icon } from '../icons.js';
import {
  addTask, removeTask, saveTasks, toggleTask, sortTasks, taskActions, findTask, updateTask,
} from '../tasks.js';
import { groupedTasks } from './perso.js';

const TABS = [['actions', 'Actions'], ['echeances', 'Échéances'], ['polycopies', 'Polycopiés'], ['eleves', 'Élèves']];

const TYPES = ['Concours', 'Concours blanc', 'Inscriptions', 'Résultats', 'Réunion', 'Autre'];

// Actions proposées automatiquement : [jours par rapport à la date, libellé].
const TEMPLATES = {
  Concours: [
    [-45, 'Rappeler la date et les modalités d\'inscription aux élèves'],
    [-30, 'Vérifier que tous les élèves sont inscrits'],
    [-14, 'Envoyer les conseils de préparation et les annales'],
    [-3, 'Message d\'encouragement et rappel des convocations'],
    [2, 'Recueillir les retours des élèves'],
  ],
  'Concours blanc': [
    [-21, 'Préparer et valider le sujet'],
    [-10, 'Réserver la salle et convoquer les élèves'],
    [-2, 'Imprimer les sujets'],
    [7, 'Corriger les copies'],
    [10, 'Communiquer les notes et le corrigé'],
  ],
  Inscriptions: [
    [-21, 'Annoncer la date limite d\'inscription aux élèves'],
    [-7, 'Relancer les élèves non inscrits'],
    [-1, 'Dernier rappel aux élèves'],
  ],
  Résultats: [
    [0, 'Consulter les résultats'],
    [1, 'Contacter les élèves'],
  ],
  Réunion: [[-2, 'Préparer l\'ordre du jour']],
  Autre: [[-1, 'Préparer']],
};

const offsetLabel = (n) => (n === 0 ? 'le jour J' : n < 0 ? `J${n}` : `J+${n}`);

export const ispEventsOn = (day) => get().isp.events.filter((e) => e.date === day);

const actionsOf = (ev) => sortTasks(get().tasks.filter((t) => t.sourceId === ev.id));

// ---------- Échéances ----------

function eventCard(ev) {
  const acts = actionsOf(ev);
  const done = acts.filter((t) => t.done).length;
  const next = acts.find((t) => !t.done);
  const d = diffDays(today(), ev.date);
  return `
    <li class="item">
      <button class="item-main" data-act="event-open" data-id="${ev.id}">
        <span class="item-title">${esc(ev.title)}</span>
        <span class="item-meta"><span class="chip">${esc(ev.type)}</span>${esc(fmtDate(ev.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }))}${ev.time ? ` · ${esc(ev.time)}` : ''}</span>
        ${acts.length ? `<span class="progress" aria-label="${done} actions sur ${acts.length}"><span style="width:${(done / acts.length) * 100}%"></span></span>` : ''}
        ${next ? `<span class="item-meta">Prochaine action : ${esc(next.title)} · ${next.due ? esc(relDay(next.due)) : ''}</span>` : ''}
      </button>
      <span class="badge ${d >= 0 && d <= 14 ? 'soon' : ''}">${countdown(ev.date)}</span>
    </li>`;
}

function eventsTab() {
  const d = today();
  const events = [...get().isp.events].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = events.filter((e) => e.date >= d);
  const past = events.filter((e) => e.date < d && diffDays(e.date, d) <= 90).reverse();
  return `
    ${upcoming.length ? `<ul class="list">${upcoming.map(eventCard).join('')}</ul>` : empty('Aucune échéance à venir. Ajoutez vos dates de concours, concours blancs, inscriptions…')}
    ${past.length ? `<details class="group"><summary>Passées (90 derniers jours) <span class="muted">${past.length}</span></summary><ul class="list">${past.map(eventCard).join('')}</ul></details>` : ''}
    ${fab('event-add', 'Ajouter une échéance')}`;
}

function setActionsFromTemplate(ev, reminder) {
  for (const [offset, title] of TEMPLATES[ev.type] || []) {
    // Une action dont la date est déjà passée est ramenée à aujourd'hui.
    const due = addDays(ev.date, offset) < today() ? today() : addDays(ev.date, offset);
    addTask({ title, area: 'isp', due, reminder, priority: offset >= -3 && offset <= 0 ? 'haute' : 'normale', sourceId: ev.id, offset });
  }
}

function eventForm(ev) {
  openForm({
    title: ev ? 'Modifier l\'échéance' : 'Nouvelle échéance',
    fields: [
      { name: 'title', label: 'Intitulé', required: true, value: ev?.title, placeholder: 'Ex. : Concours CRPE — écrits' },
      { name: 'type', label: 'Type', type: 'select', value: ev?.type || 'Concours', options: TYPES.map((t) => ({ value: t, label: t })) },
      { name: 'date', label: 'Date', type: 'date', required: true, value: ev?.date },
      { name: 'time', label: 'Heure (facultatif)', type: 'time', value: ev?.time },
      { name: 'notes', label: 'Notes', type: 'textarea', value: ev?.notes },
      ...(ev ? [] : [
        { name: 'template', label: 'Créer les actions types (modifiables ensuite)', type: 'checkbox', value: true },
        { name: 'reminder', label: 'Heure des rappels', type: 'time', value: '09:00' },
      ]),
    ],
    onSubmit(v) {
      if (ev) {
        const moved = v.date !== ev.date;
        Object.assign(ev, { title: v.title, type: v.type, date: v.date, time: v.time, notes: v.notes || '' });
        // Les actions non faites suivent le changement de date.
        if (moved) {
          for (const t of actionsOf(ev)) {
            if (!t.done && t.offset != null) updateTask(t.id, { due: addDays(ev.date, t.offset) });
          }
        }
      } else {
        const created = { id: uid(), title: v.title, type: v.type, date: v.date, time: v.time, notes: v.notes || '' };
        get().isp.events.push(created);
        if (v.template) setActionsFromTemplate(created, v.reminder);
      }
      saveTasks();
    },
    onDelete: ev ? () => {
      const acts = actionsOf(ev);
      if (!confirm(`Supprimer « ${ev.title} »${acts.length ? ` et ses ${acts.length} actions` : ''} ?`)) return false;
      acts.forEach((t) => removeTask(t.id));
      get().isp.events = get().isp.events.filter((x) => x !== ev);
      saveTasks();
    } : null,
  });
}

function eventDetail(id) {
  const ev = get().isp.events.find((e) => e.id === id);
  if (!ev) return;
  const body = openSheet(ev.title, '');
  const paint = () => {
    const acts = actionsOf(ev);
    body.innerHTML = `
      <p><span class="chip">${esc(ev.type)}</span> ${esc(fmtLongDate(ev.date))}${ev.time ? ` à ${esc(ev.time)}` : ''} · <strong>${countdown(ev.date)}</strong></p>
      ${ev.notes ? `<p class="notes">${esc(ev.notes)}</p>` : ''}
      <h3>Actions</h3>
      ${acts.length ? `<ul class="list">${acts.map((t) => `
        <li class="item task ${t.done ? 'done' : ''}">
          <button class="check ${t.done ? 'on' : ''}" data-a="toggle" data-id="${t.id}" aria-pressed="${t.done}" aria-label="${esc(t.title)}">${icon('check', 16)}</button>
          <button class="item-main" data-a="edit" data-id="${t.id}">
            <span class="item-title">${esc(t.title)}</span>
            <span class="item-meta">${t.offset != null ? `<span class="chip">${offsetLabel(t.offset)}</span>` : ''}${t.due ? esc(fmtDate(t.due)) : ''}${t.reminder ? ` · <span class="with-icon">${icon('bell', 13)}${esc(t.reminder)}</span>` : ''}</span>
          </button>
        </li>`).join('')}</ul>` : empty('Aucune action.')}
      <div class="form-actions">
        <button class="btn ghost" data-a="edit-event">Modifier l'échéance</button>
        <button class="btn primary" data-a="add">Ajouter une action</button>
      </div>`;
  };
  paint();
  body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a;
    if (a === 'toggle') { toggleTask(el.dataset.id); paint(); }
    if (a === 'edit') actionForm(ev, findTask(el.dataset.id));
    if (a === 'add') actionForm(ev, null);
    if (a === 'edit-event') eventForm(ev);
  });
}

function actionForm(ev, task) {
  openForm({
    title: task ? 'Modifier l\'action' : 'Nouvelle action',
    intro: `<p class="hint">Pour « ${esc(ev.title)} » (${esc(fmtDate(ev.date))}).</p>`,
    fields: [
      { name: 'title', label: 'Action', required: true, value: task?.title },
      { name: 'offset', label: 'Nombre de jours avant (−) ou après (+) la date', type: 'number', step: 1, value: task?.offset ?? -7, hint: 'Ex. : −7 = une semaine avant.' },
      { name: 'reminder', label: 'Heure du rappel', type: 'time', value: task?.reminder ?? '09:00' },
      { name: 'priority', label: 'Priorité', type: 'select', value: task?.priority || 'normale', options: [{ value: 'haute', label: 'Haute' }, { value: 'normale', label: 'Normale' }, { value: 'basse', label: 'Basse' }] },
    ],
    onSubmit(v) {
      const offset = v.offset ?? 0;
      const data = { title: v.title, offset, due: addDays(ev.date, offset), reminder: v.reminder, priority: v.priority };
      if (task) updateTask(task.id, data);
      else addTask({ ...data, area: 'isp', sourceId: ev.id });
      saveTasks();
      setTimeout(() => eventDetail(ev.id), 220);
    },
    onDelete: task ? () => {
      removeTask(task.id);
      saveTasks();
      setTimeout(() => eventDetail(ev.id), 220);
    } : null,
  });
}

// ---------- Polycopiés ----------

const POLY_STATUS = ['À jour', 'À mettre à jour', 'En cours de révision', 'Envoyé à l\'impression'];

function polysTab() {
  const d = today();
  const polys = [...get().isp.polys].sort((a, b) => (a.nextReview || '9999').localeCompare(b.nextReview || '9999'));
  const late = (p) => p.nextReview && p.nextReview <= d && p.status !== 'À jour';
  return `
    ${polys.length ? `<ul class="list">${polys.map((p) => `
      <li class="item">
        <button class="item-main" data-act="poly-edit" data-id="${p.id}">
          <span class="item-title">${esc(p.title)}${p.version ? ` <span class="muted">v${esc(p.version)}</span>` : ''}</span>
          <span class="item-meta">${p.subject ? `${esc(p.subject)} · ` : ''}${p.updated ? `mis à jour le ${esc(fmtDate(p.updated, { day: 'numeric', month: 'short', year: 'numeric' }))}` : 'jamais mis à jour'}</span>
          ${p.nextReview ? `<span class="item-meta ${late(p) ? 'late' : ''}">${late(p) ? `${icon('alert', 13)} ` : ''}Prochaine révision : ${esc(fmtDate(p.nextReview, { day: 'numeric', month: 'long', year: 'numeric' }))}</span>` : ''}
        </button>
        <span class="badge ${p.status === 'À jour' ? 'ok' : 'soon'}">${esc(p.status)}</span>
      </li>`).join('')}</ul>` : empty('Aucun polycopié suivi.')}
    ${fab('poly-add', 'Ajouter un polycopié')}`;
}

function polyForm(p) {
  openForm({
    title: p ? 'Modifier le polycopié' : 'Nouveau polycopié',
    fields: [
      { name: 'title', label: 'Titre', required: true, value: p?.title },
      { name: 'subject', label: 'Matière / module', value: p?.subject },
      { name: 'version', label: 'Version', value: p?.version, placeholder: 'Ex. : 2026.1' },
      { name: 'status', label: 'Statut', type: 'select', value: p?.status || 'À jour', options: POLY_STATUS.map((s) => ({ value: s, label: s })) },
      { name: 'updated', label: 'Dernière mise à jour', type: 'date', value: p?.updated },
      { name: 'nextReview', label: 'Prochaine révision prévue', type: 'date', value: p?.nextReview },
      { name: 'task', label: 'Créer une action ISP pour cette révision', type: 'checkbox', value: false },
      { name: 'notes', label: 'Notes (changements à apporter…)', type: 'textarea', value: p?.notes },
    ],
    onSubmit(v) {
      const { task, ...data } = v;
      if (p) Object.assign(p, data);
      else get().isp.polys.push({ id: uid(), ...data });
      if (task && v.nextReview) {
        addTask({ title: `Mettre à jour le polycopié « ${v.title} »`, area: 'isp', due: v.nextReview, reminder: '09:00' });
        toast('Action ajoutée');
      }
      saveTasks();
    },
    onDelete: p ? () => {
      if (!confirm(`Supprimer « ${p.title} » ?`)) return false;
      get().isp.polys = get().isp.polys.filter((x) => x !== p);
      commit();
    } : null,
  });
}

// ---------- Élèves ----------

function studentsTab() {
  const d = today();
  const list = [...get().isp.students].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return `
    ${list.length ? `<ul class="list">${list.map((s) => {
      const since = s.lastContact ? diffDays(s.lastContact, d) : null;
      return `<li class="item">
        <button class="item-main" data-act="student-edit" data-id="${s.id}">
          <span class="item-title">${esc(s.name)}</span>
          <span class="item-meta">${s.target ? `${esc(s.target)} · ` : ''}${since != null ? `dernier échange ${esc(relDay(s.lastContact))}` : 'pas encore d\'échange'}</span>
        </button>
        ${since == null || since > 30 ? '<span class="badge soon">À recontacter</span>' : ''}
      </li>`;
    }).join('')}</ul>` : empty('Aucun élève enregistré.')}
    ${fab('student-add', 'Ajouter un élève')}`;
}

function studentForm(s) {
  openForm({
    title: s ? s.name : 'Nouvel élève',
    fields: [
      { name: 'name', label: 'Nom', required: true, value: s?.name },
      { name: 'target', label: 'Concours visé(s)', value: s?.target },
      { name: 'contact', label: 'Contact (e-mail, téléphone)', value: s?.contact },
      { name: 'lastContact', label: 'Dernier échange', type: 'date', value: s?.lastContact },
      { name: 'notes', label: 'Suivi', type: 'textarea', rows: 5, value: s?.notes },
    ],
    onSubmit(v) {
      if (s) Object.assign(s, v);
      else get().isp.students.push({ id: uid(), ...v });
      commit();
    },
    onDelete: s ? () => {
      if (!confirm(`Supprimer ${s.name} ?`)) return false;
      get().isp.students = get().isp.students.filter((x) => x !== s);
      commit();
    } : null,
  });
}

// ---------- Vue ----------

export function render(sub = 'actions') {
  const tab = TABS.some(([k]) => k === sub) ? sub : 'actions';
  const body = {
    actions: () => `${groupedTasks('isp')}${fab('add-task', 'Ajouter une action', 'data-area="isp"')}`,
    echeances: eventsTab,
    polycopies: polysTab,
    eleves: studentsTab,
  }[tab]();
  return `${header('ISP', { tabs: TABS, active: tab, base: 'isp' })}${body}`;
}

export function mount(root) {
  bindActions(root, {
    ...taskActions,
    'event-add': () => eventForm(null),
    'event-open': (d) => eventDetail(d.id),
    'poly-add': () => polyForm(null),
    'poly-edit': (d) => polyForm(get().isp.polys.find((p) => p.id === d.id)),
    'student-add': () => studentForm(null),
    'student-edit': (d) => studentForm(get().isp.students.find((s) => s.id === d.id)),
  });
}
