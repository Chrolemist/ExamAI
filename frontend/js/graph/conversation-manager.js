// Conversation manager: link multiple copilots to share history and enforce turn-taking
import { toast } from '../ui.js';

export const ConversationManager = (() => {
  const conversations = new Map();

  function ensureConv(convId) {
    if (conversations.has(convId)) return conversations.get(convId);
    const conv = { members: new Set(), history: [], turnIdx: 0, pending: [], busy: false };
    conversations.set(convId, conv);
    return conv;
  }
  function create() {
    const id = 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    ensureConv(id);
    return id;
  }
  function addMember(convId, copilot) {
    const conv = ensureConv(convId);
    conv.members.add(copilot.id);
    copilot._convId = convId;
  }
  function link(a, b) {
    const convId = a._convId || b._convId || create();
    addMember(convId, a);
    addMember(convId, b);
    return convId;
  }
  function getMembers(convId) {
    const conv = conversations.get(convId);
    return conv ? Array.from(conv.members) : [];
  }
  function getHistory(convId) {
    const conv = conversations.get(convId);
    return conv ? conv.history : null;
  }
  function recordAssistant(convId, assistantMsg) {
    const conv = conversations.get(convId);
    if (!conv) return;
    conv.history.push({ role: 'assistant', content: assistantMsg });
  }
  function renderUserInMembers(convId, msg, senderId) {
    const ids = getMembers(convId);
    const authorName = (window.getGlobalUserName || (() => 'Du'))();
    ids.forEach(id => {
      const inst = window.CopilotManager?.instances?.get(id);
      if (!inst) return;
      if (id !== senderId) inst.addUser(msg, authorName);
    });
  }
  function renderAssistantInMembers(convId, msg, authorName) {
    const ids = getMembers(convId);
    ids.forEach(id => {
      const inst = window.CopilotManager?.instances?.get(id);
      if (!inst) return;
      if (typeof inst.renderAssistantReply === 'function') {
        inst.renderAssistantReply(msg, authorName);
      } else if ((inst.renderMode || 'raw') === 'md') {
        inst.addAssistant(msg, authorName);
      } else {
        inst.addAssistant(msg, authorName);
      }
    });
  }
  async function process(convId) {
    const conv = conversations.get(convId);
    if (!conv || conv.busy) return;
    if (window.PauseManager?.isPaused?.()) return;
    if (!conv.pending.length) return;
    conv.busy = true;
    const ids = getMembers(convId);
    if (!ids.length) { conv.busy = false; return; }
    conv.turnIdx = (conv.turnIdx + 1) % ids.length;
    const nextId = ids[conv.turnIdx];
    const responder = window.CopilotManager?.instances?.get(nextId) || window.CopilotManager?.instances?.values()?.next()?.value;
    window.CopilotManager?.instances?.forEach(inst => inst.panel.classList.remove('active-speaking'));
    if (responder) responder.panel.classList.add('active-speaking');
    const messages = conv.history.slice();
    try {
      const reply = await responder.generateReply(messages);
      const text = reply || '(inget svar)';
      recordAssistant(convId, text);
      renderAssistantInMembers(convId, text, responder ? responder.name : undefined);
    } catch (e) {
      renderAssistantInMembers(convId, 'Nätverksfel.', responder ? responder.name : undefined);
    } finally {
      if (responder) responder.panel.classList.remove('active-speaking');
      conv.busy = false;
      if (conv.pending.length) setTimeout(() => process(convId), 20);
    }
  }
  function enqueueUser(sender, msg) {
    const conv = conversations.get(sender._convId);
    if (!conv) return;
    if (window.PauseManager?.isPaused?.()) {
      conv.history.push({ role: 'user', content: msg });
      renderUserInMembers(sender._convId, msg, sender.id);
      conv.pending.push({ from: sender.id, msg });
      toast('Flöde pausat – meddelandet köades.', 'warn');
      return;
    }
    conv.history.push({ role: 'user', content: msg });
    renderUserInMembers(sender._convId, msg, sender.id);
    conv.pending.push({ from: sender.id, msg });
    if (!conv.busy) process(sender._convId);
  }
  function resumeAll() {
    conversations.forEach((conv, id) => {
      if (conv.pending.length && !conv.busy) process(id);
    });
  }
  function removeMember(convId, copilot) {
    const conv = conversations.get(convId);
    if (!conv) return;
    conv.members.delete(copilot.id);
    const size = conv.members.size;
    if (size <= 0) { conversations.delete(convId); return; }
    if (size === 1) {
      const remainingId = Array.from(conv.members)[0];
      const remainingInst = window.CopilotManager?.instances?.get(remainingId);
      if (remainingInst) {
        try { for (const m of conv.history || []) { if (m && m.role) remainingInst.history.push(m); } } catch {}
        conv.pending = []; conv.busy = false; try { remainingInst._convId = null; } catch {}
      }
      conversations.delete(convId);
      return;
    }
    conv.turnIdx = conv.turnIdx % size;
  }
  function removePendingFor(copilotId) {
    conversations.forEach((conv) => {
      if (!conv || !Array.isArray(conv.pending)) return;
      const before = conv.pending.length;
      conv.pending = conv.pending.filter(p => p && p.from !== copilotId);
      if (conv.pending.length !== before) {
        if (!conv.pending.length) conv.busy = false;
      }
    });
  }
  return { link, addMember, getMembers, getHistory, recordAssistant, enqueueUser, removeMember, resumeAll, removePendingFor };
})();
