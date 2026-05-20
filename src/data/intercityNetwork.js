// ─────────────────────────────────────────────────────────────────────────
// Movì CT — Rete pullman extraurbani / interurbani / regionali su Catania
// ─────────────────────────────────────────────────────────────────────────
// Dato curato statico. I vettori siciliani non pubblicano feed orari aperti
// né API documentate: Movì CT centralizza la mappa dei collegamenti (chi va
// dove, da quale hub, con quali note logistiche) e — quando disponibile da
// fonte ufficiale — gli orari reali con provenance esplicita.
// Nessun orario è inventato. Lo schema è predisposto per ospitare orari reali
// (vedi campo `schedules`/`schedulesMeta` e la funzione getAvailableBuses in
// utils/intercity.js).
//
// Schema di una corsa, dentro `connection.schedules`:
//   {
//     carrierId:       string,    // vettore che effettua la corsa
//     from:            cityId,    // dove parte ESATTAMENTE
//     to:              cityId,    // dove arriva ESATTAMENTE
//     orario_partenza: 'HH:MM',
//     orario_arrivo:   'HH:MM' | null,   // null se non noto con certezza
//     feriale:         boolean,   // attiva Lun-Sab
//     festivo:         boolean,   // attiva Domenica e festività
//     scolastico:      boolean,   // attiva solo nel periodo scolastico
//     note?:           string,    // eccezioni o annotazioni ("sospesa sabato")
//   }
// La stessa corsa fisica può generare più schedule, una per ogni coppia
// fermata-fermata utile (es. Bus Catania→Belpasso→Nicolosi genera 3 entry).
//
// Schema della provenance, dentro `connection.schedulesMeta` (opzionale):
//   {
//     source:        string,    // nome fonte leggibile (es. 'FCE — circumetnea.it')
//     sourceUrl:     string,    // URL diretta del PDF/pagina ufficiale
//     lastUpdatedAt: 'YYYY-MM-DD',  // data ultimo refresh Movì CT
//     validFrom:     'YYYY-MM-DD' | null,
//     validTo:       'YYYY-MM-DD' | null,
//   }
// ─────────────────────────────────────────────────────────────────────────

// ── Hub fisici lato Catania ──────────────────────────────────────────────
export const HUBS = {
  'ct-archimede': {
    id: 'ct-archimede',
    name: 'Catania — Terminal Bus Via Archimede',
    short: 'Terminal Via Archimede',
    city: 'Catania',
    desc: 'Capolinea dei pullman extraurbani, accanto alla Stazione Centrale di Piazza Papa Giovanni XXIII.',
    lat: 37.5036,
    lng: 15.0972,
  },
  'ct-airport': {
    id: 'ct-airport',
    name: 'Aeroporto di Catania — Fontanarossa',
    short: 'Aeroporto Fontanarossa',
    city: 'Catania',
    desc: "Stallo bus extraurbani all'esterno del terminal Arrivi.",
    lat: 37.4668,
    lng: 15.0664,
  },
};

