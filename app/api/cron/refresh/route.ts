export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/server/supabaseAdmin';
import { fetchPLMatchesFD } from '@/utils/providers/footballData';

export async function GET() {
  try {
    // 1) Pick season from latest league
    const { data: leagues, error: lerr } = await supabaseAdmin
      .from('leagues')
      .select('season')
      .order('created_at', { ascending: false })
      .limit(1);
    if (lerr || !leagues?.length) throw lerr || new Error('no leagues');

    const season = leagues[0].season.includes('/')
      ? `20${leagues[0].season.split('/')[0]}`
      : leagues[0].season;

    // 2) Fetch provider matches
    const matches = await fetchPLMatchesFD(season);

    // 3) Load existing fixtures’ provider_ids so we only UPDATE (no inserts)
    const { data: existing, error: exErr } = await supabaseAdmin
      .from('fixtures')
      .select('provider_id');
    if (exErr) throw exErr;

    const existingSet = new Set((existing ?? []).map(r => String(r.provider_id)));

    // 4) Build updates ONLY for rows we already have
    const updates = matches
      .filter(m => existingSet.has(String(m.id)))
      .map(m => ({
        provider_id: String(m.id),
        status: m.status,
        goals_home: m.score?.fullTime?.home ?? null,
        goals_away: m.score?.fullTime?.away ?? null,
        is_postponed: m.status === 'POSTPONED'
      }));

    if (updates.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, note: 'no matching rows' });
    }

    // 5) Upsert on provider_id (these will be updates only)
    const { error: uerr } = await supabaseAdmin
      .from('fixtures')
      .upsert(updates, { onConflict: 'provider_id' });
    if (uerr) throw uerr;

    return NextResponse.json({ ok: true, updated: updates.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 });
  }
}
