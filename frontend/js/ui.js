// UI utilities shared across modules
import { els } from './dom.js';

export function toast(msg, kind = 'info') {
  // Ensure a notifications container exists even without the main drawer
  let container = els.hexNotifications || document.getElementById('hexNotifications');
  if (!container) {
    container = document.createElement('div');
    container.id = 'hexNotifications';
    container.className = 'hex-notify global';
    // Minimal positioning fallback
    container.style.position = 'fixed';
    container.style.top = '12px';
    container.style.right = '12px';
    container.style.zIndex = 9999;
    document.body.appendChild(container);
  }
  const b = document.createElement('div');
  b.className = 'hex-bubble ' + (kind === 'error' ? 'error' : kind === 'warn' ? 'warn' : '');
  b.textContent = msg;
  container.appendChild(b);
  setTimeout(() => b.classList.add('fade-out'), 1800);
  setTimeout(() => b.remove(), 2200);
}

export function toggleDrawer(panel, from) {
  if (!panel) return;
  const isHidden = panel.classList.contains('hidden') || !panel.classList.contains('show');
  panel.classList.add('from-' + from);
  panel.classList.remove('hidden');
  if (isHidden) {
    panel.classList.add('show');
  } else {
    panel.classList.remove('show');
    setTimeout(() => panel.classList.add('hidden'), 250);
  }
}

export function showModal(modal, show) {
  if (!modal) return;
  modal.classList.toggle('hidden', !show);
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
