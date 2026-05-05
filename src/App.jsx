import { useAuth } from './lib/auth.jsx';
import Login from './pages/Login.jsx';
import ManagerView from './pages/ManagerView.jsx';
import WorkerView from './pages/WorkerView.jsx';

export default function App() {
  const { session, profile, loading } = useAuth();

  if (loading) return <div className="spinner" />;
  if (!session) return <Login />;
  if (!profile) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>No profile linked to this account</h2>
        <p style={{ color: 'var(--ink-mute)' }}>
          Your auth user exists but has no profile row. Run the seed SQL or contact your admin.
        </p>
      </div>
    );
  }

  if (profile.role === 'manager') return <ManagerView />;
  if (profile.role === 'worker') return <WorkerView />;
  return <div>Unknown role: {profile.role}</div>;
}
