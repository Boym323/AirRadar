# Trajectory Conformance V1

Trajectory Conformance V1 klasifikuje, jak se pozorované vybrané letadlo
pohybuje vůči rekonstruovanému koridoru filed route. Jde o odvozenou
produktovou vrstvu nad Route Intelligence V2 a Route Corridor Intelligence V1,
nikoli o novou autoritu trasy.

## Runtime hranice

Funkce běží pouze pro právě vybrané letadlo v existujícím radar klientovi.
Používá již vytvořený route a corridor snapshot a drží jeden omezený in-memory
tracker. Nepřidává:

- další EventSource;
- polling timer;
- upstream provider;
- databázovou tabulku ani zápis;
- persistence Flight Intelligence eventů.

Tracker se resetuje při změně vybraného letadla nebo identity filed route.

## Stavy

- `ROUTE_UNKNOWN`: filed/rekonstruovaná trasa neexistuje.
- `ROUTE_UNCERTAIN`: route coverage nebo dynamic matching nestačí.
- `ON_ROUTE`: Route Corridor je stabilně na trase.
- `OFFSET`: je viditelná nepotvrzená odchylka od trasy.
- `DEVIATING`: Route Corridor již potvrdil persistentní cross-track odchylku.
- `REJOINING`: letadlo po `DEVIATING` znovu vstoupilo do koridoru, ale
  potvrzení návratu ještě probíhá.
- `PROBABLE_DIRECT`: po významném forward skipu byl znovu zachycen pozdější
  route element a existuje dost předchozí deviation/offset evidence.

## Potvrzení návratu

Jedno on-route pozorování po odchylce nepřepne stav rovnou do `ON_ROUTE`.
Návrat vyžaduje dvě různá on-route pozorování během alespoň pěti sekund.
Opětovná odchylka recovery zruší.

## Odvození probable direct

Samotný skok v pořadí route elementů nikdy nestačí.

Po potvrzeném `DEVIATING` kandidát vyžaduje:

- znovuzachycení ve stavu koridoru `ON_ROUTE`;
- alespoň dva přeskočené vyřešené en-route elementy;
- alespoň 10 NM plně vyřešené přeskočené route geometrie.

Z pouhého stavu `OFFSET` je podmínka přísnější: alespoň tři přeskočené
vyřešené en-route elementy a 20 NM.

Do skip evidence se započítávají pouze en-route/connector elementy
`PUBLISHED_ATS`, `FILED_DCT` a `FILED_ROUTE`. SID/STAR procedure legs se
nezapočítávají. Chybějící geometrie fail-closed zabrání odhadu vzdálenosti.

Potvrzený probable direct zůstává při on-route pohybu zobrazen 30 sekund, aby
byl přechod v UI viditelný. Inference nese předchozí element, znovu zachycený
element, ID přeskočených elementů, vyřešenou přeskočenou vzdálenost, confidence
a nejvhodnější dostupný rejoin label.

## Coverage a confidence

Reconstruction coverage pod 50 % nebo nedostupná dynamic-route precision vede
do `ROUTE_UNCERTAIN`. Klasifikátor netvrdí conformance přes mezeru v geometrii.

Confidence vychází z reconstruction coverage, Route Corridor confidence a
evidence probable direct. Probable direct po potvrzeném deviation může získat
HIGH confidence pouze při alespoň třech přeskočených elementech a alespoň
80% reconstruction coverage. Direct odvozený z pouhého OFFSET zůstává MEDIUM.

## Shadow diagnostika

Selected-aircraft tracker udržuje nepersistentní countery observation,
deviation transition, rejoin candidate/confirmation, direct candidate,
probable direct, rejected jump candidate a route-uncertain observation. Ve V1
se tyto countery nezapisují do Flight Intelligence ani PostgreSQL.

## Bezpečnostní hranice

Trajectory Conformance je informativní receiver-derived intelligence.
`PROBABLE_DIRECT` není důkaz ATC clearance ani pokynu řídícího.
`DEVIATING` není certifikované navigační varování, separation warning ani
bezpečnostní hodnocení.
