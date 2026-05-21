# Movì CT — Contesto per Claude Code

App trasporti pubblici Catania: metro FCE + bus AMTS. React + Vite PWA, mobile-first.

## Avvio dev server
```bash
npm install          # prima volta
npx vite --host --port 5174   # http://192.168.1.86:5174 da mobile (adatta IP al dispositivo)
```

## Deploy
- Repo: `appgestione1/movi-ct` (GitHub)
- Hosting: Vercel — auto-deploy su push a `master`
- Build: `npm run build` → `dist/`

## Stack
- React + Vite (no TypeScript)
- Nessun backend, nessun Firebase — tutto client-side
- CSS glassmorphism dark theme in `src/App.css`
- PWA manifest in `public/manifest.json`

## Struttura principale
```
src/
  App.jsx              # Root + MetroApp + BusApp + LimeLive (mode: null|metro|bus|scooter)
  App.css              # Tutti gli stili (incl. .scooter-btn verde Lime #C8F135)
  components/
    Landing.jsx         # Home "Movì CT" con logo ●—◎ — 3 bottoni: Metro, Bus, Monopattini
    Onboarding.jsx      # Selezione percorso metro (2 step)
    TrainCard.jsx       # Card treno: countdown flip + tempo percorrenza
    MetroMapVertical.jsx # Barra SVG stazioni (88px, sticky, lato destro)
    BusPlanner.jsx      # Ricerca bus: origine → destinazione
    BusView.jsx         # Vista partenze bus in tempo reale
    LimeLive.jsx        # Mappa live scooter Lime (GBFS) con stats batteria e filtri
  data/
    schedule.js         # Stazioni FCE + orari generati + STATION_TIMES
  utils/
    calculator.js       # getNextTrains (metro)
    busPlanner.js       # findJourneys + findTransferJourneys (1 e 2 cambi)
    busCalculator.js    # fetchRouteData con cache in memoria
api/
  lime-gbfs.js          # Vercel Serverless Function — proxy CORS per Lime GBFS Catania
public/
  gtfs/
    stops_index.json    # 1322 fermate AMTS
    stop_routes.json    # stop_id → linee che passano
    routes/*.json       # 46 linee AMTS con orari
```

