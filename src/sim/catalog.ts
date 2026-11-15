import type { Group, Prestation } from './types';

// Catalogue proposé à l'agent quand il crée son compte.
// Écart : S19 prévoit que l'agent soumet ses prestations et que le gérant les valide.
// Ici, il les choisit dans une liste déjà validée.
//
// Coupes : les 13 styles de https://barberconcept.ch/blog/choisir-son-style-coiffure-homme,
// avec une description réécrite. Barbe et soins : la page ne les décrit pas.
// Durées : le site n'en donne aucune, elles sont choisies pour la démo.

export const GROUPS: { id: Group; label: string }[] = [
  { id: 'coupe', label: 'Coupe' },
  { id: 'barbe', label: 'Barbe' },
  { id: 'soin', label: 'Soin' },
  { id: 'autre', label: 'Autres' },
];

export const CATALOG: Prestation[] = [
  { id: 'degrade', group: 'coupe', label: 'Dégradé / fade', minutes: 30, description: 'Fondu progressif des côtés : low, mid, high ou skin.' },
  { id: 'taper', group: 'coupe', label: 'Taper fade', minutes: 30, description: 'Dégradé doux, qui garde de la longueur aux contours.' },
  { id: 'burst', group: 'coupe', label: 'Burst fade', minutes: 35, description: 'Fondu en arc autour de l’oreille.' },
  { id: 'crop', group: 'coupe', label: 'Textured / French crop', minutes: 30, description: 'Frange courte, dessus en mèches.' },
  { id: 'classique', group: 'coupe', label: 'Coupe classique', minutes: 25, description: 'Aux ciseaux, raie sur le côté, sans fondu marqué.' },
  { id: 'buzz', group: 'coupe', label: 'Buzz cut', minutes: 15, description: 'Tondeuse courte, même longueur partout.' },
  { id: 'undercut', group: 'coupe', label: 'Undercut', minutes: 30, description: 'Côtés rasés, dessus long, sans fondu.' },
  { id: 'slick', group: 'coupe', label: 'Slick back', minutes: 30, description: 'Cheveux peignés en arrière, tenus au produit.' },
  { id: 'pompadour', group: 'coupe', label: 'Pompadour / quiff', minutes: 35, description: 'Volume relevé sur le devant.' },
  { id: 'wolf', group: 'coupe', label: 'Wolf cut', minutes: 40, description: 'Mèches effilées, volume en désordre.' },
  { id: 'curtain', group: 'coupe', label: 'Curtain hair', minutes: 35, description: 'Frange séparée au milieu, en rideau.' },
  { id: 'mulet', group: 'coupe', label: 'Mulet moderne', minutes: 40, description: 'Court devant, long derrière, version soignée.' },
  { id: 'bro', group: 'coupe', label: 'Bro flow', minutes: 30, description: 'Mi-long naturel, ramené en arrière.' },

  { id: 'moustache', group: 'barbe', label: 'Taille de moustache', minutes: 10, description: 'Mise en forme et longueur de la moustache.' },
  { id: 'barbe-classique', group: 'barbe', label: 'Taille de barbe classique', minutes: 30, description: 'Traçage, ciseaux, tondeuse, coupe-chou, serviette chaude, soin.' },
  { id: 'barbe-express', group: 'barbe', label: 'Taille de barbe express', minutes: 15, description: 'Mise en forme, traçage, ciseaux, tondeuse.' },
  { id: 'rasage-tondeuse', group: 'barbe', label: 'Rasage barbe tondeuse', minutes: 10, description: 'Barbe rasée à la tondeuse.' },
  { id: 'rasage-shaver', group: 'barbe', label: 'Rasage barbe shaver + soin', minutes: 20, description: 'Rasoir électrique, puis soin.' },
  { id: 'rasage-trad', group: 'barbe', label: 'Rasage traditionnel', minutes: 30, description: 'Coupe-chou, 2 passages, serviette chaude, soins.' },

  { id: 'shampoing', group: 'soin', label: 'Shampoing', minutes: 10, description: 'Lavage et massage du cuir chevelu.' },
  { id: 'shampoing-barbe', group: 'soin', label: 'Shampoing barbe', minutes: 5, description: 'Lavage de la barbe.' },
  { id: 'soin-hydratant', group: 'soin', label: 'Soin hydratant', minutes: 15, description: 'Soin hydratant du visage ou de la barbe.' },
];

export const catalogById = (id: string) => CATALOG.find((p) => p.id === id);
