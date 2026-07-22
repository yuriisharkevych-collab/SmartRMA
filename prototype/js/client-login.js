/* Logowanie Portalu Klienta — numer reklamacji + kod dostępu, ALBO
   bezpieczny link z jednorazowym tokenem.

   Wszystkie teksty widoczne dla klienta pochodzą z t()/CLIENT_LABELS
   (client-labels.js) - Code Review (Finalizacja modułu), pkt 2. Ten plik
   nie zawiera żadnego tekstu wpisanego wprost poza atrybutami czysto
   technicznymi (klucze DOM, nazwy zdarzeń).

   BACKEND TODO (Code Review pkt 11 z poprzedniej rundy, nadal aktualne):
   każda funkcja poniżej oznaczona komentarzem "BACKEND TODO" to miejsce
   1:1 odpowiadające przyszłemu wywołaniu API (CLIENT_PORTAL_API.md:
   POST /api/client/login). */

const MAX_LOGIN_ATTEMPTS = 5;
const ATTEMPTS_KEY_PREFIX = 'smartrma_client_attempts_';

document.addEventListener('DOMContentLoaded', () => {
  const caseNumberInput = document.getElementById('case-number');
  const accessCodeInput = document.getElementById('access-code');
  const form = document.getElementById('client-login-form');
  const errorEl = document.getElementById('error-message');
  const lockoutEl = document.getElementById('lockout-banner');
  const submitBtn = document.getElementById('submit-btn');
  const tokenStatusEl = document.getElementById('token-login-status');

  const params = new URLSearchParams(window.location.search);

  // --- Logowanie bezpiecznym linkiem (?case=...&token=...) -------------
  if (params.get('case') && params.get('token')) {
    attemptTokenLogin(params.get('case').trim(), params.get('token').trim());
    return; // nie renderujemy zwykłego formularza, dopóki trwa próba tokenu
  }

  if (params.get('case')) {
    caseNumberInput.value = params.get('case');
    accessCodeInput.focus();
  }

  refreshLockState(caseNumberInput.value.trim());

  caseNumberInput.addEventListener('input', () => {
    hideError();
    refreshLockState(caseNumberInput.value.trim());
  });

  document.getElementById('reset-attempts').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem(attemptsKey(caseNumberInput.value.trim()));
    refreshLockState(caseNumberInput.value.trim());
    hideError();
    showToast(t('toast_attempts_reset'));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    hideError();

    const caseNumber = caseNumberInput.value.trim();
    const code = accessCodeInput.value.trim();

    if (checkLoginAttempts(caseNumber).lockedOut) {
      showLockout();
      return;
    }

    const c = SMARTRMA_DATA.cases.find((cs) => cs.caseNumber.toLowerCase() === caseNumber.toLowerCase());
    const result = verifyAccessCode(c, code);

    if (!result.valid) {
      registerFailedAttempt(caseNumber);
      if (checkLoginAttempts(caseNumber).lockedOut) {
        showLockout();
      } else {
        const left = MAX_LOGIN_ATTEMPTS - checkLoginAttempts(caseNumber).attempts;
        showError(`${result.reason} ${t('error_attempts_left', { n: left })}`);
      }
      return;
    }

    localStorage.removeItem(attemptsKey(caseNumber));
    startSession(c);
  });

  function attemptsKey(caseNumber) {
    return ATTEMPTS_KEY_PREFIX + caseNumber.toUpperCase();
  }

  // BACKEND TODO: docelowo liczba prób i blokada będą trzymane server-side
  // (per IP + per sprawa), nie w localStorage przeglądarki.
  function checkLoginAttempts(caseNumber) {
    const attempts = Number(localStorage.getItem(attemptsKey(caseNumber)) || '0');
    return { attempts, lockedOut: attempts >= MAX_LOGIN_ATTEMPTS };
  }

  function registerFailedAttempt(caseNumber) {
    const next = checkLoginAttempts(caseNumber).attempts + 1;
    localStorage.setItem(attemptsKey(caseNumber), String(next));
  }

  function refreshLockState(caseNumber) {
    if (caseNumber && checkLoginAttempts(caseNumber).lockedOut) {
      showLockout();
    } else {
      lockoutEl.classList.add('hidden');
      submitBtn.disabled = false;
    }
  }

  function showLockout() {
    lockoutEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    submitBtn.disabled = true;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }

  function hideError() {
    errorEl.classList.add('hidden');
  }

  function startSession(c) {
    c.clientLastLogin = new Date().toISOString();
    SMARTRMA_DATA.persist();
    sessionStorage.setItem('smartrma_client_session', JSON.stringify({ caseId: c.id, caseNumber: c.caseNumber }));
    window.location.href = `client-portal.html?id=${c.id}`;
  }

  function attemptTokenLogin(caseNumber, token) {
    tokenStatusEl.classList.remove('hidden');
    form.classList.add('hidden');

    setTimeout(() => {
      const c = SMARTRMA_DATA.cases.find((cs) => cs.caseNumber.toLowerCase() === caseNumber.toLowerCase());
      const result = validateToken(c, token);

      if (!result.valid) {
        tokenStatusEl.classList.add('hidden');
        form.classList.remove('hidden');
        showError(result.reason);
        caseNumberInput.value = caseNumber;
        return;
      }

      c.clientAccessTokenUsed = true;
      startSession(c);
    }, 450);
  }

  // BACKEND TODO: walidacja tokenu MUSI się odbywać po stronie serwera
  // (POST z tokenem w ciele żądania).
  function validateToken(c, token) {
    if (!c) return { valid: false, reason: t('error_case_not_found') };
    if (!c.clientPortalEnabled) return { valid: false, reason: t('error_portal_disabled') };
    if (!c.clientAccessToken) return { valid: false, reason: t('error_token_invalid') };
    if (c.clientAccessTokenUsed) return { valid: false, reason: t('error_token_used') };
    if (c.clientAccessToken !== token) return { valid: false, reason: t('error_token_invalid') };
    return { valid: true };
  }
});

// BACKEND TODO: w produkcji to wywołanie API weryfikujące hash kodu po
// stronie serwera (POST /api/client/login), nie porównanie jawnego tekstu.
function verifyAccessCode(c, code) {
  if (!c) return { valid: false, reason: t('error_case_not_found') };
  if (!c.clientPortalEnabled) return { valid: false, reason: t('error_portal_disabled') };
  if (!c.clientAccessCode || c.clientAccessCode.toLowerCase() !== code.toLowerCase()) {
    return { valid: false, reason: t('error_invalid_code') };
  }
  return { valid: true };
}