## Stazioni FCE — ordine CORRETTO (indice array)
```
0: Monte Po   1: Milo        2: Fontana    3: Nesima     4: San Nullo
5: Cibali     6: Borgo       7: Giuffrida  8: Italia     9: Galatea
10: Giovanni XXIII           11: Stesicoro
```
Mappa verticale: Stesicoro in CIMA, Monte Po in FONDO (funzione `fy()` in MetroMapVertical.jsx che inverte l'indice).

## Scelte di design confermate dall'utente
- **Direction labels TrainCard**: invertite per scelta — `'→ Monte Po'` quando direction='stesicoro', `'← Stesicoro'` quando direction='montePo'
- **Navigazione**: `showOnboarding` e `showPlanner` sempre `true` → dalla Landing si va sempre alla ricerca, mai alla vista salvata
- **Home button**: `⌂ Home` fisso in basso a sinistra (`position: fixed`) su tutte le pagine — nessuna scritta "← Indietro"
- **Tempo percorrenza**: calcolato da `STATION_TIMES`, mostrato in fondo alla TrainCard con separatore
- **Logo Landing**: div `.movi-logo` rosso solido, SVG inline `●—◎` (cerchio bianco + linea + cerchio blu `#4fc3f7`)
- **Colori direzioni**: rosso `#e63946` verso Stesicoro, blu `#4fc3f7` verso Monte Po

## Dati GTFS
I file in `public/gtfs/` sono generati da `scripts/processGtfs.cjs` a partire da `gtfs_amts.zip` (escluso da git). Non rigenerare a meno di aggiornamenti AMTS.

## Sezione Monopattini (`src/components/ScooterApp.jsx`)

Provider configurati in `src/data/scooterProviders.js`:

| Provider | Stato | Endpoint / note |
|---|---|---|
| **Dott** | ✅ Live diretto | `https://gbfs.api.ridedott.com/public/v2/catania/free_bike_status.json` — CORS aperto, fetch browser |
| **Lime** | ⚡ Via proxy | `/api/lime-gbfs?feed=free_bike_status` → `api/lime-gbfs.js` Vercel. Se 404, fallback mock 40 scooter |
| **Elérent** | 🔗 Via proxy | `/api/elerent-gbfs` → `api/elerent-gbfs.js` Vercel. Usa endpoint ex-Helbiz; ritorna vuoto se richiede auth |
| Bird, Tier, Voi, Bolt | 🔜 `comingSoon: true` | Pill visibili ma disabilitati |

- **Mappa**: Leaflet + CartoDB dark tiles — mappa stradale reale
- **Dettaglio**: appare SOLO al tap su un marker (nome via via Nominatim, batteria, autonomia, link sblocco)
- **Layout**: full-height flex, mappa occupa spazio residuo tra pills e bottom bar
- **Scooter selezionato**: icona ingrandita e evidenziata; tap su mappa deseleziona
- Refresh automatico ogni 60 s per provider attivi

## Sezione Pullman Sicilia (`src/components/IntercityBus.jsx`)

App-in-app per orari/biglietti dei pullman extraurbani e regionali.
Tre viste: Ricerca → Risultati → Dettaglio.

### Architettura dati

| File | Ruolo |
|---|---|
| `src/data/intercityNetwork.js` | Vettori, città, hub, connection (rete fissa) |
| `src/data/intercitySchedules.json` | Manifest orari (popolato da script + a mano) |
| `src/data/intercityDocs.json` | Manifest dei documenti ufficiali (PDF/pagine) |
| `src/utils/intercity.js` | Logica: ricerca, filtri calendario, deep-link |
| `public/intercity-docs/` | PDF locali serviti come asset statici da Vercel |

### Vettori coperti
SAIS Autolinee, SAIS Trasporti, Interbus, Etna Trasporti, Segesta, AST, FCE.

### Orari attualmente verificati in-app

| Tratta | Fonte | Corse |
|---|---|---|
| Catania ↔ Belpasso ↔ Nicolosi (FCE) | PDF FCE invernale scolastico 2025-2026 | 25 |
| Catania ↔ Rifugio Sapienza (AST) | Regione Siciliana — AST | 2 |
| Catania ↔ Acireale (AST linee 595 + 605) | Regione Siciliana — AST | 19 |
| Catania ↔ Siracusa (Interbus L159) | Regione Siciliana — Interbus | 19 |
| Catania ↔ Agrigento (SAIS Trasporti) | Regione Siciliana — SAIS Trasporti | 16 |
| Catania ↔ Caltanissetta (SAIS Trasporti) | Regione Siciliana — SAIS Trasporti | 22 |
| Leonforte ↔ Catania + Catania→Nicosia (Interbus L1568/L1631) | Regione Siciliana — Interbus | 4 |
| Aeroporto → Taormina (Interbus) | Regione Siciliana — Interbus | 17 |

**Tariffe:** nessuna tariffa trovata nei PDF Regione Siciliana (AST, SAIS Trasporti, Interbus).
La funzione `extractFareTable()` in `regione-sicilia.cjs` ha restituito `null` per tutti e tre.
Verificare direttamente sui siti dei vettori.

**Note parser Regione Siciliana:**
- `c-agrigento` e `c-caltanissetta`: aggiunto `saist` ai carriers in `intercityNetwork.js`
  (il PDF è SAIS Trasporti, non SAIS Autolinee).
- Routes estratte per c-acireale/c-belpasso-ast/c-nicolosi-ast contengono ancora
  header-as-stop (bug `isNameLine` poi fixato in `regione-sicilia.cjs`): riprocessare
  con `npm run refresh-intercity -- --only ast --force` per ripulire i `routes[]`.
- I duplicati nei tempi (es. 16:25 due volte in L159) riflettono corse feriale vs festivo/scolastico
  che nel PDF condividono la stessa ora — da raffinare con analisi delle intestazioni CORSE.

Lo schema (`schedule.from`, `schedule.to`, `feriale`,
`festivo`, `scolastico`, `orario_partenza`, `orario_arrivo`, `note`) è usato
dalla logica di filtro `getAvailableBuses` e dalla UI dettaglio.

### Aggiungere un documento ufficiale

```bash
# 1. PDF locale, generico per il vettore
npm run add-intercity-doc -- ./orari-ast.pdf \
  --carrier ast --title "Orario linea Acireale 2026" --type orari

# 2. Solo link ufficiale (niente file locale)
npm run add-intercity-doc -- \
  --url "https://www.example.it/orari.pdf" \
  --carrier sais --title "Tariffe 2026" --type tariffe

# 3. Specifico per una tratta + periodo di validità
npm run add-intercity-doc -- ./pdf-rifugio.pdf \
  --carrier ast --title "Linea Etna estate 2026" --type orari \
  --tratta c-rifugio --valid-from 2026-06-01 --valid-to 2026-09-30
```

Tipi validi: `orari | tariffe | brochure | avviso | info`.
Il file PDF viene copiato in `public/intercity-docs/` e servito come
`https://<deploy>/intercity-docs/<filename>`.

### Refresh automatico orari

```bash
npm run refresh-intercity                # tutti i vettori
npm run refresh-intercity -- --only fce  # solo FCE
npm run refresh-intercity -- --dry-run   # non scrive il manifest
```

Dipende da `pdftotext` (Poppler). GitHub Action `.github/workflows/refresh-intercity.yml`
gira ogni lunedì 04:00 UTC e committa il manifest aggiornato.
Gli schedules curati a mano vengono **preservati** dal merge se l'extractor automatico
non li ha ancora estratti.

### API SAIS Autolinee — LIVE attivo ✅ (`api/sais-live.js`)

Backend: `https://api.saisautolinee.it` (Albatross Gateway v8.2, SITRAP srl).

**Endpoint usato:** `POST /search/s/{from}/{to}/{d1}/{d2}` — ricerca corse per fascia
di date. `from`/`to` sono **nomi città** (`Catania`, `Palermo`, …), `d1`/`d2` date
`YYYY-MM-DD`. Body: `[{"fId":null,"extra":{},"subGroupId":0}]`.

**Nessun login necessario.** L'unica protezione è una firma `s` in header,
calcolata client-side → il proxy la rigenera ad ogni richiesta. Funziona in
modo permanente, senza token/cookie/account/env-var.

**Firma `s` (header obbligatorio):**
- `s: i="{cid}", t="{ts}", n="{nonce}", m="{mac}"`
- `cid` = UUID v4 casuale · `ts` = unix time (s) · `nonce` = `{16 byte hex}:{ts hex UPPER pad16}`
- `mac` = **HMAC-SHA256**(key, `"{METHOD}\n{fullUrl}\n{id=..&nonce=..&ts=..}"`)
  — i 3 param ordinati alfabeticamente e URL-encoded
- key = stringa UTF-8 `2F0294611E814D078293452B58C324DC`
  (offuscata nella funzione `Jt()` del bundle `booking.saisautolinee.it`)
- Altri header richiesti: `albatross-tenant: sais`, `frontend-version`, `iw`, `ih`, `sc: 1`

**Città coperte** (mappa in `SAIS_CITIES` dentro `api/sais-live.js`):
Catania, Palermo, Messina, Enna, Caltanissetta. Catania→X funziona sempre;
alcuni versi X→Catania no (es. Caltanissetta→Catania = 0 corse) → in quel caso
il proxy ritorna `not_configured` e il client mostra gli orari statici.

**Risposta `/search/s`:** array di gruppi soluzione; ogni gruppo ha `trips[]`,
`calculatedPrice`, `fullPrice`. Lo stesso viaggio compare più volte (fermate
diverse della città) → `parseSaisSearch()` deduplica per sequenza `tripId` e
mostra solo le corse dirette se esistono.

**SAIS Trasporti**: sistema separato (`biglietti.saistrasporti.it`, .NET) —
copre solo Agrigento. Non integrato.

### Limiti tecnici noti dei vettori

- **AST / SAIS Trasporti / Interbus** — Niente più scraping del sito commerciale del vettore.
  Gli orari ufficiali si scaricano dal portale **Regione Siciliana** (`pti.regione.sicilia.it`,
  sezione `PIR_OrariAutolinee`). Pipeline gestita da `scripts/extractors/regione-sicilia.cjs`
  (vedi sotto). I siti commerciali rimangono solo come CTA / fallback documentale.
- **SAIS / Etna / Segesta booking** — Booking dietro a JavaScript dinamico (Next.js / PHP).
  Nessun deep-link autocompile possibile senza headless browser (Playwright).
  Il CTA rimanda al portale + bottone "Copia tratta" per incollare nei loro form.
- **FCE** — PDF unico con tutte le autolinee, matrice multi-colonna complessa.
  Sezione Belpasso parsata; Randazzo (ovest) e Linguaglossa (est via A18) ancora da parsare.

### Pipeline orari dal portale Regione Sicilia

Fonte: `https://pti.regione.sicilia.it/.../PIR_OrariAutolinee/<vettore>/<file>.pdf`.
PDF strutturati uniformemente: ogni linea introdotta da `Orario Autolinea Extraurbana:
<ORIGINE> - <DESTINAZIONE> (cod. NNN)`, tabella `KM / FERMATA / orari per corsa`,
periodi `FERIALE` / `FESTIVO` / `ESTIVO` / `INVERNALE` / `SCOLASTICO`, talvolta tariffa
chilometrica in coda al PDF.

| File | Ruolo |
|---|---|
| `scripts/extractors/regione-sicilia.cjs` | Parser comune (download, hash, pdftotext, route block split, mapping fermate → cityId, generazione `schedules[]` + `routes[]`) |
| `scripts/refreshIntercity.cjs` | Driver: invoca `refreshRegione(agencyId, carrierId)` per AST, SAIS Trasporti, Interbus + FCE separato |
| `data/import-log.json` | Hash SHA1 + timestamp + statistiche per ogni PDF scaricato. Permette skip se il PDF non è cambiato |
| `data/manual/<agency>/` | Fallback locale: se il download fallisce (rete, geo-block) lo script usa il primo `*.pdf` qui dentro |
| `src/data/intercitySchedules.json` | Manifest: `{ connectionId: { meta, routes, schedules } }`. `routes[]` ha codice ministeriale + fermate con km |

Comandi:

```bash
npm run refresh-intercity                          # tutti i vettori
npm run refresh-intercity -- --only ast            # solo AST (Regione Sicilia)
npm run refresh-intercity -- --only saist          # solo SAIS Trasporti
npm run refresh-intercity -- --only interbus       # solo Interbus
npm run refresh-intercity -- --force               # ignora import-log, riprocessa
npm run refresh-intercity -- --dry-run             # non scrive il manifest
npm run refresh-intercity -- --input <pdf> --agency ast   # parsa un PDF locale (debug)
```

Dati extra estratti dal parser Regione e usati dall'app:
- **Tappe ufficiali con km** — sezione "🚏 Fermate ufficiali della linea" nel dettaglio tratta
- **Tariffe chilometriche** — sezione "💶 Tariffe ufficiali (Regione Sicilia)" se la tabella tariffa è presente nel PDF
- **Codice ministeriale linea** — mostrato accanto a ogni quadro orari

Il parser è "best-effort v1": il formato Regione è uniforme ma con piccole variazioni
per vettore. Quando una fermata non si mappa a una città di `CITIES` o una corsa è ambigua,
viene loggata (non produce dati errati). Iterando sul log si raffina il mapping
aggiungendo alias/città a `src/data/intercityNetwork.js`.

### Geo-block sviluppo da fuori IT

`pti.regione.sicilia.it` blocca traffico esterno all'Italia: l'estrazione automatica
funziona dal PC dell'utente (Catania) e dovrebbe funzionare dai runner GitHub Actions
(IP Microsoft variabili). Se la GitHub Action fallisce sul download, la sequenza è:

1. scaricare manualmente i PDF dal browser
2. metterli in `data/manual/{ast,sais,interbus}/`
3. committare e ri-eseguire `npm run refresh-intercity`

## Fine sessione
Aggiorna questo file con le modifiche significative e committa.
