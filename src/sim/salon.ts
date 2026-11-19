import { CATALOG } from './catalog';
import { AGENT_FILE_ID, h, mkTicket } from './data';
import { fileById, myTicket } from './engine';
import type { Step } from './scenarios';
import type { AgentEvent, Prestation, QueueFile, SimState, Ticket } from './types';

/*
 * Scénarios client : 1 coiffeur du salon = 1 cas. Le client scanne le salon et choisit un coiffeur, ce qui lance
 * le cas de ce coiffeur (`scenario.branch`). Chaque cas ne montre que ce que le client reçoit ou fait dans
 * l'application. Personne ne joue les coiffeurs : leurs gestes sont prévus dans `agentEvents`.
 * Tous les cas partent de mardi 9h40, sans pause : ils finissent avant 11h00.
 */

export const SALON_START = h(9, 40);

const pick = (ids: string[]): Prestation[] => CATALOG.filter((p) => ids.includes(p.id)).map((p) => ({ ...p }));
const BASE = ['degrade', 'taper', 'crop', 'classique', 'buzz', 'barbe-express'];

type Barber = {
  id: string;
  name: string;
  tag: string;
  prestations: Prestation[];
  endOfDay?: number;
  decidesOvertime?: boolean;
  /** Les clients déjà là : `startedAt` pour celui qui est sur le fauteuil. */
  tickets: { name: string; ids: string[]; joinedAt: number; startedAt?: number; extra?: number }[];
  /** Les gestes du coiffeur, activés quand le client le choisit. */
  events?: Omit<AgentEvent, 'fileId'>[];
  steps: Step[];
};

// ---------- Étapes ----------

const mine = (s: SimState) => myTicket(s)?.ticket;
/** Le client n'a plus de ticket actif : il a quitté la file, ou son ticket a été retiré. */
const gone = (s: SimState) => {
  const t = mine(s);
  return !t || t.abortAt !== undefined;
};
const ticketIn = (s: SimState, fileId: string, name: string) => fileById(s, fileId).tickets.find((t) => t.name === name);
const remiOverrun = (s: SimState) => ticketIn(s, 'julien', 'Rémi')?.overrun ?? 0;
const onScreen = (s: SimState, screen: SimState['clientNav']['screen']) => s.clientNav.screen === screen;

const c = (text: string, until: (s: SimState) => boolean, jump?: string): Step => ({ text, until, jump });

/** Questionnaire de satisfaction, envoyé dès que la prestation est close. */
const rateStep: Step = c('Ta prestation est terminée : note-la et laisse un commentaire si tu veux.', (s) => gone(s) || mine(s)!.rating !== undefined);

/** Choix des prestations, compte, réglage du rappel. */
const joinSteps = (chooseText = 'Choisis 1 ou plusieurs prestations, puis « Prendre ma place ».'): Step[] => [
  c(chooseText, (s) => !onScreen(s, 'choose') || !!mine(s)),
  c('Crée ton compte : avec Google, ou par e-mail.', (s) => !!mine(s)),
  c('Choisis si tu veux un rappel pour partir au salon, puis valide.', (s) => !onScreen(s, 'joined') || gone(s)),
];

/** Raison du saut des 2 premières étapes de `tailSteps` dans les cas qui montrent déjà l'attente. */
const ALREADY_SHOWN = 'le cas a déjà montré l’attente et l’invitation à confirmer';

/** Le client a reçu son invitation à confirmer, ou a déjà confirmé. */
const invited = (s: SimState) => mine(s)!.invitedAt !== undefined || mine(s)!.confirmedAt !== undefined;

/**
 * La fin du parcours, commune à tous les cas. Une étape déjà vraie saute (client déjà confirmé, par exemple).
 * `skip` autorise les `first` premières étapes à sauter, pour la raison `why` (voir `canSkip` et `npm run replay`).
 */
