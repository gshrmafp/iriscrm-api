import { env } from '../../config/env';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// A small, dependency-free HTML status page for GET / — purely cosmetic
// (the real health check clients should hit is /health), so it can render
// with no JS under this app's strict CSP (script-src 'self' only).
export function renderStatusPage(): string {
  const uptime = formatUptime(process.uptime());
  const startedAt = new Date(Date.now() - process.uptime() * 1000).toLocaleString();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>IRIS CRM API</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    background: radial-gradient(circle at 20% 20%, #14213d 0%, #0a0e17 55%, #060810 100%);
    color: #e7ecf5;
    padding: 2rem;
  }
  .card {
    width: 100%;
    max-width: 640px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 2.5rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(12px);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.75rem;
  }
  .brand .logo {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: linear-gradient(135deg, #3b82f6, #60a5fa);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1.1rem;
    box-shadow: 0 0 24px rgba(59, 130, 246, 0.55);
  }
  .brand h1 {
    margin: 0;
    font-size: 1.35rem;
    letter-spacing: 0.02em;
  }
  .brand p {
    margin: 0.1rem 0 0;
    font-size: 0.8rem;
    color: #93a2ba;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    background: rgba(52, 211, 153, 0.12);
    border: 1px solid rgba(52, 211, 153, 0.35);
    color: #34d399;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 1.75rem;
  }
  .status .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #34d399;
    box-shadow: 0 0 10px #34d399;
    animation: pulse 1.8s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.55; transform: scale(0.8); }
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .stat {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    padding: 1rem 1.1rem;
  }
  .stat .label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #7c8aa5;
    margin-bottom: 0.35rem;
  }
  .stat .value {
    font-size: 1.05rem;
    font-weight: 600;
    color: #f1f5fb;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .links a {
    flex: 1;
    min-width: 150px;
    text-align: center;
    text-decoration: none;
    color: #dbe6fb;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.7rem 1rem;
    border-radius: 12px;
    font-size: 0.88rem;
    font-weight: 500;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .links a:hover {
    background: rgba(59, 130, 246, 0.16);
    border-color: rgba(59, 130, 246, 0.45);
  }
  .footer {
    margin-top: 1.75rem;
    font-size: 0.75rem;
    color: #5f6c85;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="logo">IR</div>
      <div>
        <h1>IRIS CRM Platform</h1>
        <p>Backend API</p>
      </div>
    </div>

    <div class="status"><span class="dot"></span> Running</div>

    <div class="grid">
      <div class="stat">
        <div class="label">Environment</div>
        <div class="value">${env.NODE_ENV}</div>
      </div>
      <div class="stat">
        <div class="label">Port</div>
        <div class="value">${env.PORT}</div>
      </div>
      <div class="stat">
        <div class="label">Uptime</div>
        <div class="value">${uptime}</div>
      </div>
      <div class="stat">
        <div class="label">Started</div>
        <div class="value">${startedAt}</div>
      </div>
    </div>

    <div class="links">
      <a href="/health">Health check</a>
      <a href="/api-docs">API docs</a>
      <a href="/api-docs.json">OpenAPI JSON</a>
    </div>

    <div class="footer">/api/v1 &middot; Express + PostgreSQL + Prisma</div>
  </div>
</body>
</html>`;
}
