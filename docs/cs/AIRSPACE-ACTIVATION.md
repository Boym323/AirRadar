# Výzkum dynamické aktivace vzdušného prostoru

Stav: pouze návrh pro v1.2. Importovaná geometrie eAIP zůstává kontextem
**publikovaného vzdušného prostoru**. Nedokazuje, že je sektor právě aktivní,
proto runtime hodnota aktivace zůstává `UNKNOWN`, dokud není nakonfigurován
autoritativní strojově čitelný provozní feed.

## Prověřené zdroje

- Oficiální web [AIM ŘLP ČR](https://aim.rlp.cz/) je národním zdrojem českého
  AIP, NOTAM a informací o využití vzdušného prostoru. Jeho [postup ENR
  1.1.9.7](https://aim.rlp.cz/eaip/html/eAIP/LK-ENR-1.1-cz-CZ.html) uvádí,
  že AUP se vydává pro následující provozní den a změny v tentýž den se
  publikují přes UUP; jako webové publikační místo uvádí také `aup.rlp.cz`.
- [Nápověda portálu EUROCONTROL EAUP/UUP](https://www.nm.eurocontrol.int/HELP/EAUP.html)
  popisuje evropské AUP, aktualizované plány a jejich zobrazení platnosti.
- [Služba EUROCONTROL pro správu dat vzdušného prostoru](https://www.eurocontrol.int/service/airspace-data-management)
  a [NM B2B služba](https://www.eurocontrol.int/service/network-manager-business-business-b2b-web-services)
  popisují autoritativní směr integrace: strukturovaná data vzdušného prostoru,
  implementace EAUP/EUUP a NOTAM přes chráněné provozní služby.

## Doporučení

Jako první provozní zdroj pro české dočasné prostory použijte oficiální české
publikace AUP/UUP, s EUROCONTROL NM B2B/Airspace Availability jako evropským
fallbackem nebo budoucím multi-country zdrojem. NOTAM používejte jako
doplňující provozní informaci, nikoli jako náhradu strukturovaného feedu
identity/platnosti vzdušného prostoru.

Integrace má být samostatně konfigurovaný server-side provider, nikoli runtime
HTML scraper:

1. získat zdokumentovaný strojově čitelný feed a jeho přístupové/licenční podmínky;
2. spojit záznamy s importovanou AIP geometrií podle stabilního identifikátoru
   vzdušného prostoru a intervalu platnosti;
3. validovat čas, vertikální limity, geometrii a sémantiku aktivace;
4. zachovat source reference, effective/valid times a last verification;
5. publikovat `ACTIVE` nebo `INACTIVE` pouze z tohoto validovaného
   provozního záznamu, jinak publikovat `UNKNOWN`.

Veřejné stránky aktuálně neposkytují zdokumentovaný API kontrakt, autentizační
metodu ani stabilní mapování identifikátorů vhodné pro bezpečnou release
integraci. EUROCONTROL NM B2B vyžaduje profil provozního stakeholdera a jeho
NM pohled není totožný s oficiálně publikovaným AIP. Proto v1.2 končí u
návrhu: není zapnut žádný scraping, nová polling větev ani datasource a žádný
publikovaný polygon se nepovyšuje na `ACTIVE`.
