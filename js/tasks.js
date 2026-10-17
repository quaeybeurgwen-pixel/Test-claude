// Tâches (perso et ISP) : création, modification, tri, et formulaire partagé.
import { get, commit } from './store.js';
import { uid, today, nextSunday, esc, relDay, diffDays } from './util.js';
import { openForm } from './ui.js';
import { icon } from './icons.js';
import { requestSync } from './integrations/microsoft.js';

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
  s.tasks = s.tasks.filter((x) => x.id !== id);
}

// Enregistre et lance la synchronisation To Do.
export function saveTasks() {
  commit();
  requestSync();
}

export function toggleTask(id) {
  const t = findTask(id);
  if (!t) return;
  updateTask(id, { done: !t.done, doneAt: t.done ? null : today() });
  saveTasks();
}

export function sortTasks(list) {
  return [...list].sort((a, b) => (a.done - b.done)
    || (a.due || '9999').localeCompare(b.due || '9999')
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

// De demain jusqu'à dimanche.
export function weekTasks(area) {
  const d = today();
  const end = nextSunday(d);
  return sortTasks(get().tasks.filter(inArea(area)).filter((t) => t.due && t.due > d && t.due <= end
    && (!t.done || t.doneAt === d)));
}

export function dueLabel(t) {
  if (!t.due) return '';
  const late = !t.done && t.due < today();
  return `<span class="${late ? 'late' : ''}">${late ? `En retard · ${relDay(t.due)}` : relDay(t.due)}</span>`;
}

export function taskItem(t, { showDate = true } = {}) {
  const meta = [
    t.area === 'isp' ? '<span class="chip chip-isp">ISP</span>' : '',
    showDate ? dueLabel(t) : '',
    t.reminder && t.due ? `<span class="with-icon">${icon('bell', 13)}${esc(t.reminder)}</span>` : '',
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
  openForm({
    title: task ? 'Modifier la tâche' : 'Nouvelle tâche',
    intro: linked ? `<p class="hint">Action liée à l'échéance ISP « ${esc(linked.title)} ».</p>` : '',
    fields: [
      { name: 'title', label: 'Tâche', required: true, value: t.title, placeholder: 'Ex. : Appeler la banque' },
      { name: 'due', label: 'Échéance', type: 'date', value: t.due },
      { name: 'reminder', label: 'Heure du rappel', type: 'time', value: t.reminder, hint: 'Le rappel est envoyé par Microsoft To Do (si connecté) le jour de l\'échéance.' },
      {
        name: 'priority', label: 'Priorité', type: 'select', value: t.priority,
        options: [{ value: 'haute', label: 'Haute' }, { value: 'normale', label: 'Normale' }, { value: 'basse', label: 'Basse' }],
      },
      {
        name: 'area', label: 'Domaine', type: 'select', value: t.area,
        options: [{ value: 'perso', label: 'Personnel' }, { value: 'isp', label: 'ISP' }],
      },
      { name: 'notes', label: 'Notes', type: 'textarea', value: t.notes },
    ],
    onSubmit(v) {
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
  'add-task': (d) => openTaskForm(null, { area: d.area || 'perso', due: d.due || null }),
};
