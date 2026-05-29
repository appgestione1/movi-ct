import { useState, useEffect } from 'react';

// Banner "Installa Movì CT" (come in disco-app/Event).
// - Android/Chrome: intercetta beforeinstallprompt e mostra il bottone "Installa".
// - iOS Safari: nessun beforeinstallprompt → mostra le istruzioni manuali.
// - Già installata (display standalone) o chiusa nella sessione → non appare.
export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  useEffect(() => {
    if (isStandalone) return;
    if (sessionStorage.getItem('movi-install-dismissed')) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS non supporta beforeinstallprompt: mostra il banner manuale su Safari.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isInSafari =
      /safari/i.test(navigator.userAgent) && !/crios|fxios|chrome/i.test(navigator.userAgent);
    if (isIOS && isInSafari) setShow(true);

    // Quando viene installata, nascondi.
    const onInstalled = () => setShow(false);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isStandalone]);

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
    setShow(false);
  }

  function handleDismiss() {
    sessionStorage.setItem('movi-install-dismissed', '1');
    setShow(false);
  }

  if (!show || isStandalone) return null;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <div className="install-banner">
      <img src="/movi-icon.svg" alt="Movì CT" className="install-banner-icon" />
      <div className="install-banner-text">
        <p className="install-banner-title">Installa Movì CT</p>
        <p className="install-banner-sub">
          {isIOS
            ? 'In Safari: tocca ⬆️ Condividi in basso, poi "Aggiungi alla schermata Home"'
            : 'Aggiungila alla schermata Home per usarla a tutto schermo'}
        </p>
      </div>
      {!isIOS && deferredPrompt && (
        <button className="install-banner-btn" onClick={handleInstall}>Installa</button>
      )}
      <button className="install-banner-close" onClick={handleDismiss} aria-label="Chiudi">×</button>
    </div>
  );
}
