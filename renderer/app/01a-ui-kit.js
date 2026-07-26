/**
 * Presentational primitives: the icon set, metric cards and empty states.
 * Split out of 01-core.js to keep each module reviewable.
 */

function iconSvg(name) {
  const icons = {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/></svg>',
    signals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h4l2-5 4 10 2-5h4"/></svg>',
    journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h10l4 4v14H6z"/><path d="M16 3v5h5"/><path d="M9 12h6M9 16h6"/></svg>',
    backtest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19h16"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-3"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg>',
    capital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M15 12h.01"/><path d="M7 12h4"/></svg>',
    balance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16v10H4z"/><path d="M4 10h16"/></svg>',
    equity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 14h4l2-4 4 8 2-4h4"/></svg>',
    position: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 19V5"/><path d="M5 6h11l-2 4 2 4H5"/></svg>',
    risk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 4 7v5c0 5 3.4 8.7 8 9 4.6-.3 8-4 8-9V7l-8-4Z"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
    discipline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m7 12 3 3 7-7"/><circle cx="12" cy="12" r="9"/></svg>',
    challenge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M8 20h8"/><path d="M12 13v7"/></svg>',
    news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 6h11a3 3 0 0 1 3 3v9H8a3 3 0 0 0-3 3V6Z"/><path d="M8 18V6"/><path d="M10 10h6M10 13h6"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z"/></svg>',
    curve: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 18h16"/><path d="m5 15 4-4 4 2 6-7"/></svg>',
    compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 5h4v14H7zM13 9h4v10h-4z"/></svg>',
    source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5h6v6H5zM13 13h6v6h-6zM13 5h6v6h-6zM5 13h6v6H5z"/></svg>',
    session: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v5M12 17v5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5"/><circle cx="12" cy="12" r="4"/></svg>',
    side: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m7 17 5-10 5 10"/><path d="M7 17h10"/></svg>',
    instrument: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 17 17 4"/><path d="m14 4 6 6"/><path d="m4 14 6 6"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12 12 3h8v8l-9 9L3 12Z"/><circle cx="17" cy="7" r="1"/></svg>',
    month: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    heatmap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5h4v4H5zM10 5h4v4h-4zM15 5h4v4h-4zM5 10h4v4H5zM10 10h4v4h-4zM15 10h4v4h-4zM5 15h4v4H5zM10 15h4v4h-4zM15 15h4v4h-4z"/></svg>',
    terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m7 10 2 2-2 2M11 14h5"/></svg>',
    language: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h8M8 5c0 8-4 12-4 12"/><path d="M8 5c0 3 2 6 4 8"/><path d="M14 16h6M17 13l3 8M17 13l-3 8"/></svg>',
    maintenance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m14 7 3-3 3 3-8 8H9v-3l5-5Z"/><path d="M5 19h14"/></svg>',
    import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 14 8 16a3 3 0 1 1-4-4l2-2"/><path d="m14 10 2-2a3 3 0 1 1 4 4l-2 2"/><path d="M9 15 15 9"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>'
  };
  return icons[name] || icons.star;
}

function icon(name, cls = 'icon-inline') {
  return `<span class="${cls}" aria-hidden="true">${iconSvg(name)}</span>`;
}

function iconText(name, text, cls = 'title-with-icon', iconCls = cls === 'nav-content' ? 'nav-icon' : 'icon-inline') {
  return `<span class="${cls}">${icon(name, iconCls)}<span>${escapeHtml(text)}</span></span>`;
}

function metricCard(label, value, hint = '', tone = '', iconName = 'star') {
  return `
    <article class="metric-card ${tone}">
      <div class="metric-card-head">
        ${icon(iconName, 'metric-icon')}
        <small>${escapeHtml(label)}</small>
      </div>
      <strong>${escapeHtml(value)}</strong>
      <div class="mini">${escapeHtml(hint)}</div>
    </article>
  `;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

/**
 * A guided empty state.
 *
 * "No data yet" tells a new user nothing. Each empty list instead names what is
 * missing, explains how it gets filled, and where possible offers the action that
 * fills it. `key` maps to ui.empty.<key> which supplies title, text and action label;
 * `action` is an optional id registered in EMPTY_STATE_ACTIONS.
 */
const EMPTY_STATE_ACTIONS = {};

function guidedEmpty(key, action = '') {
  const title = t(`ui.empty.${key}.title`);
  const text = t(`ui.empty.${key}.text`);
  const label = t(`ui.empty.${key}.action`);
  const hasAction = !!action && !!label && label !== `ui.empty.${key}.action`;

  return `
    <div class="empty-state guided">
      <div class="empty-icon">${icon('star', 'empty-state-icon')}</div>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
      ${hasAction ? `<button class="ghost small" data-empty-action="${escapeHtml(action)}">${escapeHtml(label)}</button>` : ''}
    </div>
  `;
}

/**
 * Wires every rendered guided-empty button to its registered handler.
 * Called once per render, after the pages have painted.
 */
function bindEmptyStateActions() {
  $$('[data-empty-action]').forEach((button) => {
    const handler = EMPTY_STATE_ACTIONS[button.dataset.emptyAction];
    if (handler) button.onclick = handler;
  });
}
