// Réglages : prénom, code PIN, connexions Google Agenda et Microsoft To Do, sauvegarde.
import { get, commit, exportData, importData } from '../store.js';
import { esc } from '../util.js';
import { bindActions, header, openForm, toast } from '../ui.js';
import { icon } from '../icons.js';
import { hashPin } from '../lock.js';
import * as google from '../integrations/google.js';
import * as ms from '../integrations/microsoft.js';

let msLists = null;

function googleCard() {
  const g = get().settings.google;
  const cals = Object.entries(g.calendars);
  let body;
  if (!google.isConfigured()) {
    body = `<p class="muted">Renseignez l'identifiant client OAuth créé dans Google Cloud (voir le guide, étape « Google Agenda »).</p>`;
  } else {
    body = `
      <p>${google.tokenValid() ? '<span class="badge ok">Connecté</span>' : google.hasCache() ? '<span class="badge">Session expirée — agenda en cache</span>' : '<span class="badge">Non connecté</span>'}</p>
      <div class="row-btns">
        <button class="btn primary" data-act="g-connect">${google.tokenValid() ? 'Actualiser' : 'Se connecter à Google'}</button>
        ${google.hasCache() || cals.length ? '<button class="btn ghost" data-act="g-disconnect">Déconnecter</button>' : ''}
      </div>
      ${cals.length ? `<h3>Agendas affichés</h3><ul class="list">${cals.map(([id, c]) => `
        <li class="item">
          <input type="color" value="${esc(c.color)}" data-cal-color="${esc(id)}" aria-label="Couleur de ${esc(c.name)}">
          <span class="item-main static"><span class="item-title">${esc(c.name)}</span></span>
          <label class="switch"><input type="checkbox" data-cal-show="${esc(id)}" ${c.show ? 'checked' : ''}><span></span><span class="sr-only">Afficher ${esc(c.name)}</span></label>
        </li>`).join('')}</ul>` : ''}
      ${remindersBlock()}`;
  }
  return `
    <section class="card">
      <div class="card-head"><h2>${icon('calendar', 18)} Google Agenda</h2></div>
      ${body}
      <button class="link-btn" data-act="g-client">${google.isConfigured() ? 'Modifier l\'identifiant client' : 'Saisir l\'identifiant client'}</button>
      <p class="hint">Adresse de redirection à déclarer chez Google : <code>${esc(google.redirectUri())}</code></p>
    </section>`;
}

function remindersBlock() {
  const g = get().settings.google;
  const pending = google.pendingReminders();
  let status;
  if (google.remindersReady()) {
    status = g.reminderError
      ? `<p class="late small">${icon('alert', 13)} ${esc(g.reminderError)}</p>`
      : `<p class="small"><span class="badge ok">Actifs</span> ${pending ? `${pending} en cours d'envoi…` : 'Tous les rappels sont envoyés.'}</p>`;
  } else if (google.tokenValid()) {
    status = `<p class="small late">${icon('alert', 13)} Autorisation des rappels manquante.</p>
      <button class="btn ghost" data-act="g-reconnect">Autoriser les rappels</button>`;
  } else {
    status = `<p class="small muted">${pending ? `${pending} rappel(s) en attente : connectez-vous à Google pour les envoyer.` : 'Connectez-vous à Google pour activer les rappels.'}</p>`;
  }
  return `
    <h3>${icon('bell', 15)} Rappels des tâches</h3>
    <p class="hint">Chaque tâche avec une heure de rappel devient un événement avec notification dans l'agenda « Gwennou App — Rappels ».</p>
    ${status}`;
}

