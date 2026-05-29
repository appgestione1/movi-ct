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
    color: '#8BC53F', // verde Elérent
    gbfsUrl: '/api/elerent-gbfs',
    // Dati live via ATOM Mobility (vedi api/elerent-gbfs.js).
    // La promo "PASS MOVÌ CT" vive dentro l'app Elérent → il CTA la apre.
    //
    // subscriptionUrl: link Branch.io di Elérent (dominio elerent.app.link).
    // Un link Branch apre l'app se installata e fa fallback allo store da solo,
    // quindi il CTA "Sblocca con Elérent" lo usa per primo.
    // ⚠️ Quello sotto è un tentativo (deeplink_path=subscriptions): apre l'app
    // ma potrebbe atterrare sulla home invece che su "Sottoscrizioni". Il link
    // DEFINITIVO che porta diritto al PASS MOVÌ CT (€1,99) va chiesto a Elérent
    // (è una loro Quick Link Branch della promo) e incollato qui.
    subscriptionUrl:
      'https://elerent.app.link/?$deeplink_path=subscriptions&$fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.elerent.elerent',
    // Promemoria mostrato prima di aprire l'app/store (CTA "Sblocca con Elérent").
    promoNote:
      'Una volta nell\'app, vai in "Abbonamenti" e scegli il PASS MOVÌ CT a 1,99 € ' +
      '(1 sblocco + 15 minuti): è l\'offerta dedicata a Movì CT. ' +
      'Nessun costo nascosto, nessuno sblocco o minuto extra a pagamento.',
    scanUrl: 'https://elerent.com/',
    appStoreUrl: 'https://apps.apple.com/app/id1518090808',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.elerent.elerent',
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
