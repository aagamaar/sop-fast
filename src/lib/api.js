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
// Calls the create-worker Edge Function which atomically:
//   1. Creates the auth user (using service role, no session side effects)
//   2. Inserts the profile row in the same restaurant as the calling manager
// The function verifies the caller is a manager before doing anything.
//
// `restaurantId` is no longer passed from the client — the function reads it
// from the caller's profile, so a manager can never create a worker in
// another restaurant even if they tampered with the request.
export const createWorker = async ({ name, phone, password, workerRole }) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { error: new Error('Not signed in') };
  }

  const { data, error } = await supabase.functions.invoke('create-worker', {
    body: { name, phone, password, workerRole },
  });

  if (error) {
    // Try to surface a useful message from the function's response body
    let detail = error.message;
    try {
      const ctx = await error.context?.json();
      if (ctx?.error) detail = ctx.error;
    } catch { /* ignore */ }
    return { error: new Error(detail) };
  }

  return { error: null, workerId: data?.workerId };
};

// ============================================================================
// Photo upload to Supabase Storage
// ============================================================================
export const uploadStepPhoto = async ({ workerId, sopId, stepId, file }) => {
  // Guardrails for public deployment
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

  if (file.size > MAX_SIZE) {
    return {
      error: new Error("Photo must be under 5MB. Try a smaller image."),
      url: null,
    };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      error: new Error("Only JPG, PNG, WebP, or HEIC images allowed."),
      url: null,
    };
  }

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${workerId}/${sopId}/${stepId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("sop-photos")
    .upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError, url: null };

  // For private buckets, get a signed URL (1 day expiry, refreshed on each load)
  const { data: signed, error: signError } = await supabase.storage
    .from("sop-photos")
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
