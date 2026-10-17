// Tâches (perso et ISP) : création, modification, tri, et formulaire partagé.
import { get, commit } from './store.js';
import { uid, today, nextSunday, esc, relDay, diffDays, addDays, startOfWeek, fmtDate } from './util.js';
import { openForm } from './ui.js';
import { icon } from './icons.js';
import { requestSync } from './integrations/microsoft.js';
import { requestReminderSync, reminderState, isConfigured as googleConfigured } from './integrations/google.js';
import { formationChip, formationOptions, findFormation } from './formations.js';

const PRIO = { haute: 0, normale: 1, basse: 2 };

export function addTask(data) {
  const t = {
    id: uid(), title: '', notes: '', due: null, reminder: null, priority: 'normale', area: 'perso',
    done: false, doneAt: null, ms: null, dirty: true, createdAt: Date.now(), ...data,
  };
  get().tasks.push(t);
  return t;
}

export const findTask = (id) => get().tasks.find((t) => t.id === id);

export function updateTask(id, patch) {
  const t = findTask(id);
  if (!t) return;
  Object.assign(t, patch, { dirty: true });
}

export function removeTask(id) {
  const s = get();
  const t = findTask(id);
  if (t?.ms) s.msDeleted.push({ id: t.ms.id, listId: t.ms.listId });
  if (t?.gcal) s.gcalDeleted.push({ id: t.gcal.id, calId: t.gcal.calId });
  s.tasks = s.tasks.filter((x) => x.id !== id);
}

// Enregistre et envoie les changements à Google Agenda (rappels) et To Do.
export function saveTasks() {
  commit();
  requestReminderSync();
  requestSync();
}

export function toggleTask(id) {
  const t = findTask(id);
  if (!t) return;
  updateTask(id, { done: !t.done, doneAt: t.done ? null : today() });
  // Appel d'élève coché : il est noté dans l'historique de l'élève.
  const student = t.studentId && get().isp.students.find((s) => s.id === t.studentId);
  if (student) {
    student.calls = student.calls || [];
    if (t.done) {
      student.calls.push({ date: today(), note: t.notes || 'Appel effectué', taskId: t.id });
      if (!student.lastContact || student.lastContact < today()) student.lastContact = today();
    } else {
      student.calls = student.calls.filter((c) => c.taskId !== t.id);
    }
  }
  saveTasks();
}

// Une tâche « dans la semaine » (t.week = lundi de la semaine) se range comme si elle était due le dimanche.
const sortKey = (t) => t.due || (t.week ? addDays(t.week, 6) : '9999');

export function sortTasks(list) {
  return [...list].sort((a, b) => (a.done - b.done)
    || sortKey(a).localeCompare(sortKey(b))
    || (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1)
    || a.createdAt - b.createdAt);
}

const inArea = (area) => (t) => !area || t.area === area;

// En retard + du jour (les tâches cochées aujourd'hui restent visibles, barrées).
export function todayTasks(area) {
  const d = today();
  return sortTasks(get().tasks.filter(inArea(area)).filter((t) => t.due
    && ((!t.done && t.due <= d) || (t.done && t.due <= d && t.doneAt === d))));
}

// Tâche « dans la semaine » de la semaine en cours (ou d'une semaine passée, non faite : reportée).
export const isWeekTask = (t, monday = startOfWeek(today())) => !t.due && !!t.week && t.week <= monday;

// Tâches « dans la semaine » : à faire, ou cochées depuis lundi (elles restent visibles, barrées).
export function weekOnlyTasks(area) {
  const monday = startOfWeek(today());
  return sortTasks(get().tasks.filter(inArea(area)).filter((t) => isWeekTask(t, monday)
    && (!t.done || (t.doneAt && t.doneAt >= monday))));
}

// Tâches datées de demain jusqu'à dimanche.
export function weekTasks(area) {
  const d = today();
  const end = nextSunday(d);
  const monday = startOfWeek(d);
  return sortTasks(get().tasks.filter(inArea(area)).filter((t) => t.due && t.due > d && t.due <= end
    && (!t.done || (t.doneAt && t.doneAt >= monday))));
}

function weekLabel(t) {
  const monday = startOfWeek(today());
  if (t.week === monday) return '<span>Cette semaine</span>';
  if (t.week > monday) return `<span>${t.week === addDays(monday, 7) ? 'Semaine prochaine' : `Semaine du ${esc(fmtDate(t.week, { day: 'numeric', month: 'short' }))}`}</span>`;
  return t.done ? '' : `<span class="late">Reportée · semaine du ${esc(fmtDate(t.week, { day: 'numeric', month: 'short' }))}</span>`;
}

export function dueLabel(t) {
  if (!t.due) return t.week ? weekLabel(t) : '';
  const late = !t.done && t.due < today();
  return `<span class="${late ? 'late' : ''}">${late ? `En retard · ${relDay(t.due)}` : relDay(t.due)}</span>`;
}

const REMINDER_STATE = { sent: 'rappel programmé', pending: 'rappel pas encore envoyé à Google', past: 'heure passée avant l\'envoi' };

