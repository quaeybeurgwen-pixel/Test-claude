// Écran de verrouillage par code PIN (à l'ouverture et après 5 minutes en arrière-plan).
// Il protège l'accès à l'écran ; les données restent stockées sur le téléphone.
import { get } from './store.js';

const SESSION_KEY = 'sauge.unlocked';
const RELOCK_AFTER = 5 * 60 * 1000;

export async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`sauge:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function showLock() {
  return new Promise((resolve) => {
    let entry = '';
    const el = document.createElement('div');
    el.className = 'lock';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    el.innerHTML = `
      <div class="lock-inner">
        <p class="lock-title">Bonjour ${get().settings.name || ''}</p>
        <p class="lock-sub">Saisissez votre code</p>
        <div class="dots" aria-hidden="true">${'<span></span>'.repeat(4)}</div>
        <div class="keypad">
          ${keys.map((k) => (k ? `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Effacer' : k}">${k}</button>` : '<span></span>')).join('')}
        </div>
      </div>`;
    const dots = el.querySelectorAll('.dots span');
    const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < entry.length));
    el.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (!k) return;
      entry = k === '⌫' ? entry.slice(0, -1) : (entry + k).slice(0, 4);
      paint();
      if (entry.length === 4) {
        if (await hashPin(entry) === get().settings.pinHash) {
          sessionStorage.setItem(SESSION_KEY, '1');
          el.remove();
          resolve();
        } else {
          el.querySelector('.dots').classList.add('shake');
          setTimeout(() => { el.querySelector('.dots').classList.remove('shake'); entry = ''; paint(); }, 450);
        }
      }
    });
    document.body.appendChild(el);
  });
}

export async function ensureUnlocked() {
  if (!get().settings.pinHash || sessionStorage.getItem(SESSION_KEY)) return;
  await showLock();
}

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
  } else if (get()?.settings.pinHash && hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER && !document.querySelector('.lock')) {
    sessionStorage.removeItem(SESSION_KEY);
    showLock();
  }
});