// ── Vettori ──────────────────────────────────────────────────────────────
// `group` lega i vettori che condividono biglietteria e motore di ricerca.
export const CARRIERS = [
  {
    id: 'sais',
    name: 'SAIS Autolinee',
    mono: 'S',
    color: '#1d4ed8',
    group: 'sais',
    website: 'https://www.saisautolinee.it/',
    phone: '+390916171141',
    note: 'Biglietteria e partenze al Terminal Bus di Via Archimede, accanto alla Stazione Centrale. Acquisto biglietti anche online. Sulle tratte a lunga percorrenza la prenotazione è consigliata.',
  },
  {
    id: 'saist',
    name: 'SAIS Trasporti',
    mono: 'ST',
    color: '#7c3aed',
    group: 'sais',
    website: 'https://www.saistrasporti.it/',
    phone: '+390916178861',
    note: 'Collegamenti a lunga percorrenza verso il continente. Biglietteria al Terminal di Via Archimede; prenotazione fortemente consigliata.',
  },
  {
    id: 'interbus',
    name: 'Interbus',
    mono: 'i',
    color: '#0891b2',
    group: 'interbus',
    website: 'https://www.interbus.it/',
    phone: '+390916167919',
    note: "Gruppo Interbus / Etna Trasporti / Segesta. Biglietti online o in biglietteria al Terminal di Via Archimede. Coincidenze dirette con l'Aeroporto di Catania Fontanarossa.",
  },
  {
    id: 'etna',
    name: 'Etna Trasporti',
    mono: 'E',
    color: '#e63946',
    group: 'interbus',
    website: 'https://www.etnatrasporti.it/',
    phone: '+390957461096',
    note: "Gruppo Interbus / Etna Trasporti / Segesta. Biglietti online o in biglietteria al Terminal di Via Archimede. Coincidenze dirette con l'Aeroporto di Catania Fontanarossa.",
  },
  {
    id: 'segesta',
    name: 'Segesta Autolinee',
    mono: 'Sg',
    color: '#f59e0b',
    group: 'interbus',
    website: 'https://www.segesta.it/',
    phone: '+390916167919',
    note: 'Gruppo Interbus / Etna Trasporti / Segesta. Biglietti online o in biglietteria al Terminal di Via Archimede.',
  },
  {
    id: 'ast',
    name: 'AST — Azienda Siciliana Trasporti',
    mono: 'A',
    color: '#16a34a',
    group: 'ast',
    website: 'https://www.aziendasicilianatrasporti.it/',
    phone: '+390916208111',
    note: 'AST riduce o sospende molte corse nei giorni festivi e fuori dal periodo scolastico. Biglietti a bordo o presso le rivendite autorizzate; controlla la biglietteria e il quadro orari sul sito ufficiale.',
  },
  {
    id: 'fce',
    name: 'FCE — Autolinee Circumetnea',
    mono: 'F',
    color: '#ea580c',
    group: 'fce',
    website: 'https://www.circumetnea.it/',
    phone: '+390954521111',
    note: 'Le autolinee FCE seguono il calendario feriale/scolastico: nei giorni festivi le corse sono fortemente ridotte o sospese. Verifica sempre il quadro orari aggiornato prima di partire.',
  },
];

