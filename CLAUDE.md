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

## Fine sessione
Aggiorna questo file con le modifiche significative e committa.
