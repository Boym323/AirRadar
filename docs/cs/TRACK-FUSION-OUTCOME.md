# Track Fusion Outcome Validation V1

Track Fusion Outcome Validation V1 měří, zda shadow fused stav skutečně lépe
předpovídá následující pozorovanou LOCAL receiver position než současný
canonical stav.

Je oddělený od Track Fusion Readiness V1. Readiness měří interní kvalitu a
konzistenci fusion enginu. Outcome Validation měří prospektivní net benefit
proti pozdější receiver truth.

## Prospektivní kontrakt

Když Track Fusion Shadow vytvoří nový způsobilý track, validator zachytí dva
nezávislé baseline stavy:

- současný canonical local/network merge;
- současný fused shadow stav.

Oba baseline musí mít observed position a použitelné groundspeed + track.
Estimated nebo LOW-confidence fused position, speed či track jsou vyloučené.

Pro každý baseline vzniknou tři pending prospektivní sample:

- +5 sekund;
- +15 sekund;
- +30 sekund.

V okamžiku capture ještě výsledek není znám.

Jakmile přijde pozdější LOCAL receiver observation v cílovém čase nebo těsně po
něm, použije se jako truth. Canonical i fused baseline se nezávisle propagují
na skutečný truth timestamp stejnou deterministickou constant-velocity
geometrií. Position error se měří v NM. Pokud mají obě strany i altitude state,
zaznamenává se altitude error ve ft.

Porovnání je tedy symetrické: stejná budoucí LOCAL truth, stejný evaluation
timestamp a stejný propagation model.

## Winner semantics

Sample je:

- `FUSED`, pokud fused position error porazí canonical o více než 0,05 NM;
- `CANONICAL`, pokud canonical porazí fused o více než 0,05 NM;
- `TIE` uvnitř této tolerance.

Report ukazuje:

- počty FUSED / CANONICAL / TIE;
- mean position error obou větví;
- průměrné fused improvement v NM;
- net win margin z decisive samples;
- volitelně mean altitude error;
- samostatné 5/15/30s slices;
- steady LOCAL, steady NETWORK a oba směry handoveru.

Source transition obchází běžný desetisekundový baseline throttle, takže
handover sample nezmizí jen proto, že těsně před ním vznikl jiný baseline.

## Truth požadavky

Truth je záměrně přísná:

- přijímá se pouze pozdější LOCAL receiver aircraft row;
- musí mít použitelnou geografickou position;
- position observation timestamp musí být v cílovém horizontu nebo po něm;
- musí dorazit v pětisekundovém grace window.

Pokud pozdější LOCAL truth nepřijde, pending sample expiruje. Expiry se počítá
ve stejném rolling window jako úspěšné outcomes, aby topologie s nedostatečnou
truth dostupností nemohla vytvořit falešný PASS.

## Bounded runtime

V1 je process-local a pouze v RAM:

- baseline interval 10 sekund na letadlo, kromě source handoverů;
- maximálně 6 000 pending samples;
- pending retention 45 sekund;
- outcome window 24 hodin;
- aggregate buckety po 5 minutách.

Validator nemá timer. Běží pouze za existujícím Track Fusion Shadow evaluation
pathem a dostává jen tracky, které byly v daném passu skutečně přepočítané.
Nespouští druhý all-aircraft fusion loop.

Neprovádí Prisma/DB přístup, history scan, čtení `FlightPosition`, upstream
request ani persistence write.

## Net-benefit decision

Samostatný outcome výsledek je `PASS`, `WAIT` nebo `FAIL`.

Kompletní evidence vyžaduje:

- alespoň 120 minut process-local evidence;
- alespoň 600 dokončených outcomes;
- alespoň 150 outcomes pro každý horizont 5/15/30 s;
- alespoň 30 handover outcomes.

Po splnění evidence gate vyžaduje PASS:

- net fused win margin alespoň 5 % z decisive outcomes;
- fused overall mean position error nesmí být horší než canonical;
- fused handover mean position error smí být nejvýše o 5 % horší než canonical;
- missing/expired LOCAL truth rate maximálně 35 %.

Thresholdy jsou záměrně konzervativní a verzované. Outcome PASS automaticky
nepovyšuje Track Fusion do public radaru ani canonical state. Je to pouze
evidence pro další graduation rozhodnutí.

## Admin surfaces

Autentizované no-store API:

`GET /api/admin/track-fusion/outcome`

Stejný souhrn je na `/system` vedle Track Fusion Shadow a Readiness.

## Kritické invariants

- Outcome validation nikdy nemění canonical aircraft state.
- Nikdy nezapisuje fused nebo projected stav do local receiver
  history/statistics.
- Budoucí LOCAL truth se čte jen z aktuální RAM a tato feature ji nepersistuje.
- Validation result nemůže změnit source affinity ani Track Fusion arbitration.
- Žádný výsledek se nesmí označit jako ground truth před skutečným příchodem
  budoucí observation.
