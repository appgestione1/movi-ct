// Fornitori monopattini Catania — predisposti per aggiunta rapida.
// gbfsUrl: null  → nessun dato live disponibile, solo link all'app.
// comingSoon: true → pulsante disabilitato (fornitore non ancora confermato a CT).

export const SCOOTER_PROVIDERS = [
  {
    id: 'dott',
    name: 'Dott',
    color: '#EF4D23',
    gbfsUrl: 'https://gbfs.api.ridedott.com/public/v2/catania/free_bike_status.json',
    appUrl: 'https://ridedott.com',
    comingSoon: false,
  },
  {
    id: 'lime',
    name: 'Lime',
    color: '#00C851',
    gbfsUrl: null,
    appUrl: 'https://li.me',
    comingSoon: false,
  },
  {
    id: 'bird',
    name: 'Bird',
    color: '#AAAAAA',
    gbfsUrl: null,
    appUrl: 'https://bird.co',
    comingSoon: true,
  },
  {
    id: 'tier',
    name: 'Tier',
    color: '#4F6BFF',
    gbfsUrl: null,
    appUrl: 'https://tier.app',
    comingSoon: true,
  },
  {
    id: 'voi',
    name: 'Voi',
    color: '#FF4F4F',
    gbfsUrl: null,
    appUrl: 'https://www.voiscooters.com',
    comingSoon: true,
  },
  {
    id: 'bolt',
    name: 'Bolt',
    color: '#34D186',
    gbfsUrl: null,
    appUrl: 'https://bolt.eu/it/scooters/',
    comingSoon: true,
  },
];
