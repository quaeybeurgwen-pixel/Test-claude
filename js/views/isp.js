// ISP : vue d'ensemble des formations (Greffier, DSGJ, Cadre greffier…), puis pour chacune
// ses actions, échéances (concours, webinaires, envois de documents…), élèves et polycopiés.
import { get, commit } from '../store.js';
import {
  esc, uid, today, addDays, diffDays, fmtDate, fmtLongDate, countdown, relDay, nextSunday,
} from '../util.js';
import { bindActions, header, empty, fab, openForm, openSheet, toast } from '../ui.js';
import { icon } from '../icons.js';
import {
  addTask, removeTask, saveTasks, toggleTask, sortTasks, taskActions, findTask, updateTask, todayTasks, taskList,
} from '../tasks.js';
import {
  formations, findFormation, inFormation, formationOptions, formationChip, formationDot,
} from '../formations.js';
import { groupedTasks } from './perso.js';

const TABS = [['actions', 'Actions'], ['echeances', 'Échéances'], ['eleves', 'Élèves'], ['polycopies', 'Polycopiés']];

const TYPES = ['Concours', 'Concours blanc', 'Webinaire', 'Envoi de documents', 'Inscriptions', 'Résultats', 'Réunion', 'Autre'];

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
    [-10, 'Convoquer les élèves'],
    [-2, 'Envoyer les consignes et le sujet'],
    [7, 'Corriger les copies'],
    [10, 'Communiquer les notes et le corrigé'],
  ],
  Webinaire: [
    [-14, 'Préparer le support du webinaire'],
    [-7, 'Envoyer l\'invitation et le lien de connexion aux élèves'],
    [-1, 'Rappel aux élèves et test technique'],
    [1, 'Envoyer le replay et le support'],
  ],
  'Envoi de documents': [
    [-7, 'Préparer les documents'],
    [-2, 'Vérifier la liste des destinataires'],
    [0, 'Envoyer les documents'],
    [3, 'Vérifier la bonne réception et relancer si besoin'],
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

const TYPE_FILTERS = [['tout', 'Tout'], ['concours', 'Concours'], ['webinaire', 'Webinaires'], ['envoi', 'Envois'], ['autre', 'Autres']];
const typeGroup = (type) => ({
  Concours: 'concours', 'Concours blanc': 'concours', Inscriptions: 'concours', Résultats: 'concours',
  Webinaire: 'webinaire', 'Envoi de documents': 'envoi',
}[type] || 'autre');
let typeFilter = 'tout';

const offsetLabel = (n) => (n === 0 ? 'Jour J' : n < 0 ? `J${n}` : `J+${n}`);
const fidOf = (x) => (findFormation(x.formationId) ? x.formationId : 'nc');

export const ispEventsOn = (day) => get().isp.events.filter((e) => e.date === day);
export const ispEventHref = (e) => `#/isp/${fidOf(e)}/echeances`;
export const ispEventLabel = (e) => [findFormation(e.formationId)?.name, e.type].filter(Boolean).join(' · ');

const actionsOf = (ev) => sortTasks(get().tasks.filter((t) => t.sourceId === ev.id));
const callsPlanned = (st) => sortTasks(get().tasks.filter((t) => t.studentId === st.id && !t.done));

// ---------- Vue d'ensemble ----------

function formationCard(fid, name, subtitle) {
  const s = get();
  const d = today();
  const sunday = nextSunday(d);
  const filter = inFormation(fid);
  const open = s.tasks.filter((t) => t.area === 'isp' && !t.done && filter(t));
  const late = open.filter((t) => t.due && t.due < d).length;
  const week = open.filter((t) => t.due && t.due >= d && t.due <= sunday).length;
  const upcoming = s.isp.events.filter(filter).filter((e) => e.date >= d).sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const webinar = upcoming.find((e) => e.type === 'Webinaire');
  const calls = open.filter((t) => t.studentId && t.due && t.due <= sunday).length;
  const polys = s.isp.polys.filter(filter).filter((p) => p.status !== 'À jour').length;
  const students = s.isp.students.filter(filter).length;

  const lines = [
    `<li><strong>${week}</strong> action${week > 1 ? 's' : ''} d'ici dimanche${late ? ` · <span class="late">${icon('alert', 13)} ${late} en retard</span>` : ''}</li>`,
    next ? `<li>Prochaine échéance : ${esc(next.title)} · <strong>${countdown(next.date)}</strong></li>` : '<li class="muted">Aucune échéance à venir</li>',
    webinar && webinar !== next ? `<li>Prochain webinaire : ${esc(fmtDate(webinar.date))} · <strong>${countdown(webinar.date)}</strong></li>` : '',
    `<li>${calls ? `<strong>${calls}</strong> appel${calls > 1 ? 's' : ''} prévu${calls > 1 ? 's' : ''} d'ici dimanche` : 'Aucun appel prévu cette semaine'} · ${students} élève${students > 1 ? 's' : ''}</li>`,
    polys ? `<li><span class="late">${polys} polycopié${polys > 1 ? 's' : ''} à mettre à jour</span></li>` : '',
  ].filter(Boolean).join('');

  return `
    <a class="card formation-card" href="#/isp/${fid}">
      <div class="card-head">
        <h2>${fid === 'nc' ? '<span class="f-dot f-none"></span>' : formationDot(fid)} ${esc(name)}</h2>
        ${icon('chevronRight', 18)}
      </div>
      ${subtitle ? `<p class="muted small">${esc(subtitle)}</p>` : ''}
      <ul class="stats">${lines}</ul>
    </a>`;
}

function overview() {
  const s = get();
  const todays = todayTasks('isp');
  const unassigned = [s.tasks.filter((t) => t.area === 'isp' && !t.done), s.isp.events, s.isp.polys, s.isp.students]
    .some((list) => list.some(inFormation('nc')));
  return `
    ${header('ISP', { subtitle: 'Mes formations' })}
    <section class="card">
      <div class="card-head"><h2>À faire aujourd'hui</h2><span class="muted">${todays.filter((t) => t.done).length}/${todays.length}</span></div>
      ${todays.length ? taskList(todays) : empty('Rien à faire aujourd\'hui pour l\'ISP.')}
    </section>
    ${formations().map((f) => formationCard(f.id, f.name, f.full)).join('')}
    ${unassigned ? formationCard('nc', 'Non rattaché', 'Éléments sans formation : ouvrez-les pour les rattacher.') : ''}
    <button class="btn ghost" data-act="formations-manage">Gérer les formations</button>`;
}

function manageFormations() {
  const body = openSheet('Formations', '');
  const paint = () => {
    body.innerHTML = `
      <ul class="list">${formations().map((f) => `
        <li class="item"><button class="item-main" data-f="${f.id}">
          <span class="item-title">${formationDot(f.id)} ${esc(f.name)}</span>
          ${f.full ? `<span class="item-meta">${esc(f.full)}</span>` : ''}
        </button></li>`).join('')}</ul>
      <div class="form-actions"><button class="btn primary" data-f="new">Ajouter une formation</button></div>`;
  };
  paint();
  body.addEventListener('click', (e) => {
    const id = e.target.closest('[data-f]')?.dataset.f;
    if (id) formationForm(id === 'new' ? null : findFormation(id));
  });
}

function formationForm(f) {
  const s = get();
  const used = f && [s.tasks, s.isp.events, s.isp.polys, s.isp.students].some((list) => list.some((x) => x.formationId === f.id));
  openForm({
    title: f ? f.name : 'Nouvelle formation',
    fields: [
      { name: 'name', label: 'Nom court', required: true, value: f?.name, placeholder: 'Ex. : Greffier' },
      { name: 'full', label: 'Intitulé complet (facultatif)', value: f?.full },
    ],
    onSubmit(v) {
      if (f) Object.assign(f, v);
      else {
        const usedColors = formations().map((x) => x.color);
        const color = [0, 1, 2].find((c) => !usedColors.includes(c));
        s.isp.formations.push({ id: uid(), ...v, color: color ?? null });
      }
      commit();
    },
    onDelete: f ? () => {
      if (used) { toast('Formation utilisée : rattachez d\'abord ses éléments à une autre formation.'); return false; }
      if (!confirm(`Supprimer la formation « ${f.name} » ?`)) return false;
      s.isp.formations = s.isp.formations.filter((x) => x !== f);
      commit();
    } : null,
  });
}

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
        ${next ? `<span class="item-meta">Prochaine action : ${esc(next.title)}${next.due ? ` · ${esc(relDay(next.due))}` : ''}</span>` : ''}
      </button>
      <span class="badge ${d >= 0 && d <= 14 ? 'soon' : ''}">${countdown(ev.date)}</span>
    </li>`;
}

function eventsTab(fid) {
  const d = today();
  const events = get().isp.events.filter(inFormation(fid))
    .filter((e) => typeFilter === 'tout' || typeGroup(e.type) === typeFilter)
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = events.filter((e) => e.date >= d);
  const past = events.filter((e) => e.date < d && diffDays(e.date, d) <= 90).reverse();
  return `
    <div class="chips-row">${TYPE_FILTERS.map(([k, label]) => `
      <button class="chip-toggle ${typeFilter === k ? 'on' : ''}" data-act="type-filter" data-type="${k}" aria-pressed="${typeFilter === k}">${label}</button>`).join('')}
    </div>
    ${upcoming.length ? `<ul class="list">${upcoming.map(eventCard).join('')}</ul>` : empty('Aucune échéance à venir. Ajoutez vos concours, webinaires, envois de documents…')}
    ${past.length ? `<details class="group"><summary>Passées (90 derniers jours) <span class="muted">${past.length}</span></summary><ul class="list">${past.map(eventCard).join('')}</ul></details>` : ''}
    ${fab('event-add', 'Ajouter une échéance')}`;
}

function setActionsFromTemplate(ev, reminder) {
  for (const [offset, title] of TEMPLATES[ev.type] || []) {
    // Une action dont la date est déjà passée est ramenée à aujourd'hui.
    const due = addDays(ev.date, offset) < today() ? today() : addDays(ev.date, offset);
    addTask({
      title, area: 'isp', formationId: ev.formationId, due, reminder,
      priority: offset >= -3 && offset <= 0 ? 'haute' : 'normale', sourceId: ev.id, offset,
    });
  }
}

function eventForm(ev, fid) {
  const defaultType = { webinaire: 'Webinaire', envoi: 'Envoi de documents' }[typeFilter] || 'Concours';
  openForm({
    title: ev ? 'Modifier l\'échéance' : 'Nouvelle échéance',
    fields: [
      { name: 'title', label: 'Intitulé', required: true, value: ev?.title, placeholder: 'Ex. : Concours greffier — écrits, Webinaire méthodologie…' },
      { name: 'formationId', label: 'Formation', type: 'select', value: ev ? ev.formationId || '' : (fid !== 'nc' ? fid : ''), options: formationOptions() },
      { name: 'type', label: 'Type', type: 'select', value: ev?.type || defaultType, options: TYPES.map((t) => ({ value: t, label: t })) },
      { name: 'date', label: 'Date', type: 'date', required: true, value: ev?.date },
      { name: 'time', label: 'Heure (facultatif)', type: 'time', value: ev?.time },
      { name: 'notes', label: 'Notes (lien du webinaire, documents concernés…)', type: 'textarea', value: ev?.notes },
      ...(ev ? [] : [
        { name: 'template', label: 'Créer les actions types (modifiables ensuite)', type: 'checkbox', value: true },
        { name: 'reminder', label: 'Heure des rappels', type: 'time', value: '09:00' },
      ]),
    ],
    onSubmit(v) {
      const formationId = findFormation(v.formationId) ? v.formationId : null;
      if (ev) {
        const moved = v.date !== ev.date;
        Object.assign(ev, { title: v.title, type: v.type, date: v.date, time: v.time, notes: v.notes || '', formationId });
        for (const t of actionsOf(ev)) {
          const patch = {};
          // Les actions non faites suivent le changement de date.
          if (moved && !t.done && t.offset != null) patch.due = addDays(ev.date, t.offset);
          if (t.formationId !== formationId) patch.formationId = formationId;
          if (Object.keys(patch).length) updateTask(t.id, patch);
        }
      } else {
        const created = { id: uid(), title: v.title, type: v.type, date: v.date, time: v.time, notes: v.notes || '', formationId };
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
      <p>${formationChip(ev.formationId, 'Sans formation')} <span class="chip">${esc(ev.type)}</span></p>
      <p>${esc(fmtLongDate(ev.date))}${ev.time ? ` à ${esc(ev.time)}` : ''} · <strong>${countdown(ev.date)}</strong></p>
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
      else addTask({ ...data, area: 'isp', formationId: ev.formationId, sourceId: ev.id });
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

// ---------- Élèves et appels ----------

function studentsTab(fid) {
  const d = today();
  const list = get().isp.students.filter(inFormation(fid)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const toCall = list.filter((s) => !callsPlanned(s).length && (!s.lastContact || diffDays(s.lastContact, d) > 30)).length;
  return `
    ${list.length ? `<p class="muted small">${list.length} élève${list.length > 1 ? 's' : ''}${toCall ? ` · ${toCall} sans échange depuis plus de 30 jours` : ''}</p>
      <ul class="list">${list.map((s) => {
      const next = callsPlanned(s)[0];
      const meta = next
        ? `<span class="with-icon">${icon('bell', 13)}Appel prévu ${esc(next.due ? relDay(next.due) : '')}${next.reminder ? ` à ${esc(next.reminder)}` : ''}</span>`
        : s.lastContact ? `Dernier échange ${esc(relDay(s.lastContact))}` : 'Pas encore d\'échange';
      const stale = !next && (!s.lastContact || diffDays(s.lastContact, d) > 30);
      return `<li class="item">
        <button class="item-main" data-act="student-open" data-id="${s.id}">
          <span class="item-title">${esc(s.name)}</span>
          <span class="item-meta">${s.target ? `${esc(s.target)} · ` : ''}${meta}</span>
        </button>
        ${stale ? '<span class="badge soon">À appeler</span>' : ''}
      </li>`;
    }).join('')}</ul>` : empty('Aucun élève enregistré pour cette formation.')}
    ${fab('student-add', 'Ajouter un élève')}`;
}

function contactLinks(contact) {
  if (!contact) return '';
  return contact.split(/[,;\n]/).map((c) => c.trim()).filter(Boolean).map((c) => {
    if (c.includes('@')) return `<a href="mailto:${esc(c)}">${esc(c)}</a>`;
    if (/^[+\d][\d .-]{5,}$/.test(c)) return `<a href="tel:${esc(c.replace(/[ .-]/g, ''))}">${esc(c)}</a>`;
    return esc(c);
  }).join(' · ');
}

function studentDetail(id) {
  const st = get().isp.students.find((s) => s.id === id);
  if (!st) return;
  const body = openSheet(st.name, '');
  const paint = () => {
    const planned = callsPlanned(st);
    const history = [...(st.calls || [])].sort((a, b) => b.date.localeCompare(a.date));
    body.innerHTML = `
      <p>${formationChip(st.formationId, 'Sans formation')}${st.target ? ` <span class="muted">${esc(st.target)}</span>` : ''}</p>
      ${st.contact ? `<p>${contactLinks(st.contact)}</p>` : ''}
      ${st.notes ? `<p class="notes">${esc(st.notes)}</p>` : ''}
      <h3>Appels prévus</h3>
      ${planned.length ? `<ul class="list">${planned.map((t) => `
        <li class="item task">
          <button class="check" data-a="toggle" data-id="${t.id}" aria-label="Appel effectué : ${esc(t.title)}">${icon('check', 16)}</button>
          <button class="item-main" data-a="edit-call" data-id="${t.id}">
            <span class="item-title">${t.due ? esc(fmtLongDate(t.due)) : 'Sans date'}${t.reminder ? ` à ${esc(t.reminder)}` : ''}</span>
            ${t.notes ? `<span class="item-meta">${esc(t.notes)}</span>` : ''}
          </button>
        </li>`).join('')}</ul>` : empty('Aucun appel prévu.')}
      <h3>Historique des échanges</h3>
      ${history.length ? `<ul class="list">${history.map((c, i) => `
        <li class="item">
          <span class="item-main static">
            <span class="item-title">${esc(fmtDate(c.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }))}</span>
            ${c.note ? `<span class="item-meta details">${esc(c.note)}</span>` : ''}
          </span>
          <button class="icon-btn small" data-a="del-call" data-i="${i}" aria-label="Supprimer cet échange">${icon('close', 14)}</button>
        </li>`).join('')}</ul>` : empty('Aucun échange noté.')}
      <div class="form-actions">
        <button class="btn ghost" data-a="edit">Modifier la fiche</button>
        <button class="btn ghost" data-a="note">Noter un échange</button>
        <button class="btn primary" data-a="plan">Planifier un appel</button>
      </div>`;
    body._history = history;
  };
  paint();
  body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a;
    if (a === 'toggle') { toggleTask(el.dataset.id); paint(); }
    if (a === 'edit-call') callForm(st, findTask(el.dataset.id));
    if (a === 'plan') callForm(st, null);
    if (a === 'note') noteForm(st);
    if (a === 'edit') studentForm(st);
    if (a === 'del-call') {
      const c = body._history[Number(el.dataset.i)];
      if (!confirm('Supprimer cet échange de l\'historique ?')) return;
      st.calls = st.calls.filter((x) => x !== c);
      commit();
      paint();
    }
  });
}

function callForm(st, task) {
  openForm({
    title: task ? 'Modifier l\'appel' : `Appeler ${st.name}`,
    fields: [
      { name: 'due', label: 'Date', type: 'date', required: true, value: task?.due || addDays(today(), 1) },
      { name: 'reminder', label: 'Heure (rappel)', type: 'time', value: task?.reminder ?? '10:00' },
      { name: 'notes', label: 'Objet de l\'appel', type: 'textarea', value: task?.notes, placeholder: 'Point sur les révisions, résultats du concours blanc…' },
    ],
    onSubmit(v) {
      const data = { due: v.due, reminder: v.reminder, notes: v.notes || '' };
      if (task) updateTask(task.id, data);
      else addTask({ ...data, title: `Appeler ${st.name}`, area: 'isp', formationId: st.formationId || null, studentId: st.id });
      saveTasks();
      setTimeout(() => studentDetail(st.id), 220);
    },
    onDelete: task ? () => {
      removeTask(task.id);
      saveTasks();
      setTimeout(() => studentDetail(st.id), 220);
    } : null,
    deleteLabel: 'Annuler l\'appel',
  });
}

function noteForm(st) {
  openForm({
    title: `Échange avec ${st.name}`,
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, value: today() },
      { name: 'note', label: 'Compte rendu', type: 'textarea', rows: 4 },
    ],
    onSubmit(v) {
      st.calls = [...(st.calls || []), { date: v.date, note: v.note || '' }];
      if (!st.lastContact || v.date > st.lastContact) st.lastContact = v.date;
      commit();
      setTimeout(() => studentDetail(st.id), 220);
    },
  });
}

function studentForm(s, fid) {
  openForm({
    title: s ? s.name : 'Nouvel élève',
    fields: [
      { name: 'name', label: 'Nom', required: true, value: s?.name },
      { name: 'formationId', label: 'Formation', type: 'select', value: s ? s.formationId || '' : (fid !== 'nc' ? fid : ''), options: formationOptions() },
      { name: 'target', label: 'Promotion / session', value: s?.target },
      { name: 'contact', label: 'Contact (téléphone, e-mail)', value: s?.contact, placeholder: '06 12 34 56 78, prenom.nom@mail.fr' },
      { name: 'notes', label: 'Notes de suivi', type: 'textarea', rows: 4, value: s?.notes },
    ],
    onSubmit(v) {
      v.formationId = findFormation(v.formationId) ? v.formationId : null;
      if (s) {
        Object.assign(s, v);
        // Les appels prévus suivent la formation de l'élève.
        callsPlanned(s).forEach((t) => { if (t.formationId !== v.formationId) updateTask(t.id, { formationId: v.formationId }); });
      } else {
        get().isp.students.push({ id: uid(), ...v, lastContact: null, calls: [] });
      }
      saveTasks();
    },
    onDelete: s ? () => {
      const planned = callsPlanned(s);
      if (!confirm(`Supprimer ${s.name}${planned.length ? ` et ses ${planned.length} appels prévus` : ''} ?`)) return false;
      planned.forEach((t) => removeTask(t.id));
      get().isp.students = get().isp.students.filter((x) => x !== s);
      saveTasks();
    } : null,
  });
}

// ---------- Polycopiés ----------

const POLY_STATUS = ['À jour', 'À mettre à jour', 'En cours de révision', 'Envoyé à l\'impression'];

function polysTab(fid) {
  const d = today();
  const polys = get().isp.polys.filter(inFormation(fid))
    .sort((a, b) => (a.nextReview || '9999').localeCompare(b.nextReview || '9999'));
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
      </li>`).join('')}</ul>` : empty('Aucun polycopié suivi pour cette formation.')}
    ${fab('poly-add', 'Ajouter un polycopié')}`;
}

