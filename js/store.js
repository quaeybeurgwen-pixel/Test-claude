// Données de l'application, conservées dans le stockage local du téléphone.
import { uid, monthKey } from './util.js';

const KEY = 'sauge.data.v1';

const cat = (name, kind = 'depense') => ({ id: uid(), name, kind, budget: null });

function defaults() {
  const categories = [
    'Logement', 'Électricité', 'Gaz', 'Eau', 'Assurances', 'Internet & téléphone', 'Abonnements',
    'Alimentation', 'Transports', 'Santé', 'Sport', 'Loisirs', 'Shopping & vêtements', 'Cadeaux',
    'Voyages', 'Impôts', 'Versements épargne', 'Divers',
  ].map((n) => cat(n));
  categories.push(...['Salaire', 'ISP', 'Remboursements', 'Autres revenus'].map((n) => cat(n, 'revenu')));
  const byName = (n) => categories.find((c) => c.name === n).id;
  const fixed = (label, category, day) => ({
    id: uid(), label, amount: null, kind: 'depense', categoryId: byName(category), day,
    active: true, startMonth: monthKey(),
  });

  return {
    version: 1,
    tasks: [],
    msDeleted: [],
    gcalDeleted: [],
    habits: { targets: { sleep: 8, steps: 8000, relax: 30 }, log: {} },
    courses: [],
    birthdays: [],
    isp: { events: [], polys: [], students: [] },
    sport: { goal: { name: 'Marathon', date: null, target: '' }, sessions: [] },
    finances: {
      categories,
      recurring: [
        fixed('Loyer', 'Logement', 1),
        fixed('Électricité', 'Électricité', 5),
        fixed('Gaz', 'Gaz', 5),
        fixed('Assurance habitation', 'Assurances', 10),
        fixed('Internet', 'Internet & téléphone', 10),
        fixed('Téléphone mobile', 'Internet & téléphone', 10),
      ],
      transactions: [],
      generated: {},
      savings: [
        { id: uid(), name: 'Livret A', ceiling: 22950, balance: 0, history: [] },
        { id: uid(), name: 'LDDS', ceiling: 12000, balance: 0, history: [] },
        { id: uid(), name: 'Assurance vie', ceiling: null, balance: 0, history: [] },
        { id: uid(), name: 'PER', ceiling: null, balance: 0, history: [] },
      ],
    },
    settings: {
      name: 'Gwenn',
      pinHash: null,
      google: { clientId: '', calendars: {}, reminderCalId: null, reminderError: null },
      ms: { clientId: '', listPerso: null, listIsp: null, lastSync: null, lastError: null },
    },
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Complète les données enregistrées avec les champs ajoutés dans les nouvelles versions.
function merge(base, saved) {
  if (!isObj(saved)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(saved)) {
    out[k] = isObj(base[k]) && isObj(v) && k !== 'log' && k !== 'generated' && k !== 'calendars'
      ? merge(base[k], v)
      : v;
  }
  return out;
}

let state = null;
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? merge(defaults(), JSON.parse(raw)) : defaults();
  } catch {
    state = defaults();
  }
  return state;
}

export const get = () => state;

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// Enregistre puis redessine l'écran.
export function commit() {
  save();
  listeners.forEach((fn) => fn());
}

export function onChange(fn) {
  listeners.add(fn);
}

export function exportData() {
  return JSON.stringify({ app: 'sauge', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function importData(text) {
  const parsed = JSON.parse(text);
  const data = parsed.app === 'sauge' ? parsed.data : parsed;
  if (!isObj(data) || !Array.isArray(data.tasks)) throw new Error('Fichier non reconnu');
  state = merge(defaults(), data);
  commit();
}
