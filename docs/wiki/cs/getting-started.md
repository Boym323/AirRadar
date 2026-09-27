# Začínáme

Požadavky: Node.js `>=22.18.0` a npm `>=10`.

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run dev
```

Otevřete <http://localhost:3000>. Pokud je `READSB_BASE_URL` prázdná, AirRadar
běží v demo režimu s ukázkovým provozem. PostgreSQL je pro lokální demo volitelný.
Pro skutečný přijímač nastavte `READSB_BASE_URL`, `RECEIVER_LAT` a `RECEIVER_LON`.
