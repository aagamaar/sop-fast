import { supabase, phoneToEmail } from './supabase';

// ============================================================================
// Day key helpers
// ============================================================================
// For recurring SOPs, we use today's date in the user's local timezone.
// For one-time SOPs, we use the literal string 'once' so there's only ever
// one completion record per (sop, worker).
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const dayKeyFor = (sopType) => (sopType === 'recurring' ? todayKey() : 'once');

// ============================================================================
// Progress helpers
// ============================================================================
export const computeProgress = (sop, completion) => {
  const steps = sop.steps || [];
  const total = steps.length;
  const stepsDone = completion?.step_completions || {};
  const done = steps.filter(s => stepsDone[s.id]?.done).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
};

export const isFullyComplete = (sop, completion) => {
  const steps = sop.steps || [];
  const stepsDone = completion?.step_completions || {};
  return steps.every(s => {
    const cs = stepsDone[s.id];
    if (!cs?.done) return false;
    if (s.requirePhoto && !cs.photo_url) return false;
    return true;
  });
};

// ============================================================================
// Worker creation
// ============================================================================
// Creating a worker is a TWO step operation:
//   1. Create the auth user (via signUp)
//   2. Insert into profiles (linking auth.users.id to restaurant + role)
//
// In production, you'd want this to happen atomically — one option is a
// Supabase Edge Function with the service role key. For v1, we do it
// client-side. If step 2 fails, we'll have an orphaned auth user — rare
// but possible. ROADMAP.md tracks this.
export const createWorker = async ({ name, phone, password, workerRole, restaurantId }) => {
  const email = phoneToEmail(phone);

  // 1. Create auth user. signUp creates and immediately signs in the new user
  // by default — but since email confirmation is OFF for our setup, the user
  // is auto-confirmed and a session is created.
  //
  // CRITICAL: this signs the new user in, kicking the manager out. To avoid
  // that we save the manager's session and restore it after.
  const currentSession = (await supabase.auth.getSession()).data.session;

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password
  });
  if (signUpError) return { error: signUpError };
  if (!signUpData.user) return { error: new Error('Sign up returned no user') };

  // Restore manager's session immediately
  if (currentSession) {
    await supabase.auth.setSession({
      access_token: currentSession.access_token,
      refresh_token: currentSession.refresh_token
    });
  }

  // 2. Insert profile row
  const { error: profileError } = await supabase.from('profiles').insert({
    id: signUpData.user.id,
    restaurant_id: restaurantId,
    role: 'worker',
    full_name: name,
    phone: phone.replace(/\D/g, ''),
    worker_role: workerRole || null
  });

  if (profileError) {
    // We could try to delete the orphaned auth user here, but that requires
    // the service role key which we don't expose to the client.
    return { error: profileError };
  }

  return { error: null, workerId: signUpData.user.id };
};

// ============================================================================
// Photo upload to Supabase Storage
// ============================================================================
export const uploadStepPhoto = async ({ workerId, sopId, stepId, file }) => {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${workerId}/${sopId}/${stepId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('sop-photos')
    .upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError, url: null };

  // For private buckets, get a signed URL (1 day expiry, refreshed on each load)
  const { data: signed, error: signError } = await supabase.storage
    .from('sop-photos')
    .createSignedUrl(path, 60 * 60 * 24);
  if (signError) return { error: signError, url: null };
  return { error: null, url: signed.signedUrl, path };
};

// Generate a fresh signed URL for a stored path (URLs expire)
export const getSignedPhotoUrl = async (path) => {
  const { data, error } = await supabase.storage
    .from('sop-photos')
    .createSignedUrl(path, 60 * 60 * 24);
  return { url: data?.signedUrl, error };
};

export const uid = () => Math.random().toString(36).slice(2, 11);
