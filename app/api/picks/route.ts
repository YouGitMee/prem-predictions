// app/api/picks/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/server/supabaseAdmin';

function lockTime(kickoffISO: string) {
  return new Date(new Date(kickoffISO).getTime() - 120 * 1000); // -120s
}

async function isGameweekGloballyLocked(leagueId: string, gameweekId: number, now: Date) {
  // Find the SAT_1500 block (if any) for this gameweek
  const { data, error } = await supabaseAdmin
    .from('fixtures')
    .select('kickoff_at')
    .eq('league_id', leagueId)
    .eq('gameweek_id', gameweekId)
    .eq('group_label', 'SAT_1500')
    .order('kickoff_at', { ascending: true })
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) return false;

  const blockKickoff = new Date(data[0].kickoff_at);
  const blockLock = new Date(blockKickoff.getTime() - 120 * 1000);
  return now >= blockLock;
}

export async function POST(req: NextRequest) {
  try {
    const { fixtureId, userId, goals_home_pred, goals_away_pred } = await req.json();

    if (!fixtureId || !userId || goals_home_pred == null || goals_away_pred == null) {
      return NextResponse.json({ error: 'fixtureId, userId, goals_home_pred, goals_away_pred are required' }, { status: 400 });
    }

    // Load the target fixture
    const { data: fx, error: ferr } = await supabaseAdmin
      .from('fixtures')
      .select('id, league_id, gameweek_id, kickoff_at, group_label')
      .eq('id', fixtureId)
      .maybeSingle();

    if (ferr) throw ferr;
    if (!fx) return NextResponse.json({ error: 'fixture not found' }, { status: 404 });

    const now = new Date();

    // Per-fixture lock (120s before KO)
    const fixtureLocked = now >= lockTime(fx.kickoff_at as unknown as string);

    // Global 3pm lock for the gameweek (if SAT_1500 block has locked)
    const gwLocked = await isGameweekGloballyLocked(String(fx.league_id), Number(fx.gameweek_id), now);

    if (fixtureLocked || gwLocked) {
      return NextResponse.json({ error: 'locked', fixtureLocked, gwLocked }, { status: 403 });
    }

    // Upsert the pick (unique on fixture_id + user_id)
    const { error: uerr } = await supabaseAdmin
      .from('picks')
      .upsert({
        fixture_id: fixtureId,
        user_id: userId,
        goals_home_pred: Number(goals_home_pred),
        goals_away_pred: Number(goals_away_pred),
        last_edited_at: now.toISOString()
      }, { onConflict: 'fixture_id,user_id' });

    if (uerr) throw uerr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 });
  }
}