function reminderLabel(t) {
  const st = googleConfigured() ? reminderState(t) : null;
  const note = st && st !== 'sent' ? ` <span class="late">· ${REMINDER_STATE[st]}</span>` : '';
  return `<span class="with-icon" title="${st ? REMINDER_STATE[st] : ''}">${icon('bell', 13)}${esc(t.reminder)}${st === 'sent' ? icon('check', 12) : ''}</span>${note}`;
}

export function taskItem(t, { showDate = true, hideThisWeek = false } = {}) {
  const sameWeek = hideThisWeek && !t.due && t.week === startOfWeek(today());
  const meta = [
    t.area === 'isp' ? formationChip(t.formationId) : '',
    showDate && !sameWeek ? dueLabel(t) : '',
    t.reminder && t.due ? reminderLabel(t) : '',
  ].filter(Boolean).join('');
  return `
    <li class="item task ${t.done ? 'done' : ''}">
      <button class="check ${t.done ? 'on' : ''}" data-act="toggle-task" data-id="${t.id}"
        aria-label="${t.done ? 'Marquer comme à faire' : 'Marquer comme faite'} : ${esc(t.title)}" aria-pressed="${t.done}">${icon('check', 16)}</button>
      <button class="item-main" data-act="edit-task" data-id="${t.id}">
        <span class="item-title">${t.priority === 'haute' ? '<span class="prio" title="Priorité haute"></span>' : ''}${esc(t.title)}</span>
        ${meta ? `<span class="item-meta">${meta}</span>` : ''}
      </button>
    </li>`;
}

export function taskList(list, opts) {
  return `<ul class="list">${list.map((t) => taskItem(t, opts)).join('')}</ul>`;
}

export function openTaskForm(task, defaults = {}) {
  const t = task || { priority: 'normale', area: 'perso', ...defaults };
  const linked = task?.sourceId ? get().isp.events.find((e) => e.id === task.sourceId) : null;
  const thisMonday = startOfWeek(today());
  openForm({
    title: task ? 'Modifier la tâche' : 'Nouvelle tâche',
    intro: linked ? `<p class="hint">Action liée à l'échéance ISP « ${esc(linked.title)} ».</p>` : '',
    fields: [
      { name: 'title', label: 'Tâche', required: true, value: t.title, placeholder: 'Ex. : Appeler la banque' },
      {
        name: 'when', label: 'Quand ?', type: 'select', value: t.due ? 'day' : t.week ? 'week' : (task ? 'none' : 'day'),
        options: [{ value: 'day', label: 'Un jour précis' }, { value: 'week', label: 'Dans la semaine (sans jour précis)' }, { value: 'none', label: 'Sans échéance' }],
      },
      { name: 'due', label: 'Jour', type: 'date', value: t.due, showIf: ['when', 'day'] },
      {
        name: 'week', label: 'Semaine', type: 'select', value: t.week && t.week > thisMonday ? addDays(thisMonday, 7) : thisMonday, showIf: ['when', 'week'],
        options: [{ value: thisMonday, label: 'Cette semaine' }, { value: addDays(thisMonday, 7), label: 'La semaine prochaine' }],
      },
      { name: 'reminder', label: 'Heure du rappel', type: 'time', value: t.reminder, showIf: ['when', 'day'], hint: 'Une notification Google Agenda vous prévient à cette heure-là, le jour choisi.' },
      {
        name: 'priority', label: 'Priorité', type: 'select', value: t.priority,
        options: [{ value: 'haute', label: 'Haute' }, { value: 'normale', label: 'Normale' }, { value: 'basse', label: 'Basse' }],
      },
      {
        name: 'area', label: 'Domaine', type: 'select', value: t.area,
        options: [{ value: 'perso', label: 'Personnel' }, { value: 'isp', label: 'ISP' }],
      },
      { name: 'formationId', label: 'Formation', type: 'select', value: t.formationId || '', options: formationOptions(), showIf: ['area', 'isp'] },
      { name: 'notes', label: 'Notes', type: 'textarea', value: t.notes },
    ],
    onSubmit(v) {
      if (v.area !== 'isp' || !findFormation(v.formationId)) v.formationId = null;
      const { when } = v;
      delete v.when;
      if (when !== 'day') Object.assign(v, { due: null, reminder: null });
      // Une tâche reportée garde sa semaine d'origine tant qu'on ne la change pas.
      v.week = when === 'week' ? (task?.week && task.week < thisMonday && v.week === thisMonday ? task.week : v.week) : null;
      if (task) {
        updateTask(task.id, { ...v, notes: v.notes || '' });
        if (linked && v.due && task.offset != null) task.offset = diffDays(linked.date, v.due);
      } else {
        addTask({ ...v, notes: v.notes || '' });
      }
      saveTasks();
    },
    onDelete: task ? () => {
      if (!confirm('Supprimer cette tâche ?')) return false;
      removeTask(task.id);
      saveTasks();
    } : null,
  });
}

// Actions communes aux écrans qui affichent des tâches.
export const taskActions = {
  'toggle-task': (d) => toggleTask(d.id),
  'edit-task': (d) => openTaskForm(findTask(d.id)),
  'add-task': (d) => openTaskForm(null, {
    area: d.area || 'perso', due: d.due || null, formationId: d.formation || null, week: d.week || null,
  }),
};
