/**
 * WebSocket client for communicating with the bridge server.
 * Auto-reconnects on disconnect and exposes connection state.
 */
export class BridgeClient {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.requestId = 0;
    this.connected = false;
    this._url = 'ws://127.0.0.1:3001';
    this._reconnectTimer = null;
    this._onStatusChange = []; // callbacks: (connected: boolean) => void
    this.activeLedgerId = null;
  }

  /** Register a callback that fires whenever connection status changes. */
  onStatusChange(fn) {
    this._onStatusChange.push(fn);
    fn(this.connected); // fire immediately with current state
  }

  _setConnected(val) {
    if (this.connected === val) return;
    this.connected = val;
    for (const fn of this._onStatusChange) {
      try { fn(val); } catch (_) {}
    }
  }

  _clearActiveId(id) {
    if (this.activeLedgerId === id) this.activeLedgerId = null;
    if (this.activeAuditId === id) this.activeAuditId = null;
    if (this.activeFixId === id) this.activeFixId = null;
    if (this.activeCommitId === id) this.activeCommitId = null;
    if (this.activeNarrationId === id) this.activeNarrationId = null;
    try {
      window.dispatchEvent(new CustomEvent('seo-dungeon-agent-settled', { detail: { id } }));
    } catch (_) {}
  }

  connect(url) {
    if (url) this._url = url;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this._url);

      this.ws.onopen = () => {
        this._setConnected(true);
        this._clearReconnect();
        resolve();
      };

      this.ws.onerror = (err) => {
        if (!this.connected) reject(err);
      };

      this.ws.onclose = () => {
        this._setConnected(false);
        // Reject all pending handlers so callers don't hang forever
        for (const [id, handler] of this.handlers) {
          handler.reject(new Error('Bridge connection lost'));
          this.handlers.delete(id);
        }
        this._scheduleReconnect();
      };

      this.ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch (e) { console.warn('WS: bad JSON', e); return; }
        const handler = this.handlers.get(data.id);
        if (handler) {
          if (data.type === 'stream') {
            handler.onStream?.(data.content);
          } else if (data.type === 'result') {
            handler.resolve(data);
            this.handlers.delete(data.id);
            this._clearActiveId(data.id);
          } else if (data.type === 'error') {
            handler.reject(new Error(data.message));
            this.handlers.delete(data.id);
            this._clearActiveId(data.id);
          }
        }
      };
    });
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setInterval(() => {
      if (this.connected) { this._clearReconnect(); return; }
      console.log('Bridge: attempting reconnect...');
      try {
        this.connect().catch(() => {}); // swallow - onclose will retry again
      } catch (_) {}
    }, 3000);
  }

  _clearReconnect() {
    if (this._reconnectTimer) {
      clearInterval(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _ensureOpen() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Bridge server is not connected. Start it with: npm start');
    }
  }

  _runtimeFallback(runtime) {
    return runtime || window.selectedCharacter?.runtime || window.selectedRuntime || 'codex';
  }

  _dangerousBypassFallback() {
    return Boolean(window.selectedCharacter?.dangerousBypass ?? window.seoDungeonDangerousBypass);
  }

  _activeTurnId() {
    return this.activeLedgerId ||
      this.activeAuditId ||
      this.activeFixId ||
      this.activeCommitId ||
      this.activeNarrationId ||
      null;
  }

  /**
   * Neutral "talk to Codex" - used outside of battle (Demon Lodge /
   * Dungeon Hall / between fights). No demon context, no framing. The
   * message goes to Codex in the user's project directory.
   */
  chat(text, projectPath, profile, runtime, onStream) {
    if (typeof runtime === 'function') {
      onStream = runtime;
      runtime = undefined;
    }
    return new Promise((resolve, reject) => {
      try { this._ensureOpen(); } catch (e) { return reject(e); }
      const id = ++this.requestId;
      this.activeLedgerId = id;
      this.handlers.set(id, { resolve, reject, onStream });
      this.ws.send(JSON.stringify({
        id,
        type: 'chat',
        command: text,
        projectPath,
        profile,
        model: profile,
        runtime: this._runtimeFallback(runtime),
        dangerousBypass: this._dangerousBypassFallback(),
      }));
    });
  }

  /**
   * Run an SEO audit on a domain.
   */
  audit(domain, projectPath, onStream, profile, runtime) {
    return new Promise((resolve, reject) => {
      try { this._ensureOpen(); } catch (e) { return reject(e); }
      const id = ++this.requestId;
      this.activeAuditId = id;
      this.handlers.set(id, { resolve, reject, onStream });
      this.ws.send(JSON.stringify({
        id,
        type: 'audit',
        command: domain,
        projectPath,
        profile,
        model: profile,
        runtime: this._runtimeFallback(runtime),
        dangerousBypass: this._dangerousBypassFallback(),
      }));
    });
  }

  /**
   * Fix a specific SEO issue in the project.
   */
  /**
   * Send a fix/diagnose request scoped to ONE demon (SEO issue).
   *
   * @param {object} payload       { issue, userMessage }
   * @param {object} payload.issue Full issue object - severity, category,
   *                               title, description, plus any url/selector/
   *                               file/line/hp fields present.
   * @param {string} payload.userMessage  What the user typed this turn.
   *                               Can be empty, a question, or a directive.
   */
  fix(payload, projectPath, onStream, profile, runtime) {
    return new Promise((resolve, reject) => {
      try { this._ensureOpen(); } catch (e) { return reject(e); }
      const id = ++this.requestId;
      this.activeFixId = id;
      this.handlers.set(id, { resolve, reject, onStream });
      const issue = payload && payload.issue ? payload.issue : {};
      this.ws.send(JSON.stringify({
        id,
        type: 'fix',
        issue,
        userMessage: (payload && payload.userMessage) || '',
        // `command` retained as a one-line breadcrumb for server logs.
        command: `${issue.title || '(no title)'}`,
        projectPath,
        profile,
        model: profile,
        runtime: this._runtimeFallback(runtime),
        dangerousBypass: this._dangerousBypassFallback(),
      }));
    });
  }

  /**
   * Commit the current fix to git.
   */
  commit(message, projectPath, onStream, profile, runtime) {
    return new Promise((resolve, reject) => {
      try { this._ensureOpen(); } catch (e) { return reject(e); }
      const id = ++this.requestId;
      this.activeCommitId = id;
      this.handlers.set(id, { resolve, reject, onStream });
      this.ws.send(JSON.stringify({
        id,
        type: 'commit',
        command: message,
        projectPath,
        profile,
        model: profile,
        runtime: this._runtimeFallback(runtime),
        dangerousBypass: this._dangerousBypassFallback(),
      }));
    });
  }

  /**
   * Send log lines to the fast profile for RPG narration.
   */
  narrate(logLines) {
    return new Promise((resolve, reject) => {
      try { this._ensureOpen(); } catch (e) { return reject(e); }
      const id = ++this.requestId;
      this.activeNarrationId = id;
      this.handlers.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({
        id,
        type: 'narrate',
        command: logLines,
        profile: 'fast',
        model: 'fast',
        runtime: this._runtimeFallback(),
        dangerousBypass: this._dangerousBypassFallback(),
      }));
    });
  }

  openFolder(projectPath) {
    return new Promise((resolve, reject) => {
      try { this._ensureOpen(); } catch (e) { return reject(e); }
      const id = ++this.requestId;
      this.handlers.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({
        id,
        type: 'open-folder',
        projectPath,
      }));
    });
  }

  /**
   * Steer the active agent turn without cancelling it or starting a new turn.
   */
  steer(text, targetId) {
    return new Promise((resolve, reject) => {
      try { this._ensureOpen(); } catch (e) { return reject(e); }
      const clean = String(text || '').trim();
      if (!clean) return reject(new Error('Nothing to steer.'));
      const activeId = targetId || this._activeTurnId();
      if (!activeId) return reject(new Error('No active turn to steer.'));
      const id = ++this.requestId;
      this.handlers.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({
        id,
        type: 'steer',
        targetId: activeId,
        command: clean,
      }));
    });
  }

  /** Cancel the current neutral ledger request, if one is running. */
  cancelLedger() {
    if (this.activeLedgerId) {
      this.cancel(this.activeLedgerId);
      this.activeLedgerId = null;
    }
  }

  /**
   * Cancel a running request by its ID.
   */
  cancel(id) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ id, type: 'cancel' }));
    }
    const handler = this.handlers.get(id);
    if (handler) {
      handler.reject(new Error('Cancelled by user'));
      this.handlers.delete(id);
      this._clearActiveId(id);
    }
  }

  /**
   * Cancel all pending requests.
   */
  cancelAll() {
    for (const [id] of this.handlers) {
      this.cancel(id);
    }
  }

  disconnect() {
    this._clearReconnect();
    if (this.ws) this.ws.close();
  }
}

// Singleton
export const bridge = new BridgeClient();
