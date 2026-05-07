import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { createWorker } from '../lib/api.js';

export default function WorkersManager({ workers, restaurantId, onChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', password: '', workerRole: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async () => {
    if (!form.name || !form.phone || !form.password) {
      setError('Name, phone and password are required');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setBusy(true);
    setError('');
    const { error } = await createWorker({ ...form });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ name: '', phone: '', password: '', workerRole: '' });
    setShowAdd(false);
    onChange();
  };

  const remove = async (id) => {
    if (!confirm('Remove this worker? Their auth account will remain in Supabase but they will no longer have access.')) return;
    // Note: this only deletes the profile row. The auth.users row remains
    // (deleting it requires the service role key). RLS will block them
    // from accessing anything because they no longer have a profile.
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    onChange();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="display" style={{ fontSize: 24, margin: 0 }}>{workers.length} workers</h2>
        <button className="btn btn-accent" onClick={() => setShowAdd(true)}><Plus size={16} /> New worker</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {workers.map(w => (
          <div key={w.id} className="row">
            <div style={{
              width: 36, height: 36, background: 'var(--bg-deep)', borderRadius: 999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, color: 'var(--ink-soft)'
            }}>
              {w.full_name[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{w.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>{w.phone} · {w.worker_role || '—'}</div>
            </div>
            <button className="btn btn-danger" onClick={() => remove(w.id)} style={{ padding: 8 }}><Trash2 size={14} /></button>
          </div>
        ))}
        {workers.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-mute)' }}>No workers yet.</div>
        )}
      </div>
      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="display" style={{ fontSize: 24, margin: '0 0 16px' }}>New worker</h2>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <div style={{ height: 12 }} />
            <div className="grid-2">
              <div>
                <label className="label">Phone (login ID)</label>
                <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">Password (min 6 chars)</label>
                <input className="input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
            </div>
            <div style={{ height: 12 }} />
            <label className="label">Role (optional)</label>
            <input className="input" value={form.workerRole} onChange={e => setForm({ ...form, workerRole: e.target.value })} placeholder="e.g. Line cook" />
            {error && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)} disabled={busy}>Cancel</button>
              <button className="btn btn-accent" onClick={add} disabled={busy}>
                {busy ? 'Creating...' : 'Add worker'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
