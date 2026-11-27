(() => {
  const DEFAULT_LIMIT = 8;
  const DEFAULT_HOURS = 24;
  const DEFAULT_INSTANCE = "frigate";

  const labelTitle = (label) =>
    (label || "event").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const formatTime = (epoch) => {
    if (!epoch) return "";
    const d = new Date(epoch * 1000);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  class SecurityEventsCard extends HTMLElement {
    setConfig(config) {
      if (!config || !config.camera) {
        throw new Error("security-events-card: camera is required");
      }
      this._config = config;
      this._events = [];
      this._error = null;
      this._loading = false;
      this._timer = null;
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._root) {
        this._build();
        this._refresh();
        this._timer = setInterval(() => this._refresh(), 30000);
      }
    }

    disconnectedCallback() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
      this._closePlayer();
    }

    getCardSize() {
      return 6;
    }

    _build() {
      this._root = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
        :host { display: block; }
        ha-card { overflow: hidden; }
        .list { display: flex; flex-direction: column; }
        .row {
          display: flex; gap: 12px; align-items: center;
          padding: 8px 12px; cursor: pointer;
          border-top: 1px solid var(--divider-color, rgba(0,0,0,.12));
        }
        .row:first-child { border-top: none; }
        .row:hover, .row:focus { background: var(--secondary-background-color, rgba(0,0,0,.06)); outline: none; }
        .thumb {
          width: 132px; height: 74px; flex: 0 0 132px;
          object-fit: cover; border-radius: 6px; background: #111;
        }
        .meta { min-width: 0; flex: 1; }
        .label { font-weight: 600; color: var(--primary-text-color); line-height: 1.2; }
        .time { color: var(--secondary-text-color); font-size: 0.85em; margin-top: 4px; }
        .empty, .error {
          padding: 16px 12px; color: var(--secondary-text-color);
        }
        .error { color: var(--error-color, #c00); }
        .player {
          position: fixed; inset: 0; z-index: 10000;
          background: rgba(0,0,0,.72);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
        }
        .player-box {
          width: min(960px, 100%);
          background: var(--ha-card-background, #111);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 12px 40px rgba(0,0,0,.4);
        }
        .player-bar {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 14px; color: var(--primary-text-color, #fff);
          background: var(--app-header-background-color, #1c1c1c);
        }
        .player-bar button {
          background: transparent; border: 0; color: inherit;
          font-size: 22px; line-height: 1; cursor: pointer; padding: 4px 8px;
        }
        video { width: 100%; max-height: 80vh; background: #000; display: block; }
      `;
      const card = document.createElement("ha-card");
      this._list = document.createElement("div");
      this._list.className = "list";
      this._list.innerHTML = `<div class="empty">Loading events…</div>`;
      card.appendChild(this._list);
      this._root.appendChild(style);
      this._root.appendChild(card);
    }

    async _refresh() {
      if (!this._hass || this._loading) return;
      this._loading = true;
      const hours = this._config.hours || DEFAULT_HOURS;
      const after = Math.floor(Date.now() / 1000) - hours * 3600;
      try {
        let result = await this._hass.connection.sendMessagePromise({
          type: "frigate/events/get",
          instance_id: this._config.instance_id || DEFAULT_INSTANCE,
          cameras: [this._config.camera],
          has_clip: true,
          limit: this._config.limit || DEFAULT_LIMIT,
          after,
        });
        if (typeof result === "string") {
          result = JSON.parse(result);
        }
        this._events = Array.isArray(result) ? result : [];
        this._error = null;
      } catch (err) {
        this._error = "Could not load events";
        this._events = [];
      }
      this._loading = false;
      this._draw();
    }

    _url(path) {
      if (this._hass && this._hass.hassUrl) return this._hass.hassUrl(path);
      return path;
    }

    _draw() {
      const limit = this._config.limit || DEFAULT_LIMIT;
      if (this._error) {
        this._list.innerHTML = `<div class="error">${this._error}</div>`;
        return;
      }
      const events = this._events.slice(0, limit);
      if (!events.length) {
        this._list.innerHTML = `<div class="empty">No event clips yet</div>`;
        return;
      }
      this._list.innerHTML = "";
      for (const ev of events) {
        const row = document.createElement("div");
        row.className = "row";
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        const img = document.createElement("img");
        img.className = "thumb";
        img.alt = labelTitle(ev.label);
        img.src = this._url(`/api/frigate/notifications/${ev.id}/thumbnail.jpg`);
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.innerHTML = `<div class="label">${labelTitle(ev.label)}</div><div class="time">${formatTime(ev.start_time)}</div>`;
        row.appendChild(img);
        row.appendChild(meta);
        const open = () => this._play(ev);
        row.addEventListener("click", open);
        row.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        });
        this._list.appendChild(row);
      }
    }

    _play(ev) {
      this._closePlayer();
      const overlay = document.createElement("div");
      overlay.className = "player";
      const box = document.createElement("div");
      box.className = "player-box";
      const bar = document.createElement("div");
      bar.className = "player-bar";
      const title = document.createElement("div");
      title.textContent = `${labelTitle(ev.label)} · ${formatTime(ev.start_time)}`;
      const close = document.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      close.textContent = "×";
      bar.appendChild(title);
      bar.appendChild(close);
      const video = document.createElement("video");
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.src = this._url(`/api/frigate/notifications/${ev.id}/clip.mp4`);
      box.appendChild(bar);
      box.appendChild(video);
      overlay.appendChild(box);
      const stop = (e) => {
        if (e.target === overlay || e.target === close || e.key === "Escape") {
          e.preventDefault?.();
          this._closePlayer();
        }
      };
      overlay.addEventListener("click", stop);
      close.addEventListener("click", stop);
      this._esc = (e) => stop(e);
      document.addEventListener("keydown", this._esc);
      // Attach to document.body so a transformed card cannot clip or offset the player.
      if (!document.getElementById("security-events-player-style")) {
        const s = document.createElement("style");
        s.id = "security-events-player-style";
        s.textContent = `
          .security-events-player { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.72);
            display: flex; align-items: center; justify-content: center; padding: 24px; }
          .security-events-player-box { width: min(960px, 100%); background: #111; border-radius: 12px; overflow: hidden;
            box-shadow: 0 12px 40px rgba(0,0,0,.4); }
          .security-events-player-bar { display: flex; justify-content: space-between; align-items: center;
            padding: 10px 14px; color: #fff; background: #1c1c1c; }
          .security-events-player-bar button { background: transparent; border: 0; color: inherit;
            font-size: 22px; line-height: 1; cursor: pointer; padding: 4px 8px; }
          .security-events-player video { width: 100%; max-height: 80vh; background: #000; display: block; }
        `;
        document.head.appendChild(s);
      }
      overlay.className = "security-events-player";
      box.className = "security-events-player-box";
      bar.className = "security-events-player-bar";
      document.body.appendChild(overlay);
      this._player = { overlay, video };
    }

    _closePlayer() {
      if (this._esc) {
        document.removeEventListener("keydown", this._esc);
        this._esc = null;
      }
      if (this._player) {
        try {
          this._player.video.pause();
          this._player.video.src = "";
        } catch (_) {}
        this._player.overlay.remove();
        this._player = null;
      }
    }
  }

  if (!customElements.get("security-events-card")) {
    customElements.define("security-events-card", SecurityEventsCard);
  }
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "security-events-card")) {
    window.customCards.push({
      type: "security-events-card",
      name: "Security events",
      description: "Recent Frigate event clips for a camera",
    });
  }
})();
