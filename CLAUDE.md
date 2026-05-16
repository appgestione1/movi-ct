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
  App.jsx              # Root + MetroApp + BusApp
  App.css              # Tutti gli stili
  components/
    Landing.jsx         # Home "Movì CT" con logo ●—◎
    Onboarding.jsx      # Selezione percorso metro (2 step)
    TrainCard.jsx       # Card treno: countdown flip + tempo percorrenza
    MetroMapVertical.jsx # Barra SVG stazioni (88px, sticky, lato destro)
    BusPlanner.jsx      # Ricerca bus: origine → destinazione
    BusView.jsx         # Vista partenze bus in tempo reale
  data/
    schedule.js         # Stazioni FCE + orari generati + STATION_TIMES
  utils/
    calculator.js       # getNextTrains (metro)
    busPlanner.js       # findJourneys + findTransferJourneys (1 e 2 cambi)
    busCalculator.js    # fetchRouteData con cache in memoria
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

| Provider | Stato | GBFS Catania |
|---|---|---|
| **Dott** | ✅ Live | `https://gbfs.api.ridedott.com/public/v2/catania/free_bike_status.json` |
| **Lime** | 🔗 Link app | Nessun GBFS pubblico per CT (solo Bari in Italia) |
| Bird, Tier, Voi, Bolt | 🔜 Presto | `gbfsUrl: null, comingSoon: true` |

- Mappa Leaflet dark (CartoDB tiles)
- Fetch ogni 60 s, CORS supportato da Dott
- Pulsante locate (centra sulla posizione utente), contatore "N a 500 m"
- Popup su ogni marker: nome provider + stato batteria
- Per aggiungere un nuovo provider: aggiungi oggetto in `scooterProviders.js` con `gbfsUrl` e `comingSoon: false`

## Fine sessione
Aggiorna questo file con le modifiche significative e committa.
