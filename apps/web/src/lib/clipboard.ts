/**
 * `navigator.clipboard` istnieje wyłącznie w bezpiecznym kontekście (HTTPS lub `localhost`)
 * — na LAN po zwykłym HTTP (telefon łączący się przez adres IP, patrz `.env` `VITE_API_BASE_URL`)
 * przeglądarka w ogóle nie wystawia tego obiektu, więc `navigator.clipboard?.writeText(...)`
 * cicho nic nie robi (bez błędu, bez efektu). Fallback: niewidoczny `<textarea>` +
 * `document.execCommand('copy')` — przestarzałe, ale wciąż wspierane wszędzie i jedyny sposób
 * kopiowania do schowka bez HTTPS.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // spadamy do fallbacku poniżej
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}
