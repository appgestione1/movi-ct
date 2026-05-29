import { useEffect, useState } from 'react';
import { getPopup, markPopupShown, shouldShowPopup } from '../utils/popupStorage';

function getYoutubeEmbed(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0` : null;
}

export default function PopupAd({ section, onClose }) {
  const [popup, setPopup] = useState(null);

  useEffect(() => {
    if (shouldShowPopup(section)) {
      setPopup(getPopup(section));
      markPopupShown(section);
    } else {
      onClose?.();
    }
  }, [section, onClose]);

  if (!popup) return null;

  const ytEmbed = popup.type === 'video' ? getYoutubeEmbed(popup.videoUrl) : null;

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

        {popup.type === 'video' && !ytEmbed && popup.videoUrl && (
          <video className="popup-ad-media" src={popup.videoUrl} autoPlay muted playsInline loop />
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