function msCard() {
  const s = get().settings.ms;
  let body;
  if (!s.clientId) {
    body = `<p class="muted">Renseignez l'identifiant d'application créé dans le portail Microsoft (voir le guide, étape « Microsoft To Do »).</p>`;
  } else if (!ms.isConnected()) {
    body = `<button class="btn primary" data-act="ms-connect">Se connecter à Microsoft</button>`;
  } else {
    const options = (selected) => (msLists || []).map((l) => `<option value="${esc(l.id)}" ${l.id === selected ? 'selected' : ''}>${esc(l.displayName)}</option>`).join('');
    body = `
      <p><span class="badge ok">Connecté</span>${s.lastSync ? ` <span class="muted small">Dernière synchro : ${esc(new Date(s.lastSync).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</span>` : ''}</p>
      ${s.lastError ? `<p class="late small">${icon('alert', 13)} ${esc(s.lastError)}</p>` : ''}
      ${msLists ? `
        <div class="field"><label for="ms-perso">Liste To Do pour les tâches perso</label>
          <select id="ms-perso" data-ms-list="listPerso"><option value="">— choisir —</option>${options(s.listPerso)}</select></div>
        <div class="field"><label for="ms-isp">Liste To Do pour l'ISP</label>
          <select id="ms-isp" data-ms-list="listIsp"><option value="">— même liste que perso —</option>${options(s.listIsp)}</select></div>
        <button class="link-btn" data-act="ms-create-isp">${icon('plus', 15)} Créer une liste « ISP » dans To Do</button>`
    : '<button class="btn ghost" data-act="ms-load-lists">Choisir les listes To Do</button>'}
      <div class="row-btns">
        <button class="btn primary" data-act="ms-sync" ${s.listPerso ? '' : 'disabled'}>${icon('refresh', 16)} Synchroniser</button>
        <button class="btn ghost" data-act="ms-disconnect">Déconnecter</button>
      </div>`;
  }
  return `
    <details class="card">
      <summary class="card-head"><h2>${icon('check', 18)} Microsoft To Do (facultatif)</h2></summary>
      ${body}
      <button class="link-btn" data-act="ms-client">${s.clientId ? 'Modifier l\'identifiant d\'application' : 'Saisir l\'identifiant d\'application'}</button>
      <p class="hint">Adresse de redirection (type « Application monopage ») : <code>${esc(ms.redirectUri())}</code></p>
      <p class="hint">Synchronise les tâches avec Microsoft To Do (nécessite un compte Azure, voir le guide).</p>
    </details>`;
}

export function render() {
  const s = get().settings;
  return `
    ${header('Réglages')}
    <section class="card">
      <div class="card-head"><h2>Profil et sécurité</h2></div>
      <div class="field"><label for="set-name">Prénom</label><input id="set-name" value="${esc(s.name)}" autocomplete="off"></div>
      <div class="row-btns">
        <button class="btn ghost" data-act="pin-set">${s.pinHash ? 'Changer le code PIN' : 'Définir un code PIN'}</button>
        ${s.pinHash ? '<button class="btn ghost danger" data-act="pin-remove">Retirer le code</button>' : ''}
      </div>
    </section>
    ${googleCard()}
    ${msCard()}
    <section class="card">
      <div class="card-head"><h2>Sauvegarde</h2></div>
      <p class="muted">Vos données sont enregistrées uniquement sur ce téléphone. Exportez-les régulièrement (par exemple dans iCloud Drive) pour ne rien perdre.</p>
      <div class="row-btns">
        <button class="btn primary" data-act="export">Exporter</button>
        <label class="btn ghost">Importer<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
    </section>
    <p class="muted small center">Gwennou App · version 1.0</p>`;
}

async function share(text) {
  const name = `gwennou-app-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde Gwennou App' });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function mount(root) {
  const s = get().settings;
  root.querySelector('#set-name').addEventListener('change', (e) => { s.name = e.target.value.trim(); commit(); });

  root.querySelectorAll('[data-cal-show]').forEach((el) => el.addEventListener('change', () => {
    s.google.calendars[el.dataset.calShow].show = el.checked;
    commit();
    if (el.checked && google.tokenValid()) google.refresh().catch((e) => toast(e.message));
  }));
  root.querySelectorAll('[data-cal-color]').forEach((el) => el.addEventListener('change', () => {
    const c = s.google.calendars[el.dataset.calColor];
    c.color = el.value;
    c.customColor = el.value;
    commit();
  }));
  root.querySelectorAll('[data-ms-list]').forEach((el) => el.addEventListener('change', () => {
    s.ms[el.dataset.msList] = el.value || null;
    commit();
    if (s.ms.listPerso) ms.requestSync(300);
  }));
  root.querySelector('[data-import]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Remplacer toutes les données de l\'application par celles du fichier ?')) return;
    try {
      importData(await file.text());
      toast('Données importées');
    } catch (err) {
      toast(`Import impossible : ${err.message}`);
    }
  });

  bindActions(root, {
    'pin-set': () => openForm({
      title: 'Code PIN',
      fields: [
        { name: 'pin', label: 'Nouveau code (4 chiffres)', type: 'password', required: true },
        { name: 'pin2', label: 'Confirmer le code', type: 'password', required: true },
      ],
      async onSubmit(v) {
        if (!/^\d{4}$/.test(v.pin)) { toast('Le code doit contenir 4 chiffres'); return false; }
        if (v.pin !== v.pin2) { toast('Les deux codes sont différents'); return false; }
        s.pinHash = await hashPin(v.pin);
        sessionStorage.setItem('sauge.unlocked', '1');
        commit();
        toast('Code PIN enregistré');
      },
    }),
    'pin-remove': () => {
      if (!confirm('Retirer le code PIN ?')) return;
      s.pinHash = null;
      commit();
    },
    'g-client': () => openForm({
      title: 'Google Agenda',
      fields: [{ name: 'clientId', label: 'Identifiant client OAuth', value: google.clientId(), placeholder: '…apps.googleusercontent.com' }],
      onSubmit(v) { s.google.clientId = v.clientId || ''; commit(); },
    }),
    'g-connect': () => {
      if (!google.tokenValid()) { google.connect('#/reglages'); return; }
      google.refresh().catch((e) => toast(e.message));
      google.syncReminders().then(() => toast(get().settings.google.reminderError || 'Agenda et rappels à jour'));
    },
    'g-reconnect': () => google.connect('#/reglages'),
    'g-disconnect': () => { if (confirm('Déconnecter Google Agenda ?')) google.disconnect(); },
    'ms-client': () => openForm({
      title: 'Microsoft To Do',
      fields: [{ name: 'clientId', label: 'Identifiant d\'application (client)', value: s.ms.clientId, placeholder: '00000000-0000-0000-0000-000000000000' }],
      onSubmit(v) { s.ms.clientId = v.clientId || ''; commit(); },
    }),
    'ms-connect': () => ms.connect('#/reglages'),
    'ms-load-lists': async () => {
      try {
        msLists = await ms.fetchLists();
        if (!s.ms.listPerso) {
          s.ms.listPerso = msLists.find((l) => l.wellknownListName === 'defaultList')?.id || null;
          s.ms.listIsp = msLists.find((l) => /^isp$/i.test(l.displayName.trim()))?.id || null;
          commit();
        } else {
          rerender();
        }
      } catch (e) {
        toast(e.message);
      }
    },
    'ms-create-isp': async () => {
      try {
        const l = await ms.createList('ISP');
        msLists = [...(msLists || []), l];
        s.ms.listIsp = l.id;
        commit();
        toast('Liste « ISP » créée');
      } catch (e) {
        toast(e.message);
      }
    },
    'ms-sync': async () => {
      toast('Synchronisation…');
      await ms.sync();
      toast(s.ms.lastError ? `Erreur : ${s.ms.lastError}` : 'Synchronisé');
    },
    'ms-disconnect': () => {
      if (!confirm('Déconnecter Microsoft To Do ? Les tâches restent dans l\'application.')) return;
      msLists = null;
      ms.disconnect();
    },
    export: () => share(exportData()),
  });
}
