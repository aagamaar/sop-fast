import { useEffect, useState, useCallback } from 'react';
import { LogOut, BarChart3, ClipboardList, Users } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import TodayProgress from '../components/TodayProgress.jsx';
import SopsManager from '../components/SopsManager.jsx';
import WorkersManager from '../components/WorkersManager.jsx';

export default function ManagerView() {
  const { profile, signOut } = useAuth();
  const [tab, setTab] = useState('today');
  const [restaurant, setRestaurant] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [sops, setSops] = useState([]);
  const [completions, setCompletions] = useState([]);

  // Load restaurant
  useEffect(() => {
    supabase.from('restaurants').select('*').eq('id', profile.restaurant_id).single()
      .then(({ data }) => setRestaurant(data));
  }, [profile.restaurant_id]);

  // Load workers
  const loadWorkers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('restaurant_id', profile.restaurant_id)
      .eq('role', 'worker')
      .order('created_at', { ascending: false });
    setWorkers(data || []);
  }, [profile.restaurant_id]);

  // Load SOPs (with their assignments via a join)
  const loadSops = useCallback(async () => {
    const { data } = await supabase
      .from('sops')
      .select('*, sop_assignments(worker_id)')
      .eq('restaurant_id', profile.restaurant_id)
      .eq('archived', false)
      .order('created_at', { ascending: false });
    // Flatten assignments to a worker_id array per SOP
    const flat = (data || []).map(s => ({
      ...s,
      assigned_to: (s.sop_assignments || []).map(a => a.worker_id)
    }));
    setSops(flat);
  }, [profile.restaurant_id]);

  // Load completions
  const loadCompletions = useCallback(async () => {
    const { data } = await supabase
      .from('completions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(500);
    setCompletions(data || []);
  }, []);

  useEffect(() => {
    loadWorkers();
    loadSops();
    loadCompletions();
  }, [loadWorkers, loadSops, loadCompletions]);

  // Real-time subscription on completions for live activity feed
  useEffect(() => {
    const channel = supabase
      .channel('manager-completions')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'completions' },
        () => loadCompletions()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadCompletions]);

  return (
    <div>
      <div className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="display" style={{ fontSize: 20 }}>{restaurant?.name || '...'}</div>
            <div className="mono">Manager · {profile.full_name}</div>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={signOut}><LogOut size={14} /> Sign out</button>
      </div>
      <div className="container">
        <div className="tabs">
          <div className={`tab ${tab === 'today' ? 'active' : ''}`} onClick={() => setTab('today')}>
            <BarChart3 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Today's progress
          </div>
          <div className={`tab ${tab === 'sops' ? 'active' : ''}`} onClick={() => setTab('sops')}>
            <ClipboardList size={14} style={{ verticalAlign: -2, marginRight: 6 }} />SOPs
          </div>
          <div className={`tab ${tab === 'workers' ? 'active' : ''}`} onClick={() => setTab('workers')}>
            <Users size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Workers
          </div>
        </div>

        {tab === 'today' && (
          <TodayProgress sops={sops} workers={workers} completions={completions} />
        )}
        {tab === 'sops' && (
          <SopsManager
            sops={sops}
            workers={workers}
            restaurantId={profile.restaurant_id}
            onChange={loadSops}
          />
        )}
        {tab === 'workers' && (
          <WorkersManager
            workers={workers}
            restaurantId={profile.restaurant_id}
            onChange={loadWorkers}
          />
        )}
      </div>
    </div>
  );
}
