// app/api/cron/refresh/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/server/supabaseAdmin';

type FDTeam = { name: string };
type FDScore = { fullTime?: { home: number | null; away: number | null } };
type FDMatch = {
  id: number;
  utcDate: string;            // "2025-08-09T14:00:00Z"
  status?: string;            // SCHEDULED | LIVE | FINISHED | POSTPONED
  matchday?: number;          // gameweek
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score?: FDScore;
};

function toGroupLabel(utcDate: string): 'EARLY' | 'SAT_1500' | 'OTHER' {
  const dt = new Date(utcDate);
  const day = dt.getUTCDay();    // 6 = Saturday
  const h = dt.getUTCHours();
  const m = dt.getUTCMinutes();
  if (day === 6 && (h === 14 || h === 15)) return 'SAT_1500';
  if (h < 11 || (h === 11 && m <= 30)) return 'EARLY';
  return 'OTHER';
}

async function fetchPLMatches(season: string): Promise<FDMatch[]> {
  const url = `https://api.football-data.org/v4/competitions/PL/matches?season=${encodeURIComponent(season)}`;
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_API_KEY! },
    cache: 'no-store'
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`FD fetch failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.matches || []) as FDMatch[];
}

export async function GET() {
  try {
    // 1) Get latest league row (id + season)
    const { data: leagues, error: lerr } = await supabaseAdmin
      .from('leagues')
      .select('id, season')
      .order('created_at', { ascending: false })
      .limit(1);
    if (lerr || !leagues?.length) throw lerr || new Error('no leagues');

    const leagueId = String(leagues[0].id);
    const season = leagues[0].season.includes('/')
      ? `20${leagues[0].season.split('/')[0]}`
      : leagues[0].season;

    // 2) Fetch all matches
    const matches = await fetchPLMatches(season);

    // 3) Build FULL rows for upsert (fill every NOT-NULL field)
    const rows = matches.map((m) => {
      const kickoff = m.utcDate;                               // required
      const gameweek = Number.isFinite(m.matchday as any) 
        ? Number(m.matchday) 
        : 0;                                                   // safe fallback (NOT NULL)
      const status = m.status ?? 'SCHEDULED';

      return {
        provider_id: String(m.id),
        league_id: leagueId,                                   // NOT NULL
        gameweek_id: gameweek,                                 // NOT NULL
        home_team: m.homeTeam?.name || 'TBD',                  // NOT NULL
        away_team: m.awayTeam?.name || 'TBD',                  // NOT NULL
        kickoff_at: kickoff,                                   // NOT NULL (timestamptz)
        status,
        goals_home: m.score?.fullTime?.home ?? null,
        goals_away: m.score?.fullTime?.away ?? null,
        is_postponed: status === 'POSTPONED',
        moved_to_gameweek_id: null,
        group_label: toGroupLabel(kickoff)
      };
    });

    // 4) Upsert using the (provider_id, league_id) unique constraint
    const { error } = await supabaseAdmin
      .from('fixtures')
      .upsert(rows, { onConflict: 'provider_id,league_id' });

    if (error) throw error;

    return NextResponse.json({ ok: true, upserted: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 });
  }
}
