export default function Home() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "(not set)";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "✔ set" : "✖ missing";

  return (
    <main style={{ padding: 24 }}>
      <h1>Prem Predictions – Setup Check</h1>
      <p>Vercel build OK. App Router running.</p>
      <hr />
      <p><strong>SUPABASE_URL:</strong> {url}</p>
      <p><strong>ANON_KEY:</strong> {anon}</p>
      <p>If either shows missing, add them in Vercel → Project → Settings → Environment Variables, then Redeploy.</p>
    </main>
  );
}