// ── Località servite ─────────────────────────────────────────────────────
// area: 'capoluogo' | 'provincia' | 'regione' | 'nazionale'
export const CITIES = [
  { id: 'catania',         name: 'Catania',                  area: 'capoluogo', aliases: ['ct'] },
  { id: 'aeroporto',       name: 'Aeroporto Catania Fontanarossa', area: 'capoluogo', aliases: ['fontanarossa', 'aeroporto', 'cta', 'airport'] },

  { id: 'palermo',         name: 'Palermo',                  area: 'regione' },
  { id: 'messina',         name: 'Messina',                  area: 'regione' },
  { id: 'siracusa',        name: 'Siracusa',                 area: 'regione' },
  { id: 'noto',            name: 'Noto',                     area: 'regione' },
  { id: 'ragusa',          name: 'Ragusa',                   area: 'regione' },
  { id: 'modica',          name: 'Modica',                   area: 'regione' },
  { id: 'taormina',        name: 'Taormina',                 area: 'regione' },
  { id: 'giardini-naxos',  name: 'Giardini Naxos',           area: 'regione' },
  { id: 'francavilla',     name: 'Francavilla di Sicilia',   area: 'regione', aliases: ['alcantara'] },
  { id: 'calatabiano',     name: 'Calatabiano',              area: 'regione' },
  { id: 'caltagirone',     name: 'Caltagirone',              area: 'regione' },
  { id: 'gela',            name: 'Gela',                     area: 'regione' },
  { id: 'troina',          name: 'Troina',                   area: 'regione' },
  { id: 'nicosia',         name: 'Nicosia',                  area: 'regione' },
  { id: 'agrigento',       name: 'Agrigento',                area: 'regione' },
  { id: 'enna',            name: 'Enna',                     area: 'regione' },
  { id: 'caltanissetta',   name: 'Caltanissetta',            area: 'regione' },
  { id: 'piazza-armerina', name: 'Piazza Armerina',          area: 'regione' },

  { id: 'acireale',        name: 'Acireale',                 area: 'provincia', aliases: ['monterosso etneo'] },
  { id: 'belpasso',        name: 'Belpasso',                 area: 'provincia', aliases: ['borrello'] },
  { id: 'nicolosi',        name: 'Nicolosi',                 area: 'provincia' },
  { id: 'rifugio-sapienza', name: 'Rifugio Sapienza (Etna)', area: 'provincia', aliases: ['etna', 'sapienza', 'etna sud'] },
  { id: 'paterno',         name: 'Paternò',                  area: 'provincia' },
  { id: 'adrano',          name: 'Adrano',                   area: 'provincia' },
  { id: 'misterbianco',    name: 'Misterbianco',             area: 'provincia' },
  { id: 'ramacca',         name: 'Ramacca',                  area: 'provincia' },
  { id: 'scordia',         name: 'Scordia',                  area: 'provincia' },
  { id: 'palagonia',       name: 'Palagonia',                area: 'provincia' },
  { id: 'randazzo',        name: 'Randazzo',                 area: 'provincia' },
  { id: 'castiglione',     name: 'Castiglione di Sicilia',   area: 'provincia' },
  { id: 'linguaglossa',    name: 'Linguaglossa',             area: 'provincia' },
  { id: 'bronte',          name: 'Bronte',                   area: 'provincia' },
  { id: 'maletto',         name: 'Maletto',                  area: 'provincia' },
  { id: 'biancavilla',     name: 'Biancavilla',              area: 'provincia' },
  { id: 'giarre',          name: 'Giarre',                   area: 'provincia' },
  { id: 'riposto',         name: 'Riposto',                  area: 'provincia' },
  { id: 'mascali',         name: 'Mascali',                  area: 'provincia' },
  { id: 'piedimonte',      name: 'Piedimonte Etneo',         area: 'provincia' },
  { id: 'mascalucia',      name: 'Mascalucia',               area: 'provincia', aliases: ['massa annunziata'] },
  { id: 'pedara',          name: 'Pedara',                   area: 'provincia' },
  { id: 'trecastagni',     name: 'Trecastagni',              area: 'provincia' },
  { id: 'viagrande',       name: 'Viagrande',                area: 'provincia' },
  { id: 'aci-santantonio', name: "Aci Sant'Antonio",         area: 'provincia', aliases: ['aci sant antonio', 'aci santantonio'] },
  { id: 'aci-catena',      name: 'Aci Catena',               area: 'provincia', aliases: ['acicatena', 'aci san filippo', 'reitana', 'vampolieri'] },
  { id: 'aci-castello',    name: 'Aci Castello',             area: 'provincia', aliases: ['ficarazzi', 'acicastello', 'acitrezza', 'aci trezza'] },
  { id: 'aci-bonaccorsi',  name: 'Aci Bonaccorsi',            area: 'provincia', aliases: ['acibonaccorsi'] },
  { id: 'motta-santanastasia', name: "Motta Sant'Anastasia", area: 'provincia', aliases: ['motta sant anastasia', 'motta santanastasia'] },
  { id: 'camporotondo',    name: 'Camporotondo Etneo',       area: 'provincia', aliases: ['camporotondo'] },
  { id: 'san-pietro-clarenza', name: 'San Pietro Clarenza',  area: 'provincia' },
  { id: 'ragalna',         name: 'Ragalna',                  area: 'provincia' },
  { id: 'valverde',        name: 'Valverde',                 area: 'provincia' },
  { id: 'zafferana',       name: 'Zafferana Etnea',          area: 'provincia', aliases: ['zafferana etnea'] },
  { id: 'san-gregorio',    name: 'San Gregorio di Catania',  area: 'provincia', aliases: ['san gregorio'] },
  { id: 'lentini',         name: 'Lentini',                  area: 'provincia' },
  { id: 'carlentini',      name: 'Carlentini',               area: 'provincia' },
  { id: 'francofonte',     name: 'Francofonte',              area: 'provincia' },
  { id: 'licodia',         name: 'Licodia Eubea',            area: 'provincia', aliases: ['licodia'] },
  { id: 'gravina',         name: 'Gravina di Catania',       area: 'provincia' },
  { id: 'san-giovanni-la-punta', name: 'San Giovanni La Punta', area: 'provincia', aliases: ['san giovanni la punta', 'san giovanni la p'] },
  { id: 'sant-agata-li-battiati', name: "Sant'Agata Li Battiati", area: 'provincia', aliases: ['sant agata li battiati', 'santagata li battiati', 'sant agata li b'] },
  { id: 'tremestieri',     name: 'Tremestieri Etneo',        area: 'provincia' },
  { id: 'mineo',           name: 'Mineo',                    area: 'provincia' },
  { id: 'militello',       name: 'Militello in Val di Catania', area: 'provincia', aliases: ['militello'] },
  { id: 'vizzini',         name: 'Vizzini',                  area: 'provincia' },
  { id: 'grammichele',     name: 'Grammichele',              area: 'provincia' },
  { id: 'raddusa',         name: 'Raddusa',                  area: 'provincia' },
  { id: 'mirabella',       name: 'Mirabella Imbaccari',      area: 'provincia', aliases: ['mirabella imbaccari'] },
  { id: 'san-michele-ganzaria', name: 'San Michele di Ganzaria', area: 'provincia', aliases: ['san michele di ganzaria'] },
  { id: 'san-cono',        name: 'San Cono',                 area: 'provincia' },
  { id: 'castel-di-judica', name: 'Castel di Judica',        area: 'provincia', aliases: ['castel di iudica'] },

  { id: 'roma',            name: 'Roma',                     area: 'nazionale' },
  { id: 'napoli',          name: 'Napoli',                   area: 'nazionale' },
];

