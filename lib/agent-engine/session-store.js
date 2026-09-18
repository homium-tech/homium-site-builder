const crypto = require('crypto');

class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  getOrCreate(sessionId, engine = 'claude') {
    const id = sessionId || crypto.randomUUID();
    if (!this.sessions.has(id)) {
      this.sessions.set(id, {
        id,
        engine,
        currentEngine: engine,
        engineTurnCount: { [engine]: 0 },
        messageCount: 0,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastActiveAt: Date.now()
      });
    }
    const session = this.sessions.get(id);
    if (session.engine !== engine) {
      session.previousEngine = session.engine;
      session.engine = engine;
      session.currentEngine = engine;
      if (!session.engineTurnCount) session.engineTurnCount = {};
      if (!session.engineTurnCount[engine]) {
        session.engineTurnCount[engine] = 0;
      }
    }
    session.lastActiveAt = Date.now();
    session.updatedAt = Date.now();
    return session;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  has(sessionId) {
    return this.sessions.has(sessionId);
  }

  incrementTurn(sessionId, engine = null) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messageCount++;
      const eng = engine || session.engine;
      if (!session.engineTurnCount) session.engineTurnCount = {};
      session.engineTurnCount[eng] = (session.engineTurnCount[eng] || 0) + 1;
      session.updatedAt = Date.now();
      session.lastActiveAt = Date.now();
      return session.messageCount;
    }
    return 0;
  }

  addMessage(sessionId, role, content) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (!session.messages) session.messages = [];
    session.messages.push({ role, content, ts: Date.now() });
    // Keep last 10 messages (5 exchanges) to avoid token bloat
    if (session.messages.length > 10) {
      session.messages = session.messages.slice(-10);
    }
  }

  getHistory(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.messages || session.messages.length === 0) return '';
    return session.messages
      .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
      .join('\n\n');
  }

  reset(sessionId) {
    if (sessionId && this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  clear() {
    this.sessions.clear();
  }
}

module.exports = SessionStore;
