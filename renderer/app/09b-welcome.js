/**
 * First-run setup and account lifecycle actions.
 *
 * `settings.onboardingComplete` existed in the store and had two IPC handlers,
 * but nothing read it and no screen consumed it — so the "Restart onboarding"
 * button reported success and produced no visible result. This module is the
 * missing consumer.
 *
 * The flow deliberately front-loads the risk limits: an account with no
 * dailyLoss/maxDrawdown makes buildRiskSnapshot() return null limits, i.e. the
 * guard the product exists to provide is inert. Better to ask once at setup.
 */

const WELCOME_STEPS = 4;

function isOnboardingPending() {
  return model.state?.settings?.onboardingComplete !== true;
}

function renderWelcome() {
  const overlay = $('#welcomeOverlay');
  if (!overlay) return;

  if (!isOnboardingPending()) {
    overlay.classList.add('hidden');
    return;
  }

  overlay.classList.remove('hidden');

  $$('.welcome-step').forEach((section) => {
    section.classList.toggle('hidden', Number(section.dataset.step) !== model.welcomeStep);
  });

  const progress = ((model.welcomeStep + 1) / WELCOME_STEPS) * 100;
  $('#welcomeProgressBar').style.width = `${progress}%`;
  $('#welcomeStepCounter').textContent = t('welcome.stepOf', {
    current: model.welcomeStep + 1,
    total: WELCOME_STEPS,
  });

  $('#welcomeBack').classList.toggle('hidden', model.welcomeStep === 0);
  $('#welcomeNext').textContent = model.welcomeStep === WELCOME_STEPS - 1
    ? t('welcome.finish')
    : t('welcome.next');

  $('#welcomeCsvPath').textContent = model.welcomeCsvPath || t('welcome.csv.none');

  $$('[data-welcome-locale]').forEach((button) => {
    button.classList.toggle('active', button.dataset.welcomeLocale === (model.state?.settings?.locale || 'ar'));
  });
}

async function chooseWelcomeLocale(locale) {
  if ((model.state?.settings?.locale || 'ar') === locale) return;
  await cisd.updateSettings({ locale });
  // Direction and every translated string are applied at boot, so a reload is
  // the honest way to switch — the same path Settings uses.
  location.reload();
}

/**
 * Persists whatever the current step collected.
 * Returns false to keep the wizard on this step when input is invalid.
 */
async function commitWelcomeStep() {
  if (model.welcomeStep === 1) {
    const firm = $('#welcomeFirm').value.trim();
    const name = $('#welcomeName').value.trim();
    if (!firm) {
      toast(t('accountModal.firmRequired'), 'warn');
      $('#welcomeFirm').focus();
      return false;
    }
    if (!name) {
      toast(t('accountModal.nameRequired'), 'warn');
      $('#welcomeName').focus();
      return false;
    }

    const capital = Number($('#welcomeCapital').value || 0);
    model.state = await runBusy(t('ui.loading'), () => cisd.saveAccount({
      firm,
      name,
      capital,
      currentBalance: capital,
      currency: $('#welcomeCurrency').value.trim() || 'USD',
      phase: 'Challenge',
    }));
    model.accountId = visibleAccounts().slice(-1)[0]?.id || model.accountId;
    return true;
  }

  if (model.welcomeStep === 2) {
    const account = activeAccount();
    if (!account) return true;
    model.state = await runBusy(t('ui.loading'), () => cisd.saveAccount({
      ...account,
      profitTarget: Number($('#welcomeTarget').value || 0),
      dailyLoss: Number($('#welcomeDailyLoss').value || 0),
      maxDrawdown: Number($('#welcomeDrawdown').value || 0),
    }));
    return true;
  }

  return true;
}

async function welcomeNext() {
  if (!(await commitWelcomeStep())) return;

  if (model.welcomeStep < WELCOME_STEPS - 1) {
    model.welcomeStep += 1;
    renderWelcome();
    return;
  }

  await finishWelcome();
}

function welcomeBack() {
  if (model.welcomeStep === 0) return;
  model.welcomeStep -= 1;
  renderWelcome();
}

