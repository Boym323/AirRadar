# Etapa E — Truth & Accuracy Intelligence V1

Etapa E rozvíjí již existující prospektivní validaci, Airport Live Board a Flight Story. Nemění predikční algoritmy, pollery ani automatické povolování PUBLIC.

## E1 — Nezávislá skutečnost
Používá již načtenou omezenou 30denní kolekci a potvrzenou terminální událost LANDING. Na jeden lifecycleKey a schopnost se vybere nejstarší neměnná predikce. Neznámý výsledek se nikdy nevyhodnotí jako chyba. Neúplná kolekce má vlastní stav.

## E2–E3 — Letiště a fáze letu
Výsledky ETA a konce dráhy se seskupují podle cílového ICAO a fáze letu. K měření je nutných alespoň 10 nezávisle ověřených letů. Omezujeme výstup na 12 letištních a 8 fázových skupin. Kompletní zachycení go-around a holdingu nelze prokázat bez nezávislého registru událostí; recall proto nevykazujeme.

## E4 — Empirická confidence
LOW, MEDIUM a HIGH se retrospektivně porovnávají s potvrzenou skutečností. Alespoň 20 letů na skupinu. Úspěch znamená ETA v intervalu pěti minut nebo přesnou shodu konce dráhy. Nejde o certifikovanou pravděpodobnost ani samočinné přenastavení prahů.

## E5 — Flight Story
Pouze přihlášený administrátor může na vyžádání načíst historické predikce konkrétního letu. API nejprve ověří oprávnění a teprve pak přistoupí k DB, s limity 65 prospektivních řádků a 33 přistání včetně kontrolního řádku. Skóruje pouze shodu flight ID, ICAO a lifecycle v šesti hodinách po predikci. Nepotvrzené události zůstávají UNSCORABLE. Odpověď je private/no-store.

## E6 — Diagnostika kvality
Stávající autentizované /system a readiness API ukazují SOURCE_UNAVAILABLE, COLLECTION_INCOMPLETE, INSUFFICIENT_TRUTH, REVIEW_QUALITY nebo MONITOR. Prahy slouží pouze jako doporučení. Nemění žádnou PUBLIC/SHADOW politiku ani přidružené validační brány. Nepřidává se migrace, další sběrač nebo periodické dotazy. Pro dokončení je nutné zelené PR CI, kompletní release validace a potvrzené nasazení. Zelené CI samo o sobě nedokazuje provozní přesnost.
