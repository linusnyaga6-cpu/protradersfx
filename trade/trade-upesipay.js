(() => {
  'use strict';

  const API_ROOT = '/api/upesipay';
  const WAIT_LIMIT = 15;
  const WAIT_MS = 4000;
  let pollTimer = null;
  let activeReference = '';
  let isSubmitting = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function setStatus(message, type = 'info') {
    const status = document.querySelector('[data-pt-upesi-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = type;
    status.hidden = false;
  }

  function closeModal() {
    const overlay = document.querySelector('[data-pt-upesi-overlay]');
    if (!overlay) return;
    overlay.hidden = true;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    activeReference = '';
  }

  function openModal() {
    const overlay = document.querySelector('[data-pt-upesi-overlay]');
    if (!overlay) return;
    overlay.hidden = false;
    if (activeReference) return;
    const status = overlay.querySelector('[data-pt-upesi-status]');
    status.hidden = true;
    status.textContent = '';
    const form = overlay.querySelector('form');
    form.hidden = false;
    form.reset();
    const submit = form.querySelector('.pt-upesi-submit');
    submit.disabled = false;
    submit.textContent = 'Send M-PESA prompt';
    form.querySelector('[name="amountKes"]').focus();
  }

  function createModal() {
    if (document.querySelector('[data-pt-upesi-overlay]')) return;

    const overlay = element('div', 'pt-upesi-overlay');
    overlay.dataset.ptUpesiOverlay = 'true';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="pt-upesi-dialog" role="dialog" aria-modal="true" aria-labelledby="pt-upesi-title" aria-describedby="pt-upesi-description">
        <button class="pt-upesi-close" type="button" aria-label="Close deposit form">×</button>
        <div class="pt-upesi-kicker">PROTRADERS MARKETS · M-PESA</div>
        <h2 id="pt-upesi-title">Deposit with M-PESA</h2>
        <p id="pt-upesi-description" class="pt-upesi-copy">Enter a KES amount and the phone number that should receive the STK prompt.</p>
        <form novalidate>
          <label class="pt-upesi-field">
            <span>Amount (KES)</span>
            <input name="amountKes" inputmode="numeric" type="number" min="1" max="500000" step="1" placeholder="e.g. 1000" required>
          </label>
          <label class="pt-upesi-field">
            <span>M-PESA phone number</span>
            <input name="phoneNumber" inputmode="tel" type="tel" autocomplete="tel" placeholder="0712 345 678" maxlength="20" required>
          </label>
          <p class="pt-upesi-disclaimer">Payments are collected into the merchant UpesiPay account. This demo balance is not cash and will not be credited by this form. Withdrawals are handled manually.</p>
          <p class="pt-upesi-status" data-pt-upesi-status role="status" aria-live="polite" hidden></p>
          <button class="pt-upesi-submit" type="submit">Send M-PESA prompt</button>
        </form>
      </section>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.pt-upesi-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });
    overlay.querySelector('form').addEventListener('submit', submitDeposit);
  }

  function createLauncher() {
    if (document.querySelector('[data-pt-upesi-launcher]')) return;
    const launcher = element('button', 'pt-upesi-launcher', 'Deposit');
    launcher.type = 'button';
    launcher.dataset.ptUpesiLauncher = 'true';
    launcher.setAttribute('aria-label', 'Open the M-PESA deposit form');
    document.body.appendChild(launcher);
  }

  function updateFundingCard() {
    const depositButton = document.querySelector('[data-testid="button-deposit-disabled"]');
    if (depositButton) {
      if (depositButton.disabled) depositButton.disabled = false;
      if (depositButton.dataset.ptUpesiReady !== 'true') {
        depositButton.textContent = 'Deposit with M-PESA';
        depositButton.dataset.ptUpesiDeposit = 'true';
        depositButton.dataset.ptUpesiReady = 'true';
      }
      const card = depositButton.closest('.panel');
      const title = card?.querySelector('h2');
      const description = card?.querySelector('p:not(.eyebrow)');
      if (title && title.textContent !== 'M-PESA collection') title.textContent = 'M-PESA collection';
      const descriptionText = 'Send an M-PESA prompt through UpesiPay. Payments go to the merchant account; the simulated balance stays unchanged.';
      if (description && description.textContent !== descriptionText) description.textContent = descriptionText;
    }

    const withdrawalButton = document.querySelector('[data-testid="button-withdraw-disabled"]');
    if (withdrawalButton) {
      if (!withdrawalButton.disabled) withdrawalButton.disabled = true;
      if (withdrawalButton.textContent !== 'Withdrawals handled manually') withdrawalButton.textContent = 'Withdrawals handled manually';
      if (withdrawalButton.title !== 'Withdrawals are handled separately by the merchant.') {
        withdrawalButton.title = 'Withdrawals are handled separately by the merchant.';
      }
    }
  }

  async function pollStatus(reference, attempt = 0) {
    if (attempt >= WAIT_LIMIT || reference !== activeReference) {
      setStatus('Still waiting for confirmation. Check the M-PESA prompt or your UpesiPay transactions.', 'pending');
      return;
    }

    pollTimer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_ROOT}/status?reference=${encodeURIComponent(reference)}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Could not check payment status.');

        if (result.status === 'success') {
          setStatus(`Payment confirmed by UpesiPay. It has not been added to the demo balance. Reference: ${reference}`, 'success');
          return;
        }
        if (['failed', 'cancelled', 'timeout'].includes(result.status)) {
          setStatus(`Payment ${result.status}. Reference: ${reference}. You can close this window or start a new deposit.`, 'error');
          return;
        }
      } catch (error) {
        if (attempt + 1 >= WAIT_LIMIT) {
          setStatus(error.message || 'Could not verify payment yet. Check the UpesiPay dashboard.', 'error');
          return;
        }
      }
      pollStatus(reference, attempt + 1);
    }, WAIT_MS);
  }

  async function submitDeposit(event) {
    event.preventDefault();
    if (activeReference || isSubmitting) return;

    const form = event.currentTarget;
    const amountKes = Number(form.elements.amountKes.value);
    const phoneNumber = form.elements.phoneNumber.value.trim();
    const submit = form.querySelector('.pt-upesi-submit');

    if (!Number.isSafeInteger(amountKes) || amountKes < 1 || amountKes > 500000) {
      setStatus('Enter a whole KES amount from 1 to 500,000.', 'error');
      return;
    }
    if (!phoneNumber) {
      setStatus('Enter the M-PESA phone number for the prompt.', 'error');
      return;
    }

    isSubmitting = true;
    submit.disabled = true;
    submit.textContent = 'Sending prompt…';
    setStatus('Connecting securely to UpesiPay…', 'pending');

    try {
      const response = await fetch(`${API_ROOT}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ amountKes, phoneNumber }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not start the M-PESA prompt.');

      activeReference = result.reference;
      isSubmitting = false;
      form.hidden = true;
      setStatus(`${result.message || 'M-PESA prompt sent. Enter your PIN on your phone.'} Reference: ${result.reference}`, 'pending');
      pollStatus(activeReference);
    } catch (error) {
      isSubmitting = false;
      setStatus(error.message || 'Could not start the M-PESA prompt. Please try again.', 'error');
      submit.disabled = false;
      submit.textContent = 'Send M-PESA prompt';
    }
  }

  function init() {
    createModal();
    createLauncher();
    updateFundingCard();

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-pt-upesi-launcher], [data-pt-upesi-deposit]');
      if (!trigger) return;
      event.preventDefault();
      openModal();
    });

    const observer = new MutationObserver(() => {
      createLauncher();
      updateFundingCard();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
