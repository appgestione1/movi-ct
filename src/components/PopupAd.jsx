import { useEffect, useRef, useState } from 'react';
import {
  getPopup,
  markPopupShown,
  shouldShowPopup,
  loadPopupVideoBlobUrl,
  VIDEO_SENTINEL,
} from '../utils/popupStorage';

function getYoutubeEmbed(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0` : null;
}

export default function PopupAd({ section, onClose }) {
  const [popup, setPopup] = useState(null);
  const [videoSrc, setVideoSrc] = useState(null); // blob URL per video da galleria
  // Proviamo a partire CON audio (come la disco-app: il popup si apre subito
  // dopo un tap utente, gesto che autorizza l'audio). Solo se il browser blocca
  // ripieghiamo su muto + pulsante "tocca per l'audio".
  const [mutedFallback, setMutedFallback] = useState(false);
  const videoRef = useRef(null);

  function enableSound() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    setMutedFallback(false);
    v.play?.().catch(() => {});
  }

  // onClose può cambiare identità a ogni render del parent: lo teniamo in un
  // ref così la decisione mostra/chiudi (sotto) dipende SOLO da `section` e non
  // si ri-esegue — evitando auto-chiusure quando l'App si ri-renderizza.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    let blobUrl = null;
    let cancelled = false;
    if (shouldShowPopup(section)) {
      const p = getPopup(section);
      setPopup(p);
      markPopupShown(section);
      if (p.type === 'video' && p.videoUrl === VIDEO_SENTINEL) {
        loadPopupVideoBlobUrl(section)
          .then(url => { if (!cancelled) { blobUrl = url; setVideoSrc(url); } })
          .catch(() => {});
      }
    } else {
      onCloseRef.current?.();
    }
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // Avvio del video guidato da qui (niente attributo autoPlay, che entrerebbe in
  // conflitto interrompendo la play()). Proviamo prima CON audio; se il browser
  // blocca l'autoplay-con-audio, ripartiamo muti e mostriamo il pulsante.
  const isFirestoreVideo = popup?.type === 'video' && popup?.videoUrl === VIDEO_SENTINEL;
  const playSrc = isFirestoreVideo ? videoSrc : (popup?.videoUrl || null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playSrc) return;
    let cancelled = false;
    (async () => {
      try {
        v.muted = false;
        await v.play();
      } catch {
        if (cancelled) return;
        try { v.muted = true; setMutedFallback(true); await v.play(); } catch {}
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSrc]);

  if (!popup) return null;

  const ytEmbed = popup.type === 'video' && !isFirestoreVideo ? getYoutubeEmbed(popup.videoUrl) : null;
  const directVideoSrc = isFirestoreVideo ? videoSrc : popup.videoUrl;

  function handleCtaClick() {
    if (popup.ctaUrl) {
      window.open(popup.ctaUrl, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <div className="popup-ad-overlay" onClick={onClose}>
      <div className="popup-ad-card" onClick={e => e.stopPropagation()}>
        <button className="popup-ad-close" onClick={onClose} aria-label="Chiudi">×</button>

        {popup.type === 'image' && popup.imageUrl && (
          <img className="popup-ad-media" src={popup.imageUrl} alt={popup.title || 'Ad'} />
        )}

        {popup.type === 'video' && ytEmbed && (
          <div className="popup-ad-video-wrap">
            <iframe
              src={ytEmbed}
              title={popup.title || 'Ad'}
              frameBorder="0"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        )}

        {popup.type === 'video' && !ytEmbed && directVideoSrc && (
          <div className="popup-ad-video-box" onClick={mutedFallback ? enableSound : undefined}>
            <video
              ref={videoRef}
              className="popup-ad-video"
              src={directVideoSrc}
              playsInline
              loop
              preload="auto"
            />
            {mutedFallback && (
              <button
                type="button"
                className="popup-ad-unmute"
                onClick={(e) => { e.stopPropagation(); enableSound(); }}
                aria-label="Attiva audio"
              >
                🔊 Tocca per l'audio
              </button>
            )}
          </div>
        )}

        {(popup.title || popup.slogan) && (
          <div className="popup-ad-body">
            {popup.title && <h3 className="popup-ad-title">{popup.title}</h3>}
            {popup.slogan && <p className="popup-ad-slogan">{popup.slogan}</p>}
            {popup.ctaText && popup.ctaUrl && (
              <button className="popup-ad-cta" onClick={handleCtaClick}>{popup.ctaText} →</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
