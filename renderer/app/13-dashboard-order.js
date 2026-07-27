/**
 * Draggable Dashboard Order
 * Allows user to reorder overview panels via drag and drop.
 * Saves order to settings.dashboardOrder
 */

const DEFAULT_ORDER = ['hero', 'health-risk', 'discipline-challenge-news', 'signals'];

function getDashboardContainer() {
  return document.getElementById('overviewDashboard');
}

function getSavedOrder() {
  const fromSettings = model.state?.settings?.dashboardOrder;
  if (Array.isArray(fromSettings) && fromSettings.length) return fromSettings;
  const fromModel = model.dashboardOrder;
  if (Array.isArray(fromModel) && fromModel.length) return fromModel;
  try {
    const raw = localStorage.getItem('cisd-ui-state');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.dashboardOrder) && parsed.dashboardOrder.length) return parsed.dashboardOrder;
    }
  } catch {}
  return [...DEFAULT_ORDER];
}

function saveDashboardOrder(order) {
  model.dashboardOrder = order;
  persistUiState();
  // Save to main process settings as well
  if (model.state?.settings) {
    model.state.settings.dashboardOrder = order;
    cisd.updateSettings({ dashboardOrder: order }).catch(() => {});
  }
}

function applyDashboardOrder() {
  const container = getDashboardContainer();
  if (!container) return;
  const order = getSavedOrder();
  const children = Array.from(container.children);
  const map = {};
  for (const child of children) {
    const id = child.dataset.dashboardId;
    if (id) map[id] = child;
  }
  // Re-append in saved order, keeping unknown at end
  for (const id of order) {
    if (map[id]) container.appendChild(map[id]);
  }
  // Append any new panels not in saved order
  for (const child of children) {
    const id = child.dataset.dashboardId;
    if (!order.includes(id)) {
      container.appendChild(child);
      order.push(id);
    }
  }
}

function makeDraggable() {
  const container = getDashboardContainer();
  if (!container) return;

  let dragged = null;

  const items = container.querySelectorAll('[data-dashboard-id]');
  items.forEach(item => {
    item.classList.add('dashboard-item');
    const handle = item.querySelector('.dashboard-handle');
    if (!handle) return;
    handle.draggable = true;

    handle.addEventListener('dragstart', (e) => {
      dragged = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.dashboardId);
    });

    handle.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      dragged = null;
    });
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const target = e.target.closest('[data-dashboard-id]');
    if (!target || target === dragged) return;
    target.classList.add('drag-over');
  });

  container.addEventListener('dragleave', (e) => {
    const target = e.target.closest('[data-dashboard-id]');
    if (target) target.classList.remove('drag-over');
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const target = e.target.closest('[data-dashboard-id]');
    if (!target || !dragged || target === dragged) return;
    target.classList.remove('drag-over');

    const children = Array.from(container.children).filter(el => el.dataset.dashboardId);
    const draggedIndex = children.indexOf(dragged);
    const targetIndex = children.indexOf(target);

    if (draggedIndex < targetIndex) {
      target.after(dragged);
    } else {
      target.before(dragged);
    }

    const newOrder = Array.from(container.children)
      .filter(el => el.dataset.dashboardId)
      .map(el => el.dataset.dashboardId);
    saveDashboardOrder(newOrder);
    toast('تم حفظ الترتيب الجديد ✓', 'success');
  });
}

function resetDashboardOrder() {
  saveDashboardOrder([...DEFAULT_ORDER]);
  applyDashboardOrder();
  toast('تمت إعادة الترتيب الافتراضي ✓', 'success');
}

function initDashboardOrder() {
  applyDashboardOrder();
  // Delay making draggable until after initial render to ensure DOM ready
  setTimeout(makeDraggable, 300);
}

// Expose for bootstrap
window.initDashboardOrder = initDashboardOrder;
window.resetDashboardOrder = resetDashboardOrder;
window.applyDashboardOrder = applyDashboardOrder;
