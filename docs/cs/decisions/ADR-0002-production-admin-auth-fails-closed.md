# ADR-0002 — Produkční administrace se uzavírá při chybě

## Kontext

Administrátorské a provozní diagnostické routy AirRadaru používají
`isWatchlistSessionValid()`. Read-only kontrola veřejné produkce 18. 10. 2026
potvrdila, že veřejný server vracel `configured: false, authenticated: true` a
bez session cookie zpřístupňoval administrativní diagnostiku.

## Rozhodnutí

Produkční Node proces vždy vyžaduje podepsanou watchlist session a
`WATCHLIST_ADMIN_TOKEN`, bez ohledu na starou hodnotu opt-out přepínače. Lokální
a demo prostředí mohou mít `AIRRADAR_ADMIN_AUTH_ENABLED=false`, pokud nejsou
vystavena internetu.

Odstraňuje se nepoužívaný adaptér `lib/server/adsblol-failover-provider.ts`.
Aktivním vlastníkem je `lib/server/network-failover-provider.ts`; statické
hledání v repozitáři nenašlo runtime, testovací, routovací, workflow ani
dynamický import starého adaptéru.

## Důsledky

Před vydáním změny musí produkce dostat secret `WATCHLIST_ADMIN_TOKEN`. Do té
doby admin routy vrátí chybu autentizace/konfigurace místo úniku diagnostiky.
Veřejný radar, SSE, historie a receiver nejsou na admin autentizaci závislé.

Odstraněný adaptér zůstává obnovitelný z Git historie. Neodstraňuje se žádný
provider lane, síťový zdroj, databázové schéma ani veřejná route.

## Důkazy

- Read-only produkční sondy `/api/watchlist/session` a admin GET rout z 18.
  října 2026.
- `lib/server/providers.ts` přímo vytváří `NetworkFailoverProvider`.
- Statické hledání v repozitáři našlo `adsblol-failover-provider` pouze v cestě
  odstraňovaného souboru.
