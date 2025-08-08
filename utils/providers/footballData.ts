// utils/providers/footballData.ts
export type FDMMatch = {
  id: number;
  utcDate: string;              // "2025-08-09T14:00:00Z"
  status: string;               // SCHEDULED | LIVE | FINISHED | POSTPONED
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: { fullTime: { home: number | null; away: number | null } };
  matchday: number;             // gameweek
};

export async function fetchPLMatchesFD(season: string) {
  // Example: ?season=2025 (adjust to what your provider expects)
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
  return (data.matches || []) as FDMMatch[];
}
