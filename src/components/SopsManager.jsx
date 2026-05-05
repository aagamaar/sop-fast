import { useState } from 'react';
import { Plus, Trash2, X, Camera, Calendar, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { uid } from '../lib/api.js';

export default function SopsManager({ sops, workers, restaurantId, onChange }) {
  const [editing, setEditing] = useState(null);

  const blank = () => ({
    id: null,
    restaurant_id: restaurantId,
    title: '',
    description: '',
    type: 'recurring',
    steps: [{ id: uid(), text: '', requirePhoto: false }],
    assigned_to: []
  });

  const save = async (sop) => {
    if (!sop.title || sop.steps.some(s => !s.text)) return;

    if (sop.id) {
      // Update existing
      const { error } = await supabase
        .from('sops')
        .update({
          title: sop.title,
          description: sop.description,
          type: sop.type,
          steps: sop.steps
        })
        .eq('id', sop.id);
      if (error) { alert(error.message); return; }

      // Replace assignments
      await supabase.from('sop_assignments').delete().eq('sop_id', sop.id);
      if (sop.assigned_to.length > 0) {
        await supabase.from('sop_assignments').insert(
          sop.assigned_to.map(workerId => ({ sop_id: sop.id, worker_id: workerId }))
        );
      }
    } else {
      // Create new
      const { data, error } = await supabase
        .from('sops')
        .insert({
          restaurant_id: restaurantId,
          title: sop.title,
          description: sop.description,
          type: sop.type,
          steps: sop.steps
        })
        .select()
        .single();
      if (error) { alert(error.message); return; }
      if (sop.assigned_to.length > 0) {
        await supabase.from('sop_assignments').insert(
          sop.assigned_to.map(workerId => ({ sop_id: data.id, worker_id: workerId }))
        );
      }
    }

    setEditing(null);
    onChange();
  };

  const remove = async (id) => {
    if (!confirm('Delete this SOP?')) return;
    const { error } = await supabase.from('sops').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    onChange();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="display" style={{ fontSize: 24, margin: 0 }}>{sops.length} SOPs</h2>
        <button className="btn btn-accent" onClick={() => setEditing(blank())}><Plus size={16} /> New SOP</button>
      </div>
      <div className="grid-2">
        {sops.map(sop => (
          <div key={sop.id} className="card">
            <span className={`pill pill-${sop.type}`}>
              {sop.type === 'recurring' ? <><Calendar size={10} /> Recurring</> : <><Clock size={10} /> One-time</>}
            </span>
            <div className="display" style={{ fontSize: 18, marginTop: 8 }}>{sop.title}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-mute)', marginTop: 3 }}>{sop.description}</div>
            <div className="divider" />
            <div className="mono" style={{ marginBottom: 4 }}>
              {sop.steps.length} steps · {sop.steps.filter(s => s.requirePhoto).length} photo proofs
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14 }}>
              Assigned to: {sop.assigned_to.length === 0
                ? <em style={{ color: 'var(--ink-mute)' }}>nobody</em>
                : sop.assigned_to.map(id => workers.find(w => w.id === id)?.full_name).filter(Boolean).join(', ')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEditing({ ...sop, steps: sop.steps.map(s => ({ ...s })) })}>Edit</button>
              <button className="btn btn-danger" onClick={() => remove(sop.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      {sops.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 50, color: 'var(--ink-mute)' }}>
          No SOPs yet. Click <strong>New SOP</strong> to create your first one.
        </div>
      )}
      {editing && <SopEditor sop={editing} setSop={setEditing} onSave={save} onCancel={() => setEditing(null)} workers={workers} />}
    </div>
  );
}

function SopEditor({ sop, setSop, onSave, onCancel, workers }) {
  const update = (patch) => setSop({ ...sop, ...patch });
  const updateStep = (id, patch) => setSop({ ...sop, steps: sop.steps.map(s => s.id === id ? { ...s, ...patch } : s) });
  const addStep = () => setSop({ ...sop, steps: [...sop.steps, { id: uid(), text: '', requirePhoto: false }] });
  const removeStep = (id) => setSop({ ...sop, steps: sop.steps.filter(s => s.id !== id) });
  const toggleAssign = (wid) => {
    const has = sop.assigned_to.includes(wid);
    update({ assigned_to: has ? sop.assigned_to.filter(x => x !== wid) : [...sop.assigned_to, wid] });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 className="display" style={{ fontSize: 24, margin: 0 }}>{sop.title || 'New SOP'}</h2>
          <button className="btn btn-ghost" onClick={onCancel} style={{ padding: 6 }}><X size={16} /></button>
        </div>
        <label className="label">Title</label>
        <input className="input" value={sop.title} onChange={e => update({ title: e.target.value })} placeholder="e.g. Closing Cleanup" />
        <div style={{ height: 12 }} />
        <label className="label">Description</label>
        <textarea className="textarea input" rows={2} value={sop.description || ''} onChange={e => update({ description: e.target.value })} />
        <div style={{ height: 12 }} />
        <div className="grid-2">
          <div>
            <label className="label">Type</label>
            <select className="select" value={sop.type} onChange={e => update({ type: e.target.value })}>
              <option value="recurring">Recurring (every day)</option>
              <option value="onetime">One-time</option>
            </select>
          </div>
          <div>
            <label className="label">Assign to workers</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {workers.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleAssign(w.id)}
                  style={{
                    padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 999,
                    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    background: sop.assigned_to.includes(w.id) ? 'var(--ink)' : 'var(--bg-card)',
                    color: sop.assigned_to.includes(w.id) ? 'var(--bg)' : 'var(--ink-soft)'
                  }}
                >{w.full_name}</button>
              ))}
              {workers.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>Add workers first</span>}
            </div>
          </div>
        </div>
        <div className="divider" />
        <div className="mono" style={{ marginBottom: 8 }}>Steps</div>
        {sop.steps.map((step, i) => (
          <div key={step.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
            <div className="mono" style={{ paddingTop: 12, minWidth: 24 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <input className="input" value={step.text} onChange={e => updateStep(step.id, { text: e.target.value })} placeholder="Describe the step" />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'var(--ink-soft)', cursor: 'pointer' }}>
                <input type="checkbox" checked={step.requirePhoto} onChange={e => updateStep(step.id, { requirePhoto: e.target.checked })} />
                <Camera size={12} /> Require photo proof
              </label>
            </div>
            {sop.steps.length > 1 && <button className="btn btn-danger" onClick={() => removeStep(step.id)} style={{ padding: 8 }}><Trash2 size={14} /></button>}
          </div>
        ))}
        <button className="btn btn-ghost" onClick={addStep} style={{ marginTop: 8 }}><Plus size={14} /> Add step</button>
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-accent" onClick={() => onSave(sop)}>Save SOP</button>
        </div>
      </div>
    </div>
  );
}