// ── Collegamenti ─────────────────────────────────────────────────────────
// Ogni connection lega un capo lato Catania (endpoints[0]) a una destinazione
// (endpoints[1]); `via` elenca le tappe intermedie in ordine da Catania.
// `departureHub` è l'hub di partenza quando si viaggia dal lato Catania.
// `schedules` è vuoto finché non si dispone di orari ufficiali verificati.
export const CONNECTIONS = [
  // ── SAIS — lunga percorrenza ──
  { id: 'c-palermo',       endpoints: ['catania', 'palermo'],       via: [],                          carriers: ['sais'],            departureHub: 'ct-archimede', category: 'lunga-percorrenza', schedules: [] },
  { id: 'c-messina',       endpoints: ['catania', 'messina'],       via: [],                          carriers: ['sais', 'interbus'], departureHub: 'ct-archimede', category: 'lunga-percorrenza', schedules: [] },
  { id: 'c-enna',          endpoints: ['catania', 'enna'],          via: [],                          carriers: ['sais'],            departureHub: 'ct-archimede', category: 'lunga-percorrenza', schedules: [] },
  { id: 'c-caltanissetta', endpoints: ['catania', 'caltanissetta'], via: ['enna'],                    carriers: ['sais', 'saist'],   departureHub: 'ct-archimede', category: 'lunga-percorrenza', schedules: [] },
  { id: 'c-agrigento',     endpoints: ['catania', 'agrigento'],     via: [],                          carriers: ['sais', 'saist'],   departureHub: 'ct-archimede', category: 'lunga-percorrenza', schedules: [] },
  { id: 'c-roma',          endpoints: ['catania', 'roma'],          via: ['messina', 'napoli'],       carriers: ['saist'],           departureHub: 'ct-archimede', category: 'nazionale',          schedules: [] },

  // ── Gruppo Interbus / Etna Trasporti / Segesta — regionali ──
  { id: 'c-siracusa',      endpoints: ['catania', 'siracusa'],      via: [],                          carriers: ['interbus'],        departureHub: 'ct-archimede', category: 'regionale', schedules: [] },
  { id: 'c-noto',          endpoints: ['catania', 'noto'],          via: ['siracusa'],                carriers: ['interbus'],        departureHub: 'ct-archimede', category: 'regionale', schedules: [] },
  { id: 'c-ragusa',        endpoints: ['catania', 'ragusa'],        via: [],                          carriers: ['etna'],            departureHub: 'ct-archimede', category: 'regionale', schedules: [] },
  { id: 'c-modica',        endpoints: ['catania', 'modica'],        via: ['ragusa'],                  carriers: ['etna'],            departureHub: 'ct-archimede', category: 'regionale', schedules: [] },
  { id: 'c-taormina',      endpoints: ['catania', 'taormina'],      via: ['giardini-naxos'],          carriers: ['interbus'],        departureHub: 'ct-archimede', category: 'regionale', schedules: [] },
  { id: 'c-alcantara',     endpoints: ['catania', 'francavilla'],   via: ['giardini-naxos', 'calatabiano'], carriers: ['interbus'],  departureHub: 'ct-archimede', category: 'regionale', schedules: [] },
  { id: 'c-caltagirone',   endpoints: ['catania', 'caltagirone'],   via: [],                          carriers: ['etna'],            departureHub: 'ct-archimede', category: 'regionale', schedules: [] },
  { id: 'c-gela',          endpoints: ['catania', 'gela'],          via: ['caltagirone'],             carriers: ['etna'],            departureHub: 'ct-archimede', category: 'regionale', schedules: [] },
  { id: 'c-piazza-armerina', endpoints: ['catania', 'piazza-armerina'], via: [],                      carriers: ['etna', 'sais'],    departureHub: 'ct-archimede', category: 'regionale', schedules: [] },
  { id: 'c-troina',        endpoints: ['catania', 'troina'],        via: [],                          carriers: ['interbus'],        departureHub: 'ct-archimede', category: 'regionale', schedules: [] },
  { id: 'c-nicosia',       endpoints: ['catania', 'nicosia'],       via: ['troina'],                  carriers: ['interbus'],        departureHub: 'ct-archimede', category: 'regionale', schedules: [] },

  // ── Coincidenze dall'Aeroporto di Catania Fontanarossa ──
  { id: 'c-air-taormina',  endpoints: ['aeroporto', 'taormina'],    via: ['giardini-naxos'],          carriers: ['interbus'],        departureHub: 'ct-airport', category: 'aeroporto', schedules: [] },
  { id: 'c-air-messina',   endpoints: ['aeroporto', 'messina'],     via: ['taormina', 'giardini-naxos'], carriers: ['interbus'],     departureHub: 'ct-airport', category: 'aeroporto', schedules: [] },
  { id: 'c-air-siracusa',  endpoints: ['aeroporto', 'siracusa'],    via: [],                          carriers: ['interbus'],        departureHub: 'ct-airport', category: 'aeroporto', schedules: [] },
  { id: 'c-air-ragusa',    endpoints: ['aeroporto', 'ragusa'],      via: [],                          carriers: ['etna'],            departureHub: 'ct-airport', category: 'aeroporto', schedules: [] },
  { id: 'c-air-palermo',   endpoints: ['aeroporto', 'palermo'],     via: [],                          carriers: ['sais'],            departureHub: 'ct-airport', category: 'aeroporto', schedules: [] },

  // ── AST — provincia etnea ──
  { id: 'c-acireale',      endpoints: ['catania', 'acireale'],      via: [],                          carriers: ['ast'],             departureHub: 'ct-archimede', category: 'provinciale', schedules: [] },
  { id: 'c-belpasso-ast',  endpoints: ['catania', 'belpasso'],      via: [],                          carriers: ['ast'],             departureHub: 'ct-archimede', category: 'provinciale', schedules: [] },
  { id: 'c-nicolosi-ast',  endpoints: ['catania', 'nicolosi'],      via: [],                          carriers: ['ast'],             departureHub: 'ct-archimede', category: 'provinciale', schedules: [] },
  { id: 'c-rifugio',       endpoints: ['catania', 'rifugio-sapienza'], via: [],                       carriers: ['ast'],             departureHub: 'ct-archimede', category: 'turistica',
    note: "Linea turistica per l'Etna. Una corsa giornaliera: partenza da Piazza Papa Giovanni XXIII a Catania alle 08:15, ritorno dal Rifugio Sapienza alle 16:30. Biglietto a/r €6,60 (acquistabile anche a bordo). Durata ~2 ore. Sospesa il 25 dicembre, 1 gennaio, 1 maggio, 15 agosto e Pasqua.", schedules: [] },
  { id: 'c-paterno-ast',   endpoints: ['catania', 'paterno'],       via: [],                          carriers: ['ast'],             departureHub: 'ct-archimede', category: 'provinciale', schedules: [] },
  { id: 'c-ramacca',       endpoints: ['catania', 'ramacca'],       via: [],                          carriers: ['ast'],             departureHub: 'ct-archimede', category: 'provinciale', schedules: [] },
  { id: 'c-scordia',       endpoints: ['catania', 'scordia'],       via: [],                          carriers: ['ast'],             departureHub: 'ct-archimede', category: 'provinciale', schedules: [] },
  { id: 'c-palagonia',     endpoints: ['catania', 'palagonia'],     via: ['scordia'],                 carriers: ['ast'],             departureHub: 'ct-archimede', category: 'provinciale', schedules: [] },

  // ── FCE — autolinee Circumetnea ──
  // Tracciati verificati sul PDF ufficiale "Orario Invernale 2025-2026
  // aggiornato 30 marzo 2026" (circumetnea.it/le-nostre-linee/).
  // Il servizio FCE è sospeso nei giorni festivi (riportato sul PDF).
  {
    id: 'c-fce-randazzo',
    endpoints: ['catania', 'randazzo'],
    via: ['misterbianco', 'paterno', 'biancavilla', 'adrano', 'bronte', 'maletto'],
    carriers: ['fce'],
    departureHub: 'ct-archimede',
    category: 'provinciale',
    note: 'Lato ovest della Circumetnea (sostituzione su gomma). Orario invernale 2025-2026 in vigore dal 30 marzo 2026. Servizio sospeso nei giorni festivi.',
    schedules: [],
  },
  {
    id: 'c-fce-linguaglossa',
    endpoints: ['catania', 'linguaglossa'],
    via: ['acireale', 'giarre', 'riposto', 'mascali', 'piedimonte'],
    carriers: ['fce'],
    departureHub: 'ct-archimede',
    category: 'provinciale',
    note: 'Lato est della Circumetnea via A18 (Catania-Acireale-Giarre-Riposto-Linguaglossa). Orario invernale 2025-2026 in vigore dal 30 marzo 2026. Servizio sospeso nei giorni festivi.',
    schedules: [],
  },
  {
    id: 'c-fce-nicolosi',
    endpoints: ['catania', 'nicolosi'],
    via: ['belpasso'],
    carriers: ['fce'],
    departureHub: 'ct-archimede',
    category: 'provinciale',
    note: 'Linea Belpasso-Catania (anche via Metro Nesima). Servizio sospeso nei giorni festivi.',
    schedules: [],
  },
];

