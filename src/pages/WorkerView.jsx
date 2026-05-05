import { useEffect, useState, useCallback } from 'react';
import { LogOut, Check } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import { todayKey, dayKeyFor, computeProgress } from '../lib/api.js';
import WorkerSopRunner from '../components/WorkerSopRunner.jsx';

export default function WorkerView() {
  const { profile, signOut } = useAuth();
  const [tab, setTab] = useState('active');
  const [restaurant, setRestaurant] = useState(null);
  const [sops, setSops] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [activeSop, setActiveSop] = useState(null);

  // Load restaurant
  useEffect(() => {
    supabase.from('restaurants').select('*').eq('id', profile.restaurant_id).single()
      .then(({ data }) => setRestaurant(data));
  }, [profile.restaurant_id]);

  // Load SOPs assigned to this worker
  const loadSops = useCallback(async () => {
    const { data } = await supabase
      .from('sops')
      .select('*, sop_assignments!inner(worker_id)')
      .eq('restaurant_id', profile.restaurant_id)
      .eq('archived', false)
      .eq('sop_assignments.worker_id', profile.id);
    setSops(data || []);
  }, [profile.restaurant_id, profile.id]);

  // Load completions for this worker
  const loadCompletions = useCallback(async () => {
    const { data } = await supabase
      .from('completions')
      .select('*')
      .eq('worker_id', profile.id)
      .order('updated_at', { ascending: false });
    setCompletions(data || []);
  }, [profile.id]);

  useEffect(() => {
    loadSops();
    loadCompletions();
  }, [loadSops, loadCompletions]);

  if (activeSop) {
    return (
      <WorkerSopRunner
        sop={activeSop}
        completion={completions.find(c =>
          c.sop_id === activeSop.id && c.day_key === dayKeyFor(activeSop.type)
        )}
        onBack={() => { setActiveSop(null); loadCompletions(); }}
      />
    );
  }

  // Categorize: active = visible today and not yet completed
  const todayDk = todayKey();
  const activeTasks = sops.filter(sop => {
    const completion = completions.find(c =>
      c.sop_id === sop.id && c.day_key === dayKeyFor(sop.type)
    );
    if (sop.type === 'onetime') {
      // For one-time: hide if there's any completed completion for it
      const anyDone = completions.find(c => c.sop_id === sop.id && c.completed_at);
      if (anyDone) return false;
    } else {
      // For recurring: hide if today's completion is done
      if (completion?.completed_at) return false;
    }
    return true;
  });

  const historyItems = completions
    .filter(c => c.completed_at)
    .map(c => ({ completion: c, sop: sops.find(s => s.id === c.sop_id) }))
    .filter(h => h.sop);

  // Status colors per SOP
  const statusFor = (sop) => {
    const completion = completions.find(c =>
      c.sop_id === sop.id && c.day_key === dayKeyFor(sop.type)
    );
    const prog = computeProgress(sop, completion);
    if (completion?.completed_at) return { color: 'var(--green)', soft: 'var(--green-soft)', label: 'Done', prog };
    if (prog.done > 0) return { color: 'var(--warn)', soft: 'var(--warn-soft)', label: 'In progress', prog };
    return { color: 'var(--accent)', soft: 'var(--accent-soft)', label: 'Not started', prog };
  };

  return (
    <div>
      <div className="worker-shell">
        <div className="worker-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="mono" style={{ color: 'rgba(245,241,234,0.6)' }}>{restaurant?.name}</div>
              <div className="display" style={{ fontSize: 24, marginTop: 2 }}>Hey, {profile.full_name}</div>
            </div>
            <button onClick={signOut} style={{
              background: 'transparent', border: '1px solid rgba(245,241,234,0.3)',
              color: 'var(--bg)', padding: 8, borderRadius: 4, cursor: 'pointer'
            }}>
              <LogOut size={14} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-deep)', padding: 4, borderRadius: 6, marginBottom: 16 }}>
          {[
            { k: 'active', label: `Active (${activeTasks.length})` },
            { k: 'history', label: `History (${historyItems.length})` }
          ].map(t => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                flex: 1, padding: '9px 12px', border: 'none', borderRadius: 4, cursor: 'pointer',
                background: tab === t.k ? 'var(--bg-card)' : 'transparent',
                color: tab === t.k ? 'var(--ink)' : 'var(--ink-mute)',
                fontWeight: 500, fontSize: 13, fontFamily: 'inherit'
              }}
            >{t.label}</button>
          ))}
        </div>

        {tab === 'active' && (
          <>
            <div className="mono" style={{ marginBottom: 12 }}>
              {todayDk} · {activeTasks.length} task{activeTasks.length !== 1 && 's'} to go
            </div>
            {activeTasks.map(sop => {
              const st = statusFor(sop);
              return (
                <div
                  key={sop.id}
                  className="task-card"
                  onClick={() => setActiveSop(sop)}
                  style={{ borderLeft: `4px solid ${st.color}` }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <span className={`pill pill-${sop.type}`}>{sop.type === 'recurring' ? 'Daily' : 'One-time'}</span>
                    <span className="pill" style={{ background: st.soft, color: st.color }}>{st.label}</span>
                  </div>
                  <div className="display" style={{ fontSize: 19, marginBottom: 4 }}>{sop.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-mute)', marginBottom: 12 }}>{sop.description}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div className="mono">{st.prog.done} of {st.prog.total}</div>
                    <div className="mono">{st.prog.pct}%</div>
                  </div>
                  <div className="pbar">
                    <div className="pbar-fill" style={{ width: `${st.prog.pct}%`, background: st.color }} />
                  </div>
                </div>
              );
            })}
            {activeTasks.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <div className="display" style={{ fontSize: 20, marginBottom: 6 }}>All clear</div>
                <div style={{ fontSize: 13, color: 'var(--ink-mute)' }}>No active tasks. Nice work.</div>
              </div>
            )}
          </>
        )}

        {tab === 'history' && (
          <>
            <div className="mono" style={{ marginBottom: 12 }}>
              {historyItems.length} completion{historyItems.length !== 1 && 's'}
            </div>
            {historyItems.map((h, i) => (
              <div key={i} className="task-card" style={{ cursor: 'default', borderLeft: '4px solid var(--green)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span className={`pill pill-${h.sop.type}`}>{h.sop.type === 'recurring' ? 'Daily' : 'One-time'}</span>
                  <span className="pill pill-done"><Check size={11} /> Done</span>
                </div>
                <div className="display" style={{ fontSize: 17, marginBottom: 2 }}>{h.sop.title}</div>
                <div className="mono" style={{ marginTop: 6 }}>
                  Completed {new Date(h.completion.completed_at).toLocaleString()} · {h.completion.day_key}
                </div>
              </div>
            ))}
            {historyItems.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 13, color: 'var(--ink-mute)' }}>
                  No completed SOPs yet — finish one and it'll show up here.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
