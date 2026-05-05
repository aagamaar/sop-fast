import { useState, useEffect, useRef } from 'react';
import { Check, Camera } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import { dayKeyFor, computeProgress, isFullyComplete, uploadStepPhoto } from '../lib/api.js';

export default function WorkerSopRunner({ sop, completion: initialCompletion, onBack }) {
  const { profile } = useAuth();
  const [completion, setCompletion] = useState(initialCompletion || null);
  const [busy, setBusy] = useState(false);
  const fileRefs = useRef({});

  const day = dayKeyFor(sop.type);

  // Ensure we have a completion row to update
  const ensureCompletion = async () => {
    if (completion) return completion;
    const { data, error } = await supabase
      .from('completions')
      .insert({
        sop_id: sop.id,
        worker_id: profile.id,
        day_key: day,
        step_completions: {}
      })
      .select()
      .single();
    if (error) {
      // Maybe a row already exists (created in parallel) — fetch it
      const { data: existing } = await supabase
        .from('completions')
        .select('*')
        .eq('sop_id', sop.id)
        .eq('worker_id', profile.id)
        .eq('day_key', day)
        .maybeSingle();
      if (existing) {
        setCompletion(existing);
        return existing;
      }
      alert(error.message);
      return null;
    }
    setCompletion(data);
    return data;
  };

  const updateStep = async (stepId, patch) => {
    const c = await ensureCompletion();
    if (!c) return;
    const stepCs = c.step_completions || {};
    const newSteps = {
      ...stepCs,
      [stepId]: { ...(stepCs[stepId] || {}), ...patch, ts: Date.now() }
    };
    const { data, error } = await supabase
      .from('completions')
      .update({ step_completions: newSteps })
      .eq('id', c.id)
      .select()
      .single();
    if (error) { alert(error.message); return; }
    setCompletion(data);
  };

  const handlePhoto = async (stepId, file) => {
    setBusy(true);
    const { error, url, path } = await uploadStepPhoto({
      workerId: profile.id, sopId: sop.id, stepId, file
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    // Store both signed URL (for immediate display) and path (for re-signing later)
    await updateStep(stepId, { photo_url: url, photo_path: path });
  };

  const finish = async () => {
    if (!completion) return;
    const { data, error } = await supabase
      .from('completions')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', completion.id)
      .select()
      .single();
    if (error) { alert(error.message); return; }
    setCompletion(data);
    onBack();
  };

  const allDone = isFullyComplete(sop, completion);
  const prog = computeProgress(sop, completion);
  const stepCs = completion?.step_completions || {};

  return (
    <div>
      <div className="worker-shell">
        <div className="worker-header">
          <button
            onClick={onBack}
            style={{
              background: 'transparent', border: 'none', color: 'rgba(245,241,234,0.7)',
              cursor: 'pointer', padding: 0, marginBottom: 8, fontSize: 13
            }}
          >← Back to tasks</button>
          <div className="display" style={{ fontSize: 22, marginBottom: 4 }}>{sop.title}</div>
          <div style={{ fontSize: 13, color: 'rgba(245,241,234,0.7)', marginBottom: 14 }}>{sop.description}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
            <span>{prog.done} of {prog.total} done</span>
            <span>{prog.pct}%</span>
          </div>
          <div style={{ height: 4, background: 'rgba(245,241,234,0.2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--accent)', width: `${prog.pct}%`, transition: 'width 0.3s' }} />
          </div>
        </div>

        {sop.steps.map((step, i) => {
          const cs = stepCs[step.id] || {};
          return (
            <div key={step.id} className="step-row">
              <div
                className={`checkbox ${cs.done ? 'checked' : ''}`}
                onClick={() => {
                  if (step.requirePhoto && !cs.photo_url && !cs.done) {
                    alert('Photo proof required for this step');
                    return;
                  }
                  updateStep(step.id, { done: !cs.done });
                }}
              >
                {cs.done && <Check size={16} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, lineHeight: 1.4 }}>
                  <span className="mono" style={{ marginRight: 6 }}>{i + 1}</span>
                  {step.text}
                </div>
                {step.requirePhoto && (
                  <div style={{ marginTop: 10 }}>
                    {cs.photo_url ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <img src={cs.photo_url} alt="" className="photo-thumb" />
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '6px 10px' }}
                          onClick={() => fileRefs.current[step.id]?.click()}
                        >Replace</button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-ghost"
                        onClick={() => fileRefs.current[step.id]?.click()}
                        disabled={busy}
                        style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed', color: 'var(--accent)' }}
                      >
                        <Camera size={14} /> {busy ? 'Uploading...' : 'Add photo proof'}
                      </button>
                    )}
                    <input
                      ref={el => fileRefs.current[step.id] = el}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={e => e.target.files[0] && handlePhoto(step.id, e.target.files[0])}
                    />
                  </div>
                )}
                {cs.ts && cs.done && (
                  <div className="mono" style={{ marginTop: 6 }}>
                    ✓ {new Date(cs.ts).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {!completion?.completed_at && (
          <button
            className="btn btn-accent"
            onClick={finish}
            disabled={!allDone}
            style={{
              width: '100%', justifyContent: 'center', marginTop: 16, padding: 16, fontSize: 15
            }}
          >
            {allDone ? 'Mark complete' : 'Finish all steps first'}
          </button>
        )}
        {completion?.completed_at && (
          <div className="card" style={{
            textAlign: 'center', marginTop: 16,
            background: 'var(--green-soft)', borderColor: 'var(--green)', color: 'var(--green)'
          }}>
            <Check size={20} /> <strong>Completed</strong> at {new Date(completion.completed_at).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
