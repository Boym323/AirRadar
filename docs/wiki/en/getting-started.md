# Getting started

Requirements: Node.js `>=22.18.0` and npm `>=10`.

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run dev
```

Open <http://localhost:3000>. With an empty `READSB_BASE_URL`, AirRadar runs
in demo mode with sample traffic. PostgreSQL is optional for local demo mode.
For a real receiver, set `READSB_BASE_URL` to the `readsb` web root and set
`RECEIVER_LAT` and `RECEIVER_LON`.
