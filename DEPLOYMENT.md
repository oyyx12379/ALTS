# Public Deployment

This project is configured for a single-origin production deployment:

- Frontend static files are built into `client/dist`.
- The Express server serves `client/dist` when it exists.
- API routes stay under `/api`.
- Socket.IO stays under `/socket.io`.
- Cloudflare Tunnel only needs to expose `http://localhost:3001`.

## Build

```powershell
cd C:\Users\OUYANG\Desktop\WIT\client
npm.cmd run build

cd C:\Users\OUYANG\Desktop\WIT\server
npm.cmd run build
```

## Production Environment

Create production environment variables from `deploy/production.env.example`.

Required values:

- `NODE_ENV=production`
- `PORT=3001`
- `PUBLIC_ORIGIN=https://your-domain.example`
- `JWT_SECRET` must be changed before public exposure.
- `CLIENT_DIST_PATH=../client/dist`

## Start The Site

From `server`:

```powershell
$env:NODE_ENV="production"
$env:PORT="3001"
$env:PUBLIC_ORIGIN="https://your-domain.example"
$env:JWT_SECRET="<long-random-secret>"
$env:CLIENT_DIST_PATH="../client/dist"
npm.cmd run start:prod
```

Then open `http://localhost:3001` locally to verify the production build.

Or use the helper script from the repo root:

```powershell
.\deploy\start-production.ps1 -Port 3001 -PublicOrigin "https://your-domain.example" -JwtSecret "<long-random-secret>"
```

For a temporary tunnel URL that is not known ahead of time, omit `-PublicOrigin`; the script will set `CORS_ORIGINS=*` for that process.

## Cloudflare Tunnel

Install and authenticate `cloudflared`, then create a named tunnel and route a hostname to it.

Use `deploy/cloudflared-config.example.yml` as the template:

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: C:\Users\<YOU>\.cloudflared\<YOUR_TUNNEL_ID>.json

ingress:
  - hostname: <YOUR_PUBLIC_HOSTNAME>
    service: http://localhost:3001
  - service: http_status:404
```

Run:

```powershell
cloudflared tunnel run <YOUR_TUNNEL_NAME>
```

With the bundled portable binary:

```powershell
.\deploy\run-named-tunnel.ps1 -TunnelName "<YOUR_TUNNEL_NAME>"
```

## Temporary Quick Tunnel

For a fast public test without a custom domain:

```powershell
.\deploy\start-production.ps1 -Port 3001
```

Open another terminal:

```powershell
.\deploy\start-quick-tunnel.ps1 -Url "http://localhost:3001"
```

`cloudflared` will print a temporary `https://*.trycloudflare.com` URL. This is suitable for short testing only; use a named tunnel and a real hostname for regular play.

For long-running deployment, install the tunnel as a Windows service after verifying the site works.
