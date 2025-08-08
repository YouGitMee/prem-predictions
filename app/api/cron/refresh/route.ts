export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/server/supabaseAdmin';
import { fetchPLMatchesFD } from '@/utils/providers/footballData';
import { mapToFixtureRows } from '@/utils/fixturesMap';

export async function GET() {
  try {
    // 1) Get latest league (default target for new fixtures)
    const { data: leagues, error: lerr } = await supabaseAdmin
      .from('leagues')
      .select('id, season')
      .order('created_at', { ascending: false })
      .limit(1);
    if (lerr || !leagues?.length) throw lerr || new Error('no leagues');
    const defaultLeagueId = leagues[0].id as string;

    // Convert "25/26" -> "2025" (football-data expects a year)
    const season = leagues[0].season.includes('/')
      ? `20${leagues[0].season.split('/')[0]}`
      : leagues[0].season;

    // 2) Pull matches from provider
    const matches = await fetchPLMatchesFD(season);

    // 3) Load existing fixtures to know which provider_ids we already have
    const { data: existing, error: exErr } = await supabaseAdmin
      .from('fixtures')
      .select('provider_id');
    if (exErr) throw exErr;
    const existingSet = new Set((existing ?? []).map(r => String(r.provider_id)));

    // 4) Build UPDATE-only rows for existing fixtures (no NOT NULL problems)
    const updates = matches
      .filter(m => existingSet.has(String(m.id)))
      .map(m => ({
        provider_id: String(m.id),
        status: m.status,
        goals_home: m.score?.fullTime?.home ?? null,
        goals_away: m.score?.fullTime?.away ?? null,
        is_postponed: m.status === 'POSTPONED'
      }));

    // 5) Build FULL rows for brand-new fixtures (use mapper so all required cols set)
    const toInsert = matches.filter(m => !existingSet.has(String(m.id)));
    const inserts = toInsert.length
      ? mapToFixtureRows(toInsert as any, defaultLeagueId)
      : [];

    // 6) Write to DB
    let updated = 0, inserted = 0;

    if (updates.length) {
      const { error: uerr } = await supabaseAdmin
        .from('fixtures')
        .upsert(updates, { onConflict: 'provider_id' }); // updates only
      if (uerr) throw uerr;
      updated = updates.length;
    }

    if (inserts.length) {
      const { error: ierr } = await supabaseAdmin
        .from('fixtures')
        .upsert(inserts, { onConflict: 'provider_id,league_id' }); // full rows
      if (ierr) throw ierr;
      inserted = inserts.length;
    }

    return NextResponse.json({ ok: true, updated, inserted });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 });
  }
}
