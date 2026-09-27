# Konfigurace

Pro lokální práci zkopírujte `.env.example` do `.env`. Nikdy necommitujte
přihlašovací údaje, databázová URL ani API klíče. Základní nastavení přijímače:

```dotenv
READSB_BASE_URL=http://192.168.1.50:8080
RECEIVER_LAT=50.0755
RECEIVER_LON=14.4378
```

Volitelné providery jako ADSB.lol a OGN jsou ve výchozím nastavení vypnuté a
musí být explicitně povoleny. Přesné souřadnice přijímače nezveřejňujte. Viz
[zdroje dat](../../DATA-SOURCES.md).
