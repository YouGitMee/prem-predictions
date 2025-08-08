export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/server/supabaseAdmin';
import { fetchPLMatchesFD } from '@/utils/providers/footballData';

export async function GET() {
  try {
    // Use latest league to pick a season (adjust if you run multiple leagues)
    const { data: leagues, error: lerr } = await supabaseAdmin
      .from('leagues')
      .select('season')
      .order('created_at', { ascending: false })
      .limit(1);
    if (lerr || !leagues?.length) throw lerr || new Error('no leagues');

    // If your leagues.season is "25/26", convert to "2025" here:
    const season = leagues[0].season.includes('/')
      ? `20${leagues[0].season.split('/')[0]}`
      : leagues[0].season;

    const matches = await fetchPLMatchesFD(season);

    const updates = matches.map(m => ({
      provider_id: String(m.id),
      status: m.status,
      goals_home: m.score?.fullTime?.home ?? null,
      goals_away: m.score?.fullTime?.away ?? null,
      is_postponed: m.status === 'POSTPONED'
    }));

    const { error: uerr } = await supabaseAdmin
      .from('fixtures')
      .upsert(updates, { onConflict: 'provider_id' });
    if (uerr) throw uerr;

    return NextResponse.json({ ok: true, updated: updates.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 });
  }
}
