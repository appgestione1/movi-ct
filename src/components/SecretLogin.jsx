import { useState } from 'react';
import { verifyAdminPassword } from '../utils/popupStorage';

export default function SecretLogin({ onSuccess, onClose }) {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (verifyAdminPassword(pwd)) {
      onSuccess();
    } else {
      setErr(true);
      setPwd('');
      setTimeout(() => setErr(false), 1500);
    }
  }

  return (
    <div className="secret-login-overlay" onClick={onClose}>
      <form className="secret-login-card" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="secret-login-lock">🔒</div>
        <h3>Accesso amministrazione</h3>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={pwd}
          onChange={e => setPwd(e.target.value)}
          className={err ? 'shake' : ''}
        />
        {err && <p className="secret-login-err">Password errata</p>}
        <div className="secret-login-actions">
          <button type="button" className="sa-btn" onClick={onClose}>Annulla</button>
          <button type="submit" className="sa-btn sa-btn-primary">Entra</button>
        </div>
      </form>
    </div>
  );
}
