# AirRadar V6 — 3D letadla, letecká média a kontrola GPU

## Implementováno
- Vlastní **nízkopolygonové 3D modely**, nikoli oficiální CAD ani fotorealistické GLTF soubory. Různé tvary pro Airbus A318–A321/A20N/A21N, Boeing 737/737 MAX/777/787/747, A330/A350/A380, regionální tryskáče, lehká letadla a vrtulníky: objemný trup, profilovaná křídla, winglety, motory, okna, kokpit a ocasní plochy. Neznámý typ používá obecnou geometrii.
- 3D je volitelné a vykresluje nejvýše 12 letadel. Žádné externí stahování modelů, textur, nové databázové dotazy ani SSE.
- Letecká média používají oficiální YouTube-nocookie iframe konkrétního videa **až po kliknutí**. I živá vysílání fungují jen v případě, že autor povoluje vložení. Jiná URL, playlisty nebo kanály zůstávají jako externí odkazy.
- Pokud autor vložení blokuje nebo vyžaduje přehrání na YouTube, je stále dostupný původní odkaz. AirRadar nepřeposílá ani nevytěžuje streamy.
- Veřejná URL automaticky neznamená povolení streamu; zdroj a práva je nutné ověřit.

## Automatické kontroly
CI používá Chromium v desktopovém viewportu (1366 px) a mobilní **emulaci** (390 px). Kontroluje inicializaci WebGL2, 3D terén, vrstvu letadel, prezentační režim, výchozí nenačítání iframe a bezpečný adresář vloženého přehrávače; ukládá screenshoty a data o rendereru.

**Zelené CI není test na skutečném telefonu ani důkaz hardwarové akcelerace.** CI může používat SwiftShader.

## Ověření na fyzických zařízeních
1. Reálný desktopový Chrome s hardwarovou akcelerací:
   `AIRRADAR_URL=https://airradar.pomykal.cz node scripts/verify-v6-3d-device.mjs --require-hardware`
2. Reálný Android + Chrome přes USB debugging a `adb forward tcp:9222 localabstract:chrome_devtools_remote`. Spusťte:
   `AIRRADAR_DEVICE_CDP=http://127.0.0.1:9222 AIRRADAR_URL=https://airradar.pomykal.cz node scripts/verify-v6-3d-device.mjs --require-hardware`
   Ručně potvrďte, že je připojen skutečný telefon.
3. iPhone/iPad: použijte Safari Web Inspector na reálném zařízení; skript pro Chromium CDP **neověří Safari**. Zaznamenejte přepnutí 2D/3D, navigaci, výkon, tepelnou zátěž a snímky.
4. Prověřte desktop s dedikovanou i integrovanou GPU, levnější a výkonnější Android, iPhone/iPad. Otestujte 2D → 3D → 2D, zaměření letadla, uspání/obnovení a výpadek DEM. Radar musí zůstat funkční.
5. Uložte `artifacts/v6-gpu-device/report.json` a `3d-active.png`, údaje o zařízení a výsledek. p50/p95 snímků z testu a případné ztráty WebGL kontextu posuďte podle skutečného hardwaru. Skrytá identita GPU znamená, že automatický důkaz hardwaru není k dispozici.

Skript poskytuje měření 90 render událostí MapLibre a ověřuje návrat do 2D. Bez připojeného fyzického zařízení nelze tvrdit, že test prošel.

## Zásady zdrojů
- https://developers.google.com/youtube/player_parameters
- https://developers.google.com/youtube/terms/required-minimum-functionality
- https://support.google.com/youtube/answer/171780
- Jiná letištní videa nebo ATC audio nevkládat bez výslovného oprávnění poskytovatele a podporovaného rozhraní.