const tailSteps = (
  waitText = 'Tu es libre d’attendre où tu veux.',
  confirmText = 'Tu es invité à confirmer ta présence. Tu es au salon : touche Scan.',
  skip?: { first: number; why: string },
): Step[] => [
  c(waitText, (s) => gone(s) || mine(s)!.remindedAt !== undefined || invited(s), 'Aller à la prochaine notification'),
  c(
    'Ton rappel : mets-toi en route. Tu pourras confirmer ta présence 10 min avant ton tour. Si tu scannes le salon avant, l’application refuse et te dit à partir de quand.',
    (s) => gone(s) || invited(s),
    'Aller à 10 min de ton tour',
  ),
  c(confirmText, (s) => gone(s) || mine(s)!.confirmedAt !== undefined),
  c('Vérifie ta prestation, puis valide.', (s) => gone(s) || !onScreen(s, 'confirmed')),
  c(
    'Ta présence est confirmée.',
    (s) => gone(s) || mine(s)!.calledAt !== undefined || mine(s)!.startedAt !== undefined,
    'Aller à ton tour',
  ),
  c(
    'C’est ton tour : touche Scan devant le poste du coiffeur.',
    (s) => gone(s) || mine(s)!.startedAt !== undefined,
  ),
  c('Ta prestation est en cours.', (s) => gone(s) || mine(s)!.doneAt !== undefined, 'Aller à la fin de la prestation'),
  rateStep,
].map((st, i) => (skip && i < skip.first ? { ...st, canSkip: skip.why } : st));

// ---------- Les 7 coiffeurs ----------

