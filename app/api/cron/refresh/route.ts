export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/server/supabaseAdmin';
import { fetchPLMatchesFD } from '@/utils/providers/footballData';

export async function GET() {
  try {
    // 1) Pick season from latest league
    const { data: leagues, error: lerr } = await supabaseAdmin
      .from('leagues')
      .select('id, season')
      .order('created_at', { ascending: false })
      .limit(1);
    if (lerr || !leagues?.length) throw lerr || new Error('no leagues');

    const season = leagues[0].season.includes('/')
      ? `20${leagues[0].season.split('/')[0]}`
      : leagues[0].season;

    // 2) Fetch all provider matches
    const matches = await fetchPLMatchesFD(season);

    // 3) Build a map of provider_id -> league_id for existing fixtures
    const { data: existing, error: exErr } = await supabaseAdmin
      .from('fixtures')
      .select('provider_id, league_id');
    if (exErr) throw exErr;

    const leagueByProvider = new Map<string, string>();
    for (const row of existing ?? []) {
      // Safety cast to string
      leagueByProvider.set(String(row.provider_id), row.league_id as string);
    }

    // 4) Create rows to upsert, ALWAYS including league_id
    //    If we don't know the league for a provider_id, use the latest league.
    const defaultLeagueId = leagues[0].id as string;

    const updates = matches.map(m => {
      const pid = String(m.id);
      return {
        provider_id: pid,
        league_id: leagueByProvider.get(pid) ?? defaultLeagueId,
        status: m.status,
        goals_home: m.score?.fullTime?.home ?? null,
        goals_away: m.score?.fullTime?.away ?? null,
        is_postponed: m.status === 'POSTPONED'
      };
    });

    // 5) Upsert; either unique(provider_id) or unique(provider_id,league_id) will work now
    const { error: uerr } = await supabaseAdmin
      .from('fixtures')
      .upsert(updates, { onConflict: 'provider_id' });
    if (uerr) throw uerr;

    return NextResponse.json({ ok: true, updated: updates.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 });
  }
}
