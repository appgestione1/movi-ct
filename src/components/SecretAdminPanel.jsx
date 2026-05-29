import { useState, useRef, useEffect } from 'react';
import {
  POPUP_SECTIONS,
  DEFAULT_POPUP,
  getAllPopups,
  setPopup,
  resetCooldown,
  setAdminPassword,
  onPopupsChange,
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
  const fileInputRef = useRef(null);

  // Sync da Firestore — riallinea solo le tab non in editing locale
  useEffect(() => {
    const off = onPopupsChange(() => {
      const fresh = getAllPopups();
      setPopups(prev => {
        const merged = { ...fresh };
        for (const k of Object.keys(dirty)) {
          if (dirty[k]) merged[k] = prev[k];
        }
        return merged;
      });
    });
    return off;
  }, [dirty]);

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
            <label className="sa-row">
              <span>URL video (YouTube o MP4)</span>
              <input
                type="text"
                placeholder="https://youtu.be/... o https://...mp4"
                value={current.videoUrl}
                onChange={e => updateField('videoUrl', e.target.value)}
              />
            </label>
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
              <span>Cooldown (ore)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={current.cooldownHours}
                onChange={e => updateField('cooldownHours', parseInt(e.target.value || '0', 10))}
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