async function finishWelcome() {
  model.state = await runBusy(t('ui.loading'), () => cisd.completeOnboarding());
  await refreshStateAndRender();
  renderWelcome();
  toast(t('welcome.done'), 'success');
}

async function chooseWelcomeCsv() {
  const result = await cisd.chooseCSV();
  if (!result || result.cancelled) return;
  model.state = result.state || model.state;
  model.welcomeCsvPath = model.state?.settings?.csvPath || '';
  renderWelcome();
}

/**
 * Persistent risk banner, visible from every tab.
 *
 * The risk warnings were only drawn inside the Overview page, so navigating
 * away from it hid the fact that the account was in breach.
 */
function renderRiskBanner() {
  const banner = $('#riskBanner');
  if (!banner) return;

  const warnings = model.dashboard?.risk?.warnings || [];
  if (!warnings.length) {
    banner.classList.add('hidden');
    banner.textContent = '';
    return;
  }

  const critical = warnings.some((warning) => warning.severity === 'critical');
  banner.className = `risk-banner ${critical ? 'critical' : 'warn'}`;
  banner.innerHTML = `
    ${icon(critical ? 'risk' : 'session', 'risk-banner-icon')}
    <div class="risk-banner-body">
      ${warnings.map((warning) => `<strong>${escapeHtml(t(`warnings.${warning.code}`))}</strong>`).join('')}
    </div>
    <button class="ghost small" data-risk-goto>${escapeHtml(t('nav.overview'))}</button>
  `;

  const goto = banner.querySelector('[data-risk-goto]');
  if (goto) {
    goto.onclick = () => {
      model.page = 'overview';
      persistUiState();
      renderActivePage();
      renderWorkspaceStatus();
    };
  }
}

// --- Account lifecycle ------------------------------------------------------

async function archiveCurrentAccount() {
  const account = activeAccount();
  if (!account) return;

  const confirmed = await openConfirm({
    title: t('settings.archiveConfirmTitle'),
    text: t('settings.archiveConfirmText'),
    confirmLabel: t('settings.archiveAccount'),
  });
  if (!confirmed) return;

  model.state = await runBusy(t('ui.loading'), () => cisd.archiveAccount(account.id));
  model.accountId = visibleAccounts()[0]?.id || null;
  await refreshStateAndRender();
  toast(t('settings.archiveDone'), 'success');
}

async function deleteCurrentAccount() {
  const account = activeAccount();
  if (!account) return;

  // Deleting the only account would leave the app with no context to render.
  if (visibleAccounts().length <= 1) {
    toast(t('settings.lastAccountBlocked'), 'warn');
    return;
  }

  const confirmed = await openConfirm({
    title: t('settings.deleteConfirmTitle'),
    text: t('settings.deleteConfirmText'),
    confirmLabel: t('settings.deleteAccount'),
    // Irreversible and cross-entity: require the word to be typed.
    typeToConfirm: 'DELETE',
  });
  if (!confirmed) return;

  model.state = await runBusy(t('ui.loading'), () => cisd.deleteAccount(account.id));
  model.accountId = visibleAccounts()[0]?.id || null;
  await refreshStateAndRender();
  toast(t('settings.deleteDone'), 'success');
}

async function restoreAccount(accountId) {
  model.state = await runBusy(t('ui.loading'), () => cisd.unarchiveAccount(accountId));
  model.accountId = accountId;
  await refreshStateAndRender();
}

function archivedAccounts() {
  return (model.state?.accounts || []).filter((account) => account.archived);
}

function renderArchivedAccounts() {
  const panel = $('#archivedAccountsPanel');
  const list = $('#archivedAccountsList');
  if (!panel || !list) return;

  const archived = archivedAccounts();
  panel.classList.toggle('hidden', archived.length === 0);
  if (!archived.length) return;

  list.innerHTML = archived.map((account) => `
    <article class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(account.name || '')}</div>
          <div class="item-subtitle">${escapeHtml(account.firm || '')}</div>
        </div>
        <button class="ghost small" data-restore-account="${escapeHtml(account.id)}">${escapeHtml(t('settings.restoreAccount'))}</button>
      </div>
    </article>
  `).join('');

  $$('[data-restore-account]').forEach((button) => {
    button.onclick = () => restoreAccount(button.dataset.restoreAccount);
  });
}