export const BARBERS: Barber[] = [
  {
    // Le fichier du téléphone du coiffeur reste celui d'Antoine : le moteur s'en sert dans tous les scénarios.
    id: AGENT_FILE_ID,
    name: 'Antoine',
    tag: 'Parcours normal',
    prestations: CATALOG.map((p) => ({ ...p })),
    tickets: [
      { name: 'Louis', ids: ['degrade'], joinedAt: h(9, 5), startedAt: h(9, 25) },
      { name: 'Hugo', ids: ['classique'], joinedAt: h(9, 12) },
    ],
    steps: [...joinSteps(), ...tailSteps()],
  },
  {
    id: 'mathis',
    name: 'Mathis',
    tag: 'Premier de la file',
    prestations: pick(BASE),
    tickets: [{ name: 'Bastien', ids: ['degrade'], joinedAt: h(9, 10), startedAt: h(9, 18) }],
    steps: [
      ...joinSteps(),
      c(
        'Ton tour est dans moins de 10 min : ta présence est confirmée dès l’inscription. Touche Scan devant le poste de Mathis pour démarrer, ou quitte la file.',
        (s) => gone(s) || mine(s)!.startedAt !== undefined,
      ),
      c('Ta prestation est en cours.', (s) => gone(s) || mine(s)!.doneAt !== undefined, 'Aller à la fin de la prestation'),
      rateStep,
    ],
  },
  {
    id: 'julien',
    name: 'Julien',
    tag: 'Retard du coiffeur',
    prestations: pick(['burst', ...BASE]),
    // Rémi devait finir à 10h00. Il dure 17 min de plus.
    tickets: [{ name: 'Rémi', ids: ['burst'], joinedAt: h(9, 15), startedAt: h(9, 25), extra: 17 }],
    events: [{ at: h(9, 48), do: 'announce', minutes: 10 }],
    steps: [
      ...joinSteps(),
      // Chaque étape cède aussi quand le client a avancé seul (confirmé, ou prestation démarrée) : sinon le guide
      // attendrait un dépassement qui n'arrive plus, Rémi ayant été clos par le démarrage du client.
      c('Ton tour est vers 10h00. Attends où tu veux.', (s) => gone(s) || remiOverrun(s) >= 10 || invited(s), 'Aller à 9h48'),
      c(
        'Julien sait que sa prestation en cours sera plus longue : il annonce 10 min de retard, ta nouvelle heure est dans la notification.',
        (s) => gone(s) || invited(s),
        'Aller à la prochaine notification',
      ),
      c(
        'Tu es invité à confirmer ta présence. Pour voir la notification de dépassement, ne scanne pas encore.',
        (s) => gone(s) || remiOverrun(s) >= 15 || ticketIn(s, 'julien', 'Rémi')?.doneAt !== undefined || mine(s)!.confirmedAt !== undefined,
        'Aller 5 min après la nouvelle heure',
      ),
      ...tailSteps(
        'Tu es libre d’attendre où tu veux.',
        'Julien n’a toujours pas fini : 5 min de retard constatées, nouvelle notification. Si tu avais confirmé ta présence, tu ne l’aurais pas reçue : tu serais au salon. Touche Scan pour confirmer.',
        { first: 2, why: ALREADY_SHOWN },
      ),
    ],
  },
  // Cas « Le tour avance » mis de côté (décision de Gabi, 17/11/2026) : l'attente tombe d'un coup de 60 à 30 min,
  // ce qu'un client ne peut pas anticiper s'il n'est pas déjà dans le coin. À reprendre dans un futur scénario
  // où le coiffeur propose au client de venir plus tôt, s'il le souhaite.
  /*
  {
    id: 'thomas',
    name: 'Thomas',
    tag: 'Le tour avance',
    prestations: pick(BASE),
    tickets: [
      { name: 'Florian', ids: ['classique'], joinedAt: h(9, 10), startedAt: h(9, 30) },
      { name: 'Quentin', ids: ['degrade'], joinedAt: h(9, 20) },
      { name: 'Kevin', ids: ['taper'], joinedAt: h(9, 32) },
    ],
    events: [{ at: h(10), do: 'leave', name: 'Kevin' }],
    steps: [
      ...joinSteps(),
      c('Ton tour est dans plus d’1 h. Tu es libre d’attendre où tu veux.', (s) => ticketIn(s, 'thomas', 'Kevin')?.abortAt !== undefined, 'Aller à 10h00'),
      // Le rappel peut tomber au même moment que le gain : l'explication a sa propre étape, qui attend l'invitation.
      c(
        'Un client devant toi a quitté la file : ton tour avance de 30 min, la notification te donne ta nouvelle heure.',
        (s) => gone(s) || invited(s),
        'Aller à 10 min de ton tour',
      ),
      ...tailSteps(undefined, undefined, { first: 2, why: ALREADY_SHOWN }),
    ],
  },
  */
  {
    id: 'nicolas',
    name: 'Nicolas',
    tag: 'Client en retard',
    prestations: pick(BASE),
    tickets: [{ name: 'Yann', ids: ['crop'], joinedAt: h(9, 20), startedAt: h(9, 30) }],
    events: [{ afterMyTurn: 3, do: 'replaceMine', minutes: 30 }],
    steps: [
      ...joinSteps(),
      c('Tu es libre d’attendre où tu veux.', (s) => gone(s) || invited(s), 'Aller à 10 min de ton tour'),
      c(
        'Tu es invité à confirmer ta présence. Cette fois, tu traînes : ne reviens pas au salon et ne scanne pas.',
        (s) => gone(s) || mine(s)!.confirmedAt !== undefined,
        'Aller à 3 min après ton tour',
      ),
      c(
        'Tu n’étais pas là à ton tour : Nicolas a pris un client présent et retiré ton ticket. Touche « Retour à mon compte ».',
        (s) => !mine(s) || mine(s)!.confirmedAt !== undefined,
      ),
      // Le client a confirmé malgré la consigne : il passe normalement.
      ...tailSteps(undefined, undefined, { first: 8, why: 'ticket retiré : la suite ne sert que si le client a confirmé malgré la consigne' }),
    ],
  },
  {
    id: 'damien',
    name: 'Damien',
    tag: 'Après la fermeture',
    prestations: CATALOG.map((p) => ({ ...p })),
    endOfDay: h(10, 15),
    decidesOvertime: true,
    tickets: [
      { name: 'Cyril', ids: ['degrade'], joinedAt: h(9, 15), startedAt: h(9, 25) },
      { name: 'Sacha', ids: ['buzz'], joinedAt: h(9, 30) },
    ],
    steps: [
      ...joinSteps(
        'Damien ferme à 10h15 aujourd’hui : ta prestation finirait après. Choisis-en une, puis « Demander une place ». Plus de 30 min après la fermeture, c’est refusé d’office : essaie aussi.',
      ).slice(0, 2),
      c('Ta demande est envoyée. Damien est au salon, tu lui en parles.', (s) => gone(s) || mine(s)!.overtime !== 'pending', 'Aller à sa réponse'),
      c('Damien a accepté : ta place vaut confirmation de présence, pas besoin de rappel. Valide.', (s) => !onScreen(s, 'joined') || gone(s)),
      ...tailSteps(undefined, undefined, { first: 4, why: 'place acceptée après la fermeture : le client est confirmé d’office' }),
    ],
  },
  {
    id: 'bruno',
    name: 'Bruno',
    tag: 'Imprévu',
    prestations: pick(['slick', ...BASE]),
    tickets: [
      { name: 'Théo', ids: ['slick'], joinedAt: h(9, 20), startedAt: h(9, 30) },
      { name: 'Paul', ids: ['crop'], joinedAt: h(9, 28) },
    ],
    events: [{ at: h(10), do: 'incident' }],
    steps: [
      ...joinSteps(),
      c('Tu es libre d’attendre où tu veux.', (s) => mine(s)?.abortReason === 'incident' || gone(s), 'Aller à 10h00'),
      c('Un imprévu oblige Bruno à fermer sa file : ton ticket est retiré, et tu es prévenu. Touche « Retour à mon compte ».', (s) => !mine(s)),
    ],
  },
  {
    id: 'maxence',
    name: 'Maxence',
    tag: 'Walk-in',
    prestations: pick(BASE),
    tickets: [
      { name: 'Noé', ids: ['taper'], joinedAt: h(9, 20), startedAt: h(9, 30) },
      { name: 'Jordan', ids: ['crop'], joinedAt: h(9, 32) },
    ],
    steps: [
      c(
        'Tu es entré sans scanner. Maxence t’a ajouté à sa file et te montre le QR code de ton ticket : scanne-le.',
        (s) => (onScreen(s, 'choose') && s.clientNav.screen === 'choose' && s.clientNav.claim === true) || !!mine(s),
      ),
      c('Ta place est gardée. Choisis tes prestations : sa durée devient la leur. Puis « Récupérer ma place ».', (s) => !onScreen(s, 'choose') || !!mine(s)),
      c('Crée ton compte : avec Google, ou par e-mail.', (s) => !!mine(s)),
      c('Choisis si tu veux un rappel pour partir au salon, puis valide.', (s) => !onScreen(s, 'joined') || gone(s)),
      ...tailSteps('Ton tour est dans 10 min ou plus : tu n’es plus confirmé, tu peux sortir du salon. L’invitation à confirmer te fera revenir.'),
    ],
  },
];