// ── Mete rapide della Dashboard ("Quick Taps") ───────────────────────────
// kind 'route'  → avvia ricerca Catania → cityId
// kind 'hub'    → mostra tutte le linee da/per quell'hub
export const QUICK_TAPS = [
  { kind: 'hub',   hubMode: 'aeroporto', label: 'Aeroporto',  icon: '✈️' },
  { kind: 'route', cityId: 'palermo',    label: 'Palermo',    icon: '🏛️' },
  { kind: 'route', cityId: 'taormina',   label: 'Taormina',   icon: '🌊' },
  { kind: 'route', cityId: 'siracusa',   label: 'Siracusa',   icon: '🏺' },
  { kind: 'route', cityId: 'belpasso',   label: 'Belpasso',   icon: '🚌' },
];

// Indirizzo email per ricevere le segnalazioni utenti.
// ⚠️ Da impostare con un indirizzo reale prima del go-live.
export const FEEDBACK_EMAIL = 'stefanodibella1@gmail.com';

// Etichette leggibili per le categorie di tratta.
export const CATEGORY_LABELS = {
  'lunga-percorrenza': 'Lunga percorrenza',
  'nazionale':         'Nazionale',
  'regionale':         'Regionale',
  'provinciale':       'Provincia etnea',
  'turistica':         'Linea turistica',
  'aeroporto':         'Coincidenza aeroporto',
};

// ── Merge del manifest orari ─────────────────────────────────────────────
// Il manifest è prodotto da `scripts/refreshIntercity.cjs`: una mappa
// `connectionId -> { meta, schedules }` con la provenance e le corse estratte
// dai siti ufficiali. Lo fondiamo qui per non duplicare logica di lookup.
import SCHEDULES_MANIFEST from './intercitySchedules.json' with { type: 'json' };

for (const conn of CONNECTIONS) {
  const entry = SCHEDULES_MANIFEST[conn.id];
  if (!entry) continue;
  if (entry.meta) conn.schedulesMeta = entry.meta;
  if (Array.isArray(entry.schedules) && entry.schedules.length > 0) {
    conn.schedules = entry.schedules;
  }
  // routes[] (alimentato dal parser Regione Sicilia): percorso completo
  // della linea ufficiale con codice ministeriale, fermate ordinate e km.
  // Permette al frontend di mostrare le tappe dettagliate e la distanza.
  if (Array.isArray(entry.routes) && entry.routes.length > 0) {
    conn.routes = entry.routes;
  }
}
