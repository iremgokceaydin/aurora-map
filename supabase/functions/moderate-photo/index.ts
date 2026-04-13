// Supabase Edge Function — moderate-photo
// Receives uploaded photo metadata, runs Google Vision SafeSearch,
// then inserts into aurora_photos with status 'approved' or 'rejected'.
//
// Environment variables required (set in Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL           — auto-provided by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase runtime
//   GOOGLE_VISION_API_KEY  — from Google Cloud Console

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SAFE_SEARCH_URL = 'https://vision.googleapis.com/v1/images:annotate';

// Likelihood levels Google returns, ordered by severity
const LIKELIHOOD_RANK: Record<string, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 0,
  UNLIKELY: 1,
  POSSIBLE: 2,
  LIKELY: 3,
  VERY_LIKELY: 4,
};

// Reject if any of these exceed POSSIBLE
const BLOCKED_CATEGORIES = ['adult', 'violence', 'racy'] as const;

async function runSafeSearch(imageUrl: string, apiKey: string): Promise<{ safe: boolean; reason?: string }> {
  const body = {
    requests: [{
      image: { source: { imageUri: imageUrl } },
      features: [{ type: 'SAFE_SEARCH_DETECTION' }],
    }],
  };

  const res = await fetch(`${SAFE_SEARCH_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vision API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const annotation = data.responses?.[0]?.safeSearchAnnotation;

  if (!annotation) {
    // Vision couldn't analyse it — treat as unsafe to be cautious
    return { safe: false, reason: 'Vision API returned no annotation' };
  }

  for (const category of BLOCKED_CATEGORIES) {
    const rank = LIKELIHOOD_RANK[annotation[category]] ?? 0;
    if (rank >= LIKELIHOOD_RANK['LIKELY']) {
      return { safe: false, reason: `Flagged as ${category}: ${annotation[category]}` };
    }
  }

  return { safe: true };
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  try {
    const {
      city_id, city_name, month,
      file_path, public_url,
      uploader, description,
    } = await req.json();

    if (!city_id || !file_path || !public_url || month === undefined) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const sb = createClient(supabaseUrl, serviceKey);

    let status: 'approved' | 'rejected' = 'approved';
    let rejectReason: string | undefined;

    if (apiKey) {
      const result = await runSafeSearch(public_url, apiKey);
      if (!result.safe) {
        status = 'rejected';
        rejectReason = result.reason;
      }
    } else {
      // No API key configured — approve but log a warning
      console.warn('GOOGLE_VISION_API_KEY not set, skipping SafeSearch');
    }

    if (status === 'rejected') {
      // Delete the file from storage so it doesn't linger
      await sb.storage.from('aurora-photos').remove([file_path]);

      return Response.json(
        { error: 'Photo did not pass content moderation', reason: rejectReason },
        { status: 422, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Insert approved photo
    const { data, error } = await sb
      .from('aurora_photos')
      .insert({ city_id, city_name, month, file_path, public_url, uploader, description, status })
      .select('id')
      .single();

    if (error) throw error;

    return Response.json(
      { id: data.id, status },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );

  } catch (err) {
    console.error('moderate-photo error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
