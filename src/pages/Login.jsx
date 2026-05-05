import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!phone || !password) {
      setError('Phone and password are required');
      return;
    }
    setBusy(true);
    setError('');
    const { error } = await signIn(phone, password);
    setBusy(false);
    if (error) setError(error.message || 'Sign in failed');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="brand-mark" style={{ width: 56, height: 56, fontSize: 28, margin: '0 auto 16px' }}>S</div>
          <h1 className="display" style={{ fontSize: 36, margin: '0 0 4px' }}>SOP-Fast</h1>
          <p style={{ color: 'var(--ink-mute)', margin: 0, fontSize: 14 }}>SOPs for restaurants that actually run</p>
        </div>
        <div className="card">
          <label className="label">Phone Number</label>
          <input
            className="input"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="9000000010"
            inputMode="tel"
            autoComplete="tel"
          />
          <div style={{ height: 12 }} />
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            autoComplete="current-password"
          />
          {error && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 12 }}>{error}</div>}
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={busy}
            style={{ width: '100%', marginTop: 18, justifyContent: 'center' }}
          >
            {busy ? 'Signing in...' : 'Sign in'} <ChevronRight size={16} />
          </button>
        </div>
        <div style={{ marginTop: 20, fontSize: 12, color: 'var(--ink-mute)', lineHeight: 1.7, textAlign: 'center' }}>
          Forgot your password? Ask your manager to reset it.
        </div>
      </div>
    </div>
  );
}