function polyForm(p, fid) {
  openForm({
    title: p ? 'Modifier le polycopié' : 'Nouveau polycopié',
    fields: [
      { name: 'title', label: 'Titre', required: true, value: p?.title },
      { name: 'formationId', label: 'Formation', type: 'select', value: p ? p.formationId || '' : (fid !== 'nc' ? fid : ''), options: formationOptions() },
      { name: 'subject', label: 'Matière / module', value: p?.subject },
      { name: 'version', label: 'Version', value: p?.version, placeholder: 'Ex. : 2026.1' },
      { name: 'status', label: 'Statut', type: 'select', value: p?.status || 'À jour', options: POLY_STATUS.map((x) => ({ value: x, label: x })) },
      { name: 'updated', label: 'Dernière mise à jour', type: 'date', value: p?.updated },
      { name: 'nextReview', label: 'Prochaine révision prévue', type: 'date', value: p?.nextReview },
      { name: 'task', label: 'Créer une action ISP pour cette révision', type: 'checkbox', value: false },
      { name: 'notes', label: 'Notes (changements à apporter…)', type: 'textarea', value: p?.notes },
    ],
    onSubmit(v) {
      const { task, ...data } = v;
      data.formationId = findFormation(data.formationId) ? data.formationId : null;
      if (p) Object.assign(p, data);
      else get().isp.polys.push({ id: uid(), ...data });
      if (task && v.nextReview) {
        addTask({ title: `Mettre à jour le polycopié « ${v.title} »`, area: 'isp', formationId: data.formationId, due: v.nextReview, reminder: '09:00' });
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

// ---------- Vue ----------

function currentFormation(sub) {
  if (sub === 'nc') return { id: 'nc', name: 'Non rattaché', full: 'Éléments sans formation' };
  return findFormation(sub);
}

export function render(sub, param) {
  const f = currentFormation(sub);
  if (!f) return overview();
  const tab = TABS.some(([k]) => k === param) ? param : 'actions';
  const body = {
    actions: () => `${groupedTasks('isp', inFormation(f.id))}${fab('add-task', 'Ajouter une action', `data-area="isp" data-formation="${f.id === 'nc' ? '' : f.id}"`)}`,
    echeances: () => eventsTab(f.id),
    eleves: () => studentsTab(f.id),
    polycopies: () => polysTab(f.id),
  }[tab]();
  return `
    <a class="back-link" href="#/isp">${icon('chevronLeft', 16)} Formations</a>
    ${header(f.name, { subtitle: f.full ? esc(f.full) : '', tabs: TABS, active: tab, base: `isp/${f.id}` })}
    ${body}`;
}

export function mount(root, sub) {
  const fid = currentFormation(sub)?.id || 'nc';
  bindActions(root, {
    ...taskActions,
    'formations-manage': manageFormations,
    'type-filter': (d) => { typeFilter = d.type; commit(); },
    'event-add': () => eventForm(null, fid),
    'event-open': (d) => eventDetail(d.id),
    'student-add': () => studentForm(null, fid),
    'student-open': (d) => studentDetail(d.id),
    'poly-add': () => polyForm(null, fid),
    'poly-edit': (d) => polyForm(get().isp.polys.find((p) => p.id === d.id), fid),
  });
}
