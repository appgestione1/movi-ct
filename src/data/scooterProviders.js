// Fornitori monopattini Catania — predisposti per aggiunta rapida.
// gbfsUrl: null  → nessun dato live disponibile, solo link all'app.
// scanUrl        → apre lo scanner QR / sblocco nell'app nativa (universal link).
// comingSoon: true → pulsante disabilitato (fornitore non ancora confermato a CT).

export const SCOOTER_PROVIDERS = [
  {
    id: 'dott',
    name: 'Dott',
    color: '#EF4D23',
    gbfsUrl: 'https://gbfs.api.ridedott.com/public/v2/catania/free_bike_status.json',
    scanUrl: 'https://ridedott.com/scan',
    comingSoon: false,
  },
  {
    id: 'lime',
    name: 'Lime',
    color: '#C8F135',
    gbfsUrl: '/api/lime-gbfs?feed=free_bike_status',
    // Universal link Lime — apre l'app direttamente alla schermata di sblocco
    scanUrl: 'https://limebike.app.link/TviIBQCOGB',
    comingSoon: false,
  },
  {
    id: 'elerent',
    name: 'Elérent',
    color: '#7C3AED',
    gbfsUrl: '/api/elerent-gbfs',
    scanUrl: null, // nessun deep link verificato; bottone nascosto finché GBFS non è attivo
    comingSoon: false,
  },
  {
    id: 'bird',
    name: 'Bird',
    color: '#AAAAAA',
    gbfsUrl: null,
    scanUrl: 'https://bird.co',
    comingSoon: true,
  },
  {
    id: 'tier',
    name: 'Tier',
    color: '#4F6BFF',
    gbfsUrl: null,
    scanUrl: 'https://tier.app',
    comingSoon: true,
  },
  {
    id: 'voi',
    name: 'Voi',
    color: '#FF4F4F',
    gbfsUrl: null,
    scanUrl: 'https://www.voiscooters.com',
    comingSoon: true,
  },
  {
    id: 'bolt',
    name: 'Bolt',
    color: '#34D186',
    gbfsUrl: null,
    scanUrl: 'https://bolt.eu/it/scooters/',
    comingSoon: true,
  },
];
