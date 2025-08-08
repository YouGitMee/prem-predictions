// utils/fixturesMap.ts
import type { FDMMatch } from './providers/footballData';

export function toGroupLabel(utcDate: string): 'EARLY' | 'SAT_1500' | 'OTHER' {
  const dt = new Date(utcDate);       // UTC
  const day = dt.getUTCDay();         // 6 = Saturday
  const hour = dt.getUTCHours();
  const minute = dt.getUTCMinutes();
  // Heuristic: UK 3pm block ~ 14:00–15:00 UTC depending on BST/GMT
  if (day === 6 && (hour === 14 || hour === 15)) return 'SAT_1500';
  // Early kickoff heuristic: <= 11:30 UTC
  if (hour < 11 || (hour === 11 && minute <= 30)) return 'EARLY';
  return 'OTHER';
}

export function mapToFixtureRows(matches: FDMMatch[], leagueId: string) {
  return matches.map(m => ({
    provider_id: String(m.id),
    league_id: leagueId,
    gameweek_id: m.matchday,
    home_team: m.homeTeam.name,
    away_team: m.awayTeam.name,
    kickoff_at: m.utcDate,
    status: m.status,
    goals_home: m.score?.fullTime?.home ?? null,
    goals_away: m.score?.fullTime?.away ?? null,
    is_postponed: m.status === 'POSTPONED',
    moved_to_gameweek_id: null,
    group_label: toGroupLabel(m.utcDate)
  }));
}
