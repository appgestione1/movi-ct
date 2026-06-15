// Fornitori monopattini Catania — predisposti per aggiunta rapida.
// gbfsUrl: null  → nessun dato live disponibile, solo link all'app.
// scanUrl        → apre lo scanner QR / sblocco nell'app nativa (universal link).
// comingSoon: true → pulsante disabilitato (fornitore non ancora confermato a CT).

export const SCOOTER_PROVIDERS = [
  {
    id: 'elerent',
    name: 'Elérent',
    color: '#8BC53F', // verde Elérent
    gbfsUrl: '/api/elerent-gbfs',
    // subscriptionUrl: link Branch.io verso la schermata Abbonamenti di Elérent.
    // Ricavato analizzando l'APK (com.elerent.elerent v10.21): routing via enum
    // DeepLinkScreen, token "subscription". Link Branch apre l'app se installata,
    // altrimenti store. ⚠️ Da confermare on-device; il link ufficiale della promo
    // PASS MOVÌ CT (da Fabrizio/Elérent) è il più sicuro.
    subscriptionUrl:
      'https://elerent.app.link/?deepLinkScreen=subscription&$fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.elerent.elerent',
    promoHeadline: ['PASS MOVÌ CT', 'VAI IN MONOPATTINO', '1,99 € ALL INCLUDED'],
    promoNote:
      'Una volta nell\'app\n' +
      'vai in "Abbonamenti"\n' +
      'e scegli il PASS MOVÌ CT a 1,99 €\n' +
      '(1 sblocco + 15 minuti)\n' +
      'l\'offerta dedicata a Movì CT\n' +
      'senza costi nascosti, nessun sblocco o minuto extra a pagamento.',
    scanUrl: 'https://elerent.com/',
    appStoreUrl: 'https://apps.apple.com/app/id1518090808',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.elerent.elerent',
    comingSoon: false,
  },
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
    scanUrl: 'https://limebike.app.link/TviIBQCOGB',
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
