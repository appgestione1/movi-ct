// Compagnie pullman extraurbane che collegano Catania al resto della Sicilia.
// Dato curato statico: orari e biglietti restano sui siti ufficiali delle compagnie
// (non pubblicano feed aperti, quindi niente orari live).

export const TERMINAL = {
  name: 'Catania — Buscenter / Via Archimede',
  desc: 'Quasi tutti i pullman extraurbani partono dall\'area Via Archimede / Piazza Giovanni XXIII, accanto alla Stazione Centrale.',
};

export const INTERCITY_COMPANIES = [
  { id: 'sais',     name: 'SAIS Autolinee',  color: '#2563eb', url: 'https://www.saisautolinee.it' },
  { id: 'etna',     name: 'Etna Trasporti',  color: '#e63946', url: 'https://www.etnatrasporti.it' },
  { id: 'interbus', name: 'Interbus',        color: '#0891b2', url: 'https://www.interbus.it' },
  { id: 'ast',      name: 'AST',             color: '#16a34a', url: 'https://www.aziendasicilianatrasporti.it' },
  { id: 'saist',    name: 'SAIS Trasporti',  color: '#7c3aed', url: 'https://www.saistrasporti.it' },
];

// Destinazioni principali → compagnie che le servono da Catania.
export const INTERCITY_DESTINATIONS = [
  { city: 'Palermo',         companies: ['sais', 'interbus'] },
  { city: 'Messina',         companies: ['sais', 'interbus', 'saist'] },
  { city: 'Siracusa',        companies: ['interbus', 'etna'] },
  { city: 'Ragusa',          companies: ['etna', 'ast'] },
  { city: 'Agrigento',       companies: ['sais'] },
  { city: 'Enna',            companies: ['sais', 'etna'] },
  { city: 'Caltanissetta',   companies: ['sais'] },
  { city: 'Taormina',        companies: ['interbus'] },
  { city: 'Noto',            companies: ['interbus', 'ast'] },
  { city: 'Caltagirone',     companies: ['etna', 'ast'] },
  { city: 'Gela',            companies: ['etna', 'sais'] },
  { city: 'Piazza Armerina', companies: ['etna', 'sais'] },
  { city: 'Roma / Napoli',   companies: ['saist'] },
];
