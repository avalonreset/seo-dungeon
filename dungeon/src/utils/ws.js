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
    this._url = this._configuredUrl();
    this._reconnectTimer = null;
    this._onStatusChange = []; // callbacks: (connected: boolean) => void
    this.activeLedgerId = null;
    this.capabilities = null;
    this.supportsSteer = null;
    this._capabilitiesChecked = false;
    this._capabilitiesPromise = null;
  }

  _configuredUrl() {
    const fallback = 'ws://127.0.0.1:3003';
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('bridge');
      const fromGlobal = window.SEO_DUNGEON_BRIDGE_URL;
      const fromStorage = localStorage.getItem('seo_dungeon_bridge_url');
      const candidate = fromQuery || fromGlobal || fromStorage || fallback;
      const url = new URL(candidate);
      if (url.protocol === 'ws:' || url.protocol === 'wss:') return url.href;
    } catch (_) {}
    return fallback;
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
        this._capabilitiesChecked = false;
        this._clearReconnect();
        resolve();
        this.refreshCapabilities().catch(() => {});
      };

      this.ws.onerror = (err) => {
        if (!this.connected) reject(err);
      };

      this.ws.onclose = () => {
        this._setConnected(false);
        this.capabilities = null;
        this.supportsSteer = null;
        this._capabilitiesChecked = false;
        this._capabilitiesPromise = null;
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
        if (data.type === 'status') {
          this._emitAgentStatus(data.status || {}, data.id || null);
          this.handlers.get(data.id)?.onStatus?.(data.status || {});
          return;
        }
        if (data.type === 'session-event' && !data.id) {
          this._emitSessionEvent(data.event || {});
          return;
        }
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

  _emitAgentStatus(status, id = null) {
    try {
      window.dispatchEvent(new CustomEvent('seo-dungeon-agent-status', {
        detail: { ...(status || {}), id }
      }));
    } catch (_) {}
  }

  _emitSessionEvent(event) {
    try {
      window.dispatchEvent(new CustomEvent('seo-dungeon-session-event', {
        detail: event || {}
      }));
    } catch (_) {}
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

  _emitCapabilitiesChange() {
    try {
      window.dispatchEvent(new CustomEvent('seo-dungeon-bridge-capabilities', {
        detail: {
          capabilities: this.capabilities,
          supportsSteer: this.supportsSteer,
        }
      }));
    } catch (_) {}
  }

  _setCapabilities(capabilities) {
    this.capabilities = capabilities || null;
    this.supportsSteer = Boolean(capabilities?.supportsSteer);
    this._capabilitiesChecked = true;
    this._emitCapabilitiesChange();
    return this.capabilities;
  }

  _requestControl(payload) {
    return new Promise((resolve, reject) => {
      try { this._ensureOpen(); } catch (e) { return reject(e); }
      const id = ++this.requestId;
      this.handlers.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, ...payload }));
    });
  }

  async _probeSteerSupport() {
    try {
      await this._requestControl({
        type: 'steer',
        targetId: -1,
        command: '__seo_dungeon_steer_capability_probe__',
      });
      return this._setCapabilities({
        version: null,
        protocol: 1,
        supportsSteer: true,
        steerMode: 'legacy-probe',
      });
    } catch (err) {
      const message = String(err?.message || '');
      const supportsSteer = !/Unknown command type:\s*steer/i.test(message);
      return this._setCapabilities({
        version: null,
        protocol: 1,
        supportsSteer,
        steerMode: supportsSteer ? 'legacy-probe' : 'unsupported',
      });
    }
  }

  refreshCapabilities({ force = false } = {}) {
    if (this._capabilitiesPromise && !force) return this._capabilitiesPromise;
    if (this._capabilitiesChecked && !force) return Promise.resolve(this.capabilities);
    this._capabilitiesPromise = (async () => {
      try {
        const response = await this._requestControl({ type: 'capabilities' });
        return this._setCapabilities(response?.data || {});
      } catch (err) {
        const message = String(err?.message || '');
        if (/Unknown command type:\s*capabilities/i.test(message)) {
          return this._probeSteerSupport();
        }
        this._capabilitiesChecked = true;
        this._emitCapabilitiesChange();
        return this.capabilities;
      } finally {
        this._capabilitiesPromise = null;
      }
    })();
    return this._capabilitiesPromise;
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
      null;
  }

  /**
   * Neutral "talk to Codex" - used outside of battle (Demon Lodge /
   * Dungeon Hall / between fights). No demon context, no framing. The
   * message goes to Codex in the user's project directory.
   */
  chat(text, projectPath, profile, runtime, onStream, options = {}) {
    if (typeof runtime === 'function') {
      onStream = runtime;
      runtime = undefined;
    }
    if (onStream && typeof onStream === 'object') {
      options = onStream;
      onStream = undefined;
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
        dangerousBypass: options.dangerousBypass ?? this._dangerousBypassFallback(),
        source: options.source || undefined,
        sourceCommandId: options.commandId || undefined,
      }));
    });
  }

  publishSessionEvent(event) {
    return this._requestControl({
      type: 'session-event',
      event: event || {},
    });
  }

  remoteCommand(command, options = {}) {
    return this._requestControl({
      type: 'remote-command',
      command,
      ...options,
    });
  }

  claimRemoteCommand(commandId) {
    return this._requestControl({
      type: 'remote-command-claim',
      commandId,
    });
  }

  sessionState() {
    return this._requestControl({ type: 'session-state' });
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
    return new Promise(async (resolve, reject) => {
      try { this._ensureOpen(); } catch (e) { return reject(e); }
      const clean = String(text || '').trim();
      if (!clean) return reject(new Error('Nothing to steer.'));
      const activeId = targetId || this._activeTurnId();
      if (!activeId) return reject(new Error('No active turn to steer.'));
      try {
        if (this.supportsSteer !== true) await this.refreshCapabilities();
      } catch (_) {}
      if (this.supportsSteer === false) {
        return reject(new Error('This SEO Dungeon bridge does not support live steering. Restart SEO Dungeon from the latest release and try again.'));
      }
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
