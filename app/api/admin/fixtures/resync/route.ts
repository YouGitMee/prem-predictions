// app/api/admin/fixtures/resync/route.ts
export const runtime = 'nodejs'; // ensure Node, not edge

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/server/supabaseAdmin';
import { fetchPLMatchesFD } from '@/utils/providers/footballData';
import { mapToFixtureRows } from '@/utils/fixturesMap';

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data || data.role !== 'admin') throw new Error('Forbidden');
}

export async function POST(req: NextRequest) {
  try {
    const { season, leagueId, userId } = await req.json();
    if (!season || !leagueId || !userId) {
      return NextResponse.json({ error: 'season, leagueId, userId required' }, { status: 400 });
    }
    await assertAdmin(userId);

    const matches = await fetchPLMatchesFD(season);
    const rows = mapToFixtureRows(matches, leagueId);

    const { error } = await supabaseAdmin
      .from('fixtures')
      .upsert(rows, { onConflict: 'provider_id,league_id' });
    if (error) throw error;

    return NextResponse.json({ ok: true, upserted: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 });
  }
}
