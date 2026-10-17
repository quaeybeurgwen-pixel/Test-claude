// Formations ISP (Greffier, DSGJ, Cadre greffier…) : libellés et pastilles de couleur.
import { get } from './store.js';
import { esc } from './util.js';

export const formations = () => get().isp.formations;
export const findFormation = (id) => formations().find((f) => f.id === id) || null;

// Filtre « rattaché à la formation » ; 'nc' = non rattaché.
export const inFormation = (fid) => (x) => (fid === 'nc' ? !findFormation(x.formationId) : x.formationId === fid);

export function formationOptions(withNone = true) {
  return [
    ...(withNone ? [{ value: '', label: '— Aucune —' }] : []),
    ...formations().map((f) => ({ value: f.id, label: f.name })),
  ];
}

// Pastille : point de couleur + nom (la couleur n'est jamais seule porteuse du sens).
export function formationChip(id, fallback = 'ISP') {
  const f = findFormation(id);
  const color = f && f.color != null && f.color < 3 ? `f-${f.color}` : 'f-none';
  return `<span class="chip chip-formation"><span class="f-dot ${color}"></span>${esc(f ? f.name : fallback)}</span>`;
}

export const formationDot = (id) => {
  const f = findFormation(id);
  return `<span class="f-dot ${f && f.color < 3 ? `f-${f.color}` : 'f-none'}"></span>`;
};
