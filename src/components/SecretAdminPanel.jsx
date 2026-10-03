import { useState, useRef, useEffect } from 'react';
import {
  POPUP_SECTIONS,
  DEFAULT_POPUP,
  VIDEO_SENTINEL,
  getAllPopups,
  setPopup,
  resetCooldown,
  setAdminPassword,
  onPopupsChange,
  uploadPopupVideo,
  deletePopupVideo,
} from '../utils/popupStorage';

function resizeImageToBase64(file, maxSize = 900) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SecretAdminPanel({ onClose, onTestPopup }) {
  const [popups, setPopups] = useState(getAllPopups());
  const [activeTab, setActiveTab] = useState('home');
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState({});
  const [pwdInput, setPwdInput] = useState('');
  const [videoProgress, setVideoProgress] = useState(null); // null | 0-100 | 'done'
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  // `dirty` letto via ref: il listener qui sotto si sottoscrive UNA volta sola,
  // ma deve sempre vedere lo stato dirty corrente. Senza ref, mettere `dirty`
  // tra le dipendenze creava una closure stale: uno snapshot Firestore in arrivo
  // durante l'editing reimpostava il tab ai dati del server, cancellando le
  // modifiche non ancora salvate.
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  // Sync da Firestore — riallinea solo le tab non in editing locale
  useEffect(() => {
    const off = onPopupsChange(() => {
      const fresh = getAllPopups();
      setPopups(prev => {
        const merged = { ...fresh };
        const d = dirtyRef.current;
        for (const k of Object.keys(d)) {
          if (d[k]) merged[k] = prev[k];
        }
        return merged;
      });
    });
    return off;
  }, []);

  const current = popups[activeTab] || { ...DEFAULT_POPUP };

  function updateField(field, value) {
    setPopups(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value },
    }));
    setDirty(prev => ({ ...prev, [activeTab]: true }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setPopup(activeTab, popups[activeTab]);
      setDirty(prev => ({ ...prev, [activeTab]: false }));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      alert('Errore salvataggio: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await resizeImageToBase64(file);
      updateField('imageUrl', base64);
    } catch (err) {
      alert('Errore upload immagine: ' + err.message);
    }
  }

  async function handleVideoUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permette di ricaricare lo stesso file
    if (!file) return;
    const section = activeTab;
    setVideoProgress(0);
    try {
      await uploadPopupVideo(section, file, setVideoProgress);
      updateField('videoUrl', VIDEO_SENTINEL);
      setVideoProgress('done');
      setTimeout(() => setVideoProgress(null), 1200);
    } catch (err) {
      alert('Errore upload video: ' + err.message);
      setVideoProgress(null);
    }
  }

  function handleRemoveVideo() {
    const section = activeTab;
    updateField('videoUrl', '');
    deletePopupVideo(section).catch(() => {});
  }

  async function handleTestNow() {
    setSaving(true);
    try {
      await setPopup(activeTab, popups[activeTab]);
      setDirty(prev => ({ ...prev, [activeTab]: false }));
      resetCooldown(activeTab);
      onTestPopup?.(activeTab);
    } catch (err) {
      alert('Errore salvataggio: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function handlePasswordChange() {
    if (!pwdInput || pwdInput.length < 4) {
      alert('Min. 4 caratteri');
      return;
    }
    setAdminPassword(pwdInput);
    setPwdInput('');
    alert('Password aggiornata');
  }

  return (
    <div className="secret-admin-overlay">
      <div className="secret-admin-panel">
        <div className="secret-admin-header">
          <h2>🔒 Pannello Pubblicità</h2>
          <button className="secret-admin-close" onClick={onClose}>×</button>
        </div>

        <div className="secret-admin-tabs">
          {POPUP_SECTIONS.map(s => (
            <button
              key={s.id}
              className={`secret-admin-tab ${activeTab === s.id ? 'active' : ''}`}
              onClick={() => setActiveTab(s.id)}
            >
              {s.label}
              {popups[s.id]?.enabled && <span className="tab-dot" />}
            </button>
          ))}
        </div>

        <div className="secret-admin-form">
          <label className="sa-row sa-toggle">
            <span>Popup attivo</span>
            <input
              type="checkbox"
              checked={current.enabled}
              onChange={e => updateField('enabled', e.target.checked)}
            />
          </label>

          <div className="sa-row sa-type">
            <label className={`sa-pill ${current.type === 'image' ? 'active' : ''}`}>
              <input
                type="radio"
                checked={current.type === 'image'}
                onChange={() => updateField('type', 'image')}
              />
              Immagine
            </label>
            <label className={`sa-pill ${current.type === 'video' ? 'active' : ''}`}>
              <input
                type="radio"
                checked={current.type === 'video'}
                onChange={() => updateField('type', 'video')}
              />
              Video
            </label>
          </div>

          {current.type === 'image' && (
            <>
              <div className="sa-row">
                <button className="sa-btn" onClick={() => fileInputRef.current?.click()}>
                  📁 Carica immagine
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleImageUpload}
                />
              </div>
              {current.imageUrl && (
                <div className="sa-preview">
                  <img src={current.imageUrl} alt="preview" />
                  <button className="sa-remove" onClick={() => updateField('imageUrl', '')}>Rimuovi</button>
                </div>
              )}
              <label className="sa-row">
                <span>URL immagine (alternativo)</span>
                <input
                  type="text"
                  placeholder="https://..."
                  value={current.imageUrl.startsWith('data:') ? '' : current.imageUrl}
                  onChange={e => updateField('imageUrl', e.target.value)}
                />
              </label>
            </>
          )}

          {current.type === 'video' && (
            <>
              <div className="sa-row">
                <button
                  className="sa-btn"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={videoProgress !== null && videoProgress !== 'done'}
                >
                  🎬 Carica video dalla galleria
                </button>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  style={{ display: 'none' }}
                  onChange={handleVideoUpload}
                />
              </div>
              {videoProgress !== null && videoProgress !== 'done' && (
                <div className="sa-row sa-upload-progress">
                  <span>⏳ Caricamento video… {videoProgress}%</span>
                </div>
              )}
              {videoProgress === 'done' && (
                <div className="sa-row sa-upload-progress"><span>✓ Video caricato</span></div>
              )}
              {current.videoUrl === VIDEO_SENTINEL && (
                <div className="sa-preview">
                  <span className="sa-video-badge">🎬 Video dalla galleria</span>
                  <button className="sa-remove" onClick={handleRemoveVideo}>Rimuovi</button>
                </div>
              )}
              <label className="sa-row">
                <span>URL video (YouTube o MP4) — alternativo</span>
                <input
                  type="text"
                  placeholder="https://youtu.be/... o https://...mp4"
                  value={current.videoUrl === VIDEO_SENTINEL ? '' : current.videoUrl}
                  onChange={e => updateField('videoUrl', e.target.value)}
                />
              </label>
            </>
          )}

          <label className="sa-row">
            <span>Titolo</span>
            <input
              type="text"
              value={current.title}
              onChange={e => updateField('title', e.target.value)}
            />
          </label>

          <label className="sa-row">
            <span>Slogan / descrizione</span>
            <textarea
              rows={2}
              value={current.slogan}
              onChange={e => updateField('slogan', e.target.value)}
            />
          </label>

          <label className="sa-row">
            <span>Testo CTA</span>
            <input
              type="text"
              placeholder="es. Scopri di più"
              value={current.ctaText}
              onChange={e => updateField('ctaText', e.target.value)}
            />
          </label>

          <label className="sa-row">
            <span>URL CTA</span>
            <input
              type="text"
              placeholder="https://..."
              value={current.ctaUrl}
              onChange={e => updateField('ctaUrl', e.target.value)}
            />
          </label>

          <div className="sa-row sa-grid2">
            <label>
              <span>Scadenza</span>
              <input
                type="date"
                value={current.expireAt}
                onChange={e => updateField('expireAt', e.target.value)}
              />
            </label>
            <label>
              <span>Cooldown (minuti)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={current.cooldownMinutes}
                onChange={e => updateField('cooldownMinutes', parseInt(e.target.value || '0', 10))}
              />
            </label>
          </div>

          <div className="sa-actions">
            <button className="sa-btn sa-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '⏳ Salvo…' : savedFlash ? '✓ Salvato' : '💾 Salva'}
            </button>
            <button className="sa-btn" onClick={handleTestNow} disabled={saving}>🧪 Testa ora</button>
          </div>

          <div className="sa-divider" />

          <div className="sa-row sa-grid2">
            <label>
              <span>Nuova password admin</span>
              <input
                type="password"
                value={pwdInput}
                onChange={e => setPwdInput(e.target.value)}
                placeholder="min 4 caratteri"
              />
            </label>
            <button className="sa-btn" onClick={handlePasswordChange}>Cambia</button>
          </div>

          <p className="sa-hint">
            Storage: Firestore — le modifiche sono sincronizzate in tempo reale su tutti i dispositivi.
          </p>
        </div>
      </div>
    </div>
  );
}
