import { useState, useMemo } from 'react';
import { Check, Eye, X } from 'lucide-react';
import { todayKey, dayKeyFor, computeProgress } from '../lib/api.js';

export default function TodayProgress({ sops, workers, completions }) {
  const [viewing, setViewing] = useState(null);
  const today = todayKey();

  // Build the per-row status grid (sop x assigned worker)
  const rows = useMemo(() => {
    const out = [];
    sops.forEach(sop => {
      sop.assigned_to.forEach(workerId => {
        const worker = workers.find(w => w.id === workerId);
        if (!worker) return;
        const dKey = dayKeyFor(sop.type);
        const completion = completions.find(c =>
          c.sop_id === sop.id && c.worker_id === workerId && c.day_key === dKey
        );

        // For one-time SOPs that are already done, mark as done-prior so they don't count as today's work
        if (sop.type === 'onetime' && completion?.completed_at) {
          out.push({ sop, worker, status: 'done-prior', completion, prog: { done: sop.steps.length, total: sop.steps.length, pct: 100 } });
          return;
        }

        const prog = computeProgress(sop, completion);
        let status;
        if (completion?.completed_at) status = 'done';
        else if (prog.done > 0) status = 'in-progress';
        else status = 'not-started';
        out.push({ sop, worker, status, completion, prog });
      });
    });
    return out;
  }, [sops, workers, completions, today]);

  const totalAssigned = rows.length;
  const completed = rows.filter(r => r.status === 'done' || r.status === 'done-prior').length;
  const inProgress = rows.filter(r => r.status === 'in-progress').length;
  const totalSteps = rows.reduce((acc, r) => acc + r.prog.total, 0);
  const doneSteps = rows.reduce((acc, r) => acc + r.prog.done, 0);
  const overallPct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;

  // Live activity feed: build chronological events from completions
  const feedEvents = useMemo(() => {
    const events = [];
    completions.forEach(comp => {
      const sop = sops.find(s => s.id === comp.sop_id);
      const worker = workers.find(w => w.id === comp.worker_id);
      if (!sop || !worker) return;
      const stepCs = comp.step_completions || {};
      Object.entries(stepCs).forEach(([stepId, sc]) => {
        if (sc.done && sc.ts) {
          const step = sop.steps.find(s => s.id === stepId);
          events.push({
            ts: sc.ts,
            type: 'step',
            workerName: worker.full_name,
            sopTitle: sop.title,
            stepText: step?.text || ''
          });
        }
      });
      if (comp.completed_at) {
        events.push({
          ts: new Date(comp.completed_at).getTime(),
          type: 'complete',
          workerName: worker.full_name,
          sopTitle: sop.title
        });
      }
    });
    return events.sort((a, b) => b.ts - a.ts).slice(0, 20);
  }, [completions, sops, workers]);

  return (
    <div>
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="mono">Assigned today</div>
          <div className="display" style={{ fontSize: 38, lineHeight: 1.1, marginTop: 4 }}>{totalAssigned}</div>
        </div>
        <div className="card">
          <div className="mono" style={{ color: 'var(--green)' }}>Completed</div>
          <div className="display" style={{ fontSize: 38, lineHeight: 1.1, marginTop: 4, color: 'var(--green)' }}>{completed}</div>
        </div>
        <div className="card">
          <div className="mono" style={{ color: 'var(--warn)' }}>In progress</div>
          <div className="display" style={{ fontSize: 38, lineHeight: 1.1, marginTop: 4, color: 'var(--warn)' }}>{inProgress}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24, background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div>
            <div className="mono" style={{ color: 'rgba(245,241,234,0.55)' }}>Total daily SOPs</div>
            <div className="display" style={{ fontSize: 28, marginTop: 2 }}>{overallPct}% complete</div>
          </div>
          <div className="mono" style={{ color: 'rgba(245,241,234,0.55)' }}>{doneSteps} / {totalSteps} steps</div>
        </div>
        <div style={{ height: 8, background: 'rgba(245,241,234,0.15)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--accent)', width: `${overallPct}%`, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-soft)' }}>
            <div className="display" style={{ fontSize: 18 }}>Status by task — {today}</div>
          </div>
          {rows.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-mute)' }}>
              No SOPs are currently assigned. Create one in the SOPs tab.
            </div>
          )}
          {rows.map((r, i) => (
            <div
              key={i}
              className="row"
              style={{ cursor: r.completion ? 'pointer' : 'default' }}
              onClick={() => r.completion && setViewing(r)}
            >
              <div style={{ flex: 2 }}>
                <div style={{ fontWeight: 500 }}>{r.sop.title}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-mute)', display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                  <span className={`pill pill-${r.sop.type}`}>{r.sop.type === 'recurring' ? 'Recurring' : 'One-time'}</span>
                  <span>{r.worker.full_name}</span>
                </div>
              </div>
              <div style={{ flex: 1.5 }}>
                {r.status === 'done' && <span className="pill pill-done"><Check size={11} /> Completed today</span>}
                {r.status === 'done-prior' && <span className="pill pill-done"><Check size={11} /> Already completed</span>}
                {r.status === 'in-progress' && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 4 }}>{r.prog.done}/{r.prog.total} steps</div>
                    <div className="pbar"><div className="pbar-fill" style={{ width: `${r.prog.pct}%` }} /></div>
                  </div>
                )}
                {r.status === 'not-started' && <span className="pill pill-pending">Not started</span>}
              </div>
              <div>{r.completion && <Eye size={16} color="var(--ink-mute)" />}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="display" style={{ fontSize: 18 }}>Live activity</div>
            <span className="mono">{feedEvents.length} events</span>
          </div>
          {feedEvents.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13 }}>
              Nothing happening yet — activity will show up as workers tick off steps.
            </div>
          )}
          {feedEvents.map((ev, i) => (
            <div key={i} style={{ padding: '12px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 12 }}>
              <div style={{
                width: 8, height: 8, borderRadius: 999, marginTop: 6, flexShrink: 0,
                background: ev.type === 'complete' ? 'var(--green)' : 'var(--accent)'
              }} />
              <div style={{ flex: 1, fontSize: 13 }}>
                <div>
                  <strong>{ev.workerName}</strong>{' '}
                  {ev.type === 'complete' ? 'finished' : 'checked off a step in'}{' '}
                  <span style={{ color: 'var(--ink-soft)' }}>{ev.sopTitle}</span>
                </div>
                {ev.type === 'step' && ev.stepText && (
                  <div style={{ color: 'var(--ink-mute)', fontSize: 12, marginTop: 2 }}>"{ev.stepText}"</div>
                )}
                <div className="mono" style={{ marginTop: 4 }}>{new Date(ev.ts).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {viewing && <CompletionViewer viewing={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function CompletionViewer({ viewing, onClose }) {
  const { sop, worker, completion } = viewing;
  const stepCs = completion.step_completions || {};
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div className="mono">{worker.full_name}</div>
            <h2 className="display" style={{ fontSize: 24, margin: '2px 0 0' }}>{sop.title}</h2>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: 6 }}><X size={16} /></button>
        </div>
        {sop.steps.map(step => {
          const s = stepCs[step.id];
          return (
            <div key={step.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <div className={`checkbox ${s?.done ? 'checked' : ''}`} style={{ cursor: 'default' }}>
                {s?.done && <Check size={14} />}
              </div>
              <div style={{ flex: 1 }}>
                <div>{step.text}</div>
                {s?.ts && <div className="mono" style={{ marginTop: 3 }}>Completed {new Date(s.ts).toLocaleTimeString()}</div>}
                {s?.photo_url && <img src={s.photo_url} alt="" className="photo-thumb" style={{ marginTop: 8, width: 120, height: 120 }} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