const barber = (id: string) => BARBERS.find((b) => b.id === id);

// ---------- État de départ ----------

function barberFile(b: Barber): QueueFile {
  const f: QueueFile = {
    id: b.id,
    agentName: b.name,
    metier: 'Barbier',
    prestations: b.prestations,
    pauses: [],
    open: true,
    endOfDay: b.endOfDay ?? h(19),
    tickets: [],
    demoTag: b.tag,
    decidesOvertime: b.decidesOvertime,
  };
  for (const t of b.tickets)
    f.tickets.push(
      mkTicket(f, t.name, t.ids, t.joinedAt, 'ponctuel', {
        ...(t.startedAt !== undefined ? { startedAt: t.startedAt, confirmedAt: t.startedAt } : {}),
        ...(t.extra ? { extra: t.extra } : {}),
      }),
    );
  return f;
}

export const salonFiles = () => BARBERS.map(barberFile);

// ---------- Guide ----------

const PREFIX: Step[] = [
  c('Scanne le QR code du salon.', (s) => s.clientNav.screen !== 'home' || s.scenario.branch !== undefined),
  c('Chaque coiffeur montre un cas différent, indiqué sous son nom. Choisis-en un.', (s) => s.scenario.branch !== undefined),
];

export const salonSteps = (s: SimState): Step[] => [...PREFIX, ...(barber(s.scenario.branch ?? '')?.steps ?? [])];

/** Le client a ouvert un coiffeur : son cas démarre. Pour le walk-in, le coiffeur lui a déjà créé un ticket. */
function startBranch(s: SimState, b: Barber) {
  s.scenario.branch = b.id;
  s.agentEvents = (b.events ?? []).map((e) => ({ ...e, fileId: b.id }));
  if (b.id === 'maxence') {
    const f = fileById(s, b.id);
    const t: Ticket = mkTicket(f, 'Walk-in 1', [], h(9, 35), 'ponctuel', { anonymous: true, walkIn: true, duration: 30 });
    f.tickets.push(t);
    s.me.walkIn = { fileId: f.id, ticketId: t.id };
    s.clientNav = { screen: 'home' };
  }
}

/**
 * Le guide du scénario client, après chaque action. Ouvrir un coiffeur lance son cas. Revenir au salon sans ticket
 * remet le salon dans son état de départ : le client peut essayer un autre coiffeur sans relancer le scénario.
 */
export function salonHook(s: SimState): SimState {
  const nav = s.clientNav;
  if (!s.scenario.branch && nav.screen === 'choose' && !nav.claim) {
    const b = barber(nav.fileId);
    if (b) startBranch(s, b);
  } else if (s.scenario.branch && nav.screen === 'store' && !myTicket(s)) {
    s.files = salonFiles();
    s.now = SALON_START;
    s.notifs = [];
    s.agentEvents = [];
    s.me = { ...s.me, ticketRef: undefined, walkIn: undefined };
    s.scenario = { id: 'client', beat: 1 };
    s.playing = false;
  }
  return s;
}
