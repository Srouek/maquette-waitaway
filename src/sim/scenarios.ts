import { CATALOG } from './catalog';
import { AGENT_FILE_ID, JULIE_PRESTATIONS, defaultWeek, h, mkTicket } from './data';
import { advanceUntil, fileById, inService, myTicket, reducer, syncClock, waiting, type Action } from './engine';
import type { Arrival, PauseId, QueueFile, ScenarioId, SimState } from './types';

/** 1 étape du guide affiché sous la barre de démo. */
export type Step = {
  /** Le téléphone concerné : sur petit écran, la démo bascule dessus. */
  view: 'client' | 'agent';
  /** La consigne, ou ce que le saut va montrer. */
  text: string;
  /** Libellé du bouton de saut dans le temps. Sans lui, l'étape est une consigne à faire à la main. */
  jump?: string;
  /** L'étape est finie quand cette condition devient vraie. */
  until: (s: SimState) => boolean;
  /** Mise en place faite à la fin de l'étape. */
  then?: (s: SimState) => void;
};

export type Scenario = { id: ScenarioId; label: string; hint: string; steps: Step[] };

// ---------- Raccourcis pour les conditions ----------

const karim = (s: SimState) => fileById(s, AGENT_FILE_ID);
const ticket = (s: SimState, name: string) => karim(s).tickets.find((t) => t.name === name);
const pause = (s: SimState, id: PauseId) => karim(s).pauses.find((p) => p.id === id);
/** Vrai aussi quand l'agent a retiré cette pause de sa journée : l'étape saute. */
const pauseHandled = (s: SimState, id: PauseId) => {
  const p = pause(s, id);
  return !p || p.startedAt !== undefined || p.skipped === true;
};
const pauseCalled = (s: SimState, id: PauseId) => pauseHandled(s, id) || pause(s, id)!.remindedAt !== undefined;
/** Le walk-in qui prend place dans la file et attend son tour (pas celui pris tout de suite à la place d'un retardataire). */
const guest = (s: SimState) =>
  karim(s).tickets.find((t) => t.walkIn && t.startedAt !== t.joinedAt && t.joinedAt < karim(s).endOfDay - 40);
/** Arrête le temps : l'agent a quelque chose à faire. */
const stopClock = (s: SimState) => {
  s.playing = false;
};

const scanPause = 'Scanne le QR code de ton poste pour démarrer ta pause.';

// ---------- Les 3 scénarios ----------

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  'pro-journee': {
    id: 'pro-journee',
    label: 'Coiffeur : ma journée',
    hint: 'The Best Barber ouvre sa file à 9h00. Clients, 3 pauses, un retard, des walk-in, la fermeture.',
    steps: [
      { view: 'agent', text: 'Connecte-toi : ton e-mail, puis le code reçu par e-mail.', until: (s) => s.agent.loggedIn },
      { view: 'agent', text: 'Scanne le QR code de ton poste, puis valide tes prestations, tes pauses et ton heure de fin.', until: (s) => karim(s).open },
      { view: 'agent', text: 'Ta file est vide.', jump: 'Aller à 9h15 : 1er client', until: (s) => s.now >= h(9, 15) && !!ticket(s, 'Yanis') },
      { view: 'agent', text: 'Yanis est inscrit, déjà au salon.', jump: 'Yanis scanne le QR du poste', until: (s) => ticket(s, 'Yanis')?.startedAt !== undefined },
      { view: 'agent', text: 'Sa prestation tourne.', jump: 'Aller à 9h40 : 4 inscriptions', until: (s) => s.now >= h(9, 40) },
      { view: 'agent', text: 'Regarde où ta pause du matin s’est placée dans la file.', jump: 'Aller à la pause du matin', until: (s) => pauseCalled(s, 'matin') },
      { view: 'agent', text: scanPause, until: (s) => pauseHandled(s, 'matin') },
      { view: 'agent', text: 'Tu es en pause.', jump: 'Aller à la fin de la pause', until: (s) => ticket(s, 'Adam')?.startedAt !== undefined },
      { view: 'agent', text: 'Adam a scanné le QR du poste : taper fade et barbe.', jump: 'Aller à la pause de midi', until: (s) => pauseCalled(s, 'midi') },
      { view: 'agent', text: scanPause, until: (s) => pauseHandled(s, 'midi') },
      {
        view: 'agent',
        text: 'Tu déjeunes. Théo est le 1er à la reprise, pour 40 min.',
        jump: 'Aller à la reprise',
        until: (s) => {
          const p = pause(s, 'midi');
          const over = !p || p.skipped === true || p.endedAt !== undefined || (p.startedAt !== undefined && s.now >= p.startedAt + p.minutes);
          return over && ticket(s, 'Théo')?.lateNotifiedAt !== undefined;
        },
      },
      {
        view: 'agent',
        text: 'C’est l’heure de Théo et il n’est pas là. Un passant vient d’entrer : touche l’alerte et prends-le en walk-in, en gardant ou en retirant Théo.',
        until: (s) => ticket(s, 'Théo')?.lateNotifiedAt !== undefined && s.lateAlert === undefined,
      },
      {
        view: 'agent',
        text: 'Regarde les heures de la file : elles ont bougé avec ta décision.',
        jump: 'Aller à la fin de sa prestation',
        until: (s) => ticket(s, 'Théo')?.abortAt !== undefined || ticket(s, 'Théo')?.startedAt !== undefined || s.lateAlert !== undefined,
      },
      {
        view: 'agent',
        text: 'Théo n’est toujours pas là. Touche l’alerte et retire-le : les clients derrière lui avancent.',
        until: (s) => ticket(s, 'Théo')?.abortAt !== undefined || ticket(s, 'Théo')?.startedAt !== undefined,
      },
      { view: 'agent', text: 'L’après-midi se déroule.', jump: 'Aller à la pause de l’après-midi', until: (s) => pauseCalled(s, 'aprem') },
      { view: 'agent', text: scanPause, until: (s) => pauseHandled(s, 'aprem') },
      { view: 'agent', text: 'Tu es en pause.', jump: 'Aller à la fin de la pause', until: (s) => ticket(s, 'Noah')?.startedAt !== undefined, then: stopClock },
      {
        view: 'agent',
        text: 'Un homme entre sans avoir scanné le QR code. Pour le garder : « Ajouter un client », avec une durée. Il attend son tour au salon.',
        until: (s) => !!guest(s),
      },
      {
        view: 'agent',
        text: 'Pendant son attente, il scanne le QR code de son ticket et s’inscrit.',
        jump: 'Aller à son inscription',
        until: (s) => guest(s)?.claimedAt !== undefined,
      },
      { view: 'agent', text: 'Les clients continuent de s’inscrire jusqu’au soir.', jump: 'Aller à la fin de journée', until: (s) => !!ticket(s, 'Lucas') },
      {
        view: 'agent',
        text: 'Lucas veut une place qui finit après ta fermeture. Il est au salon et te le demande : accepte ou refuse.',
        until: (s) => ticket(s, 'Lucas')?.overtime !== 'pending',
        // Le téléphone client est posé sur une prestation de 40 min, prêt à demander une place lui aussi.
        then: (s) => {
          stopClock(s);
          if (!myTicket(s)) s.clientNav = { screen: 'choose', fileId: AGENT_FILE_ID, preselect: ['mulet'] };
        },
      },
      {
        view: 'client',
        text: 'Côté client : Samir veut aussi passer, pour 40 min. Touche « Prendre ma place » : il finirait plus de 30 min après la fermeture, c’est refusé.',
        until: (s) => (s.clientNav.screen === 'choose' && s.clientNav.tried === true) || !!myTicket(s),
      },
      {
        view: 'agent',
        text: 'Samir a demandé une place : accepte ou refuse.',
        until: (s) => myTicket(s)?.ticket.overtime !== 'pending',
      },
      {
        view: 'agent',
        text: 'Plus personne ne s’inscrit.',
        jump: 'Aller à la fin de la dernière prestation',
        until: (s) => !inService(karim(s)) && waiting(karim(s)).every((t) => t.behavior === 'moi'),
      },
      {
        view: 'client',
        text: 'Côté client : c’est le tour de Samir. Touche Scan devant le poste.',
        until: (s) => !waiting(karim(s)).some((t) => t.behavior === 'moi'),
      },
      {
        view: 'agent',
        text: 'Dernière prestation de la journée.',
        jump: 'Aller à la fin de sa prestation',
        until: (s) => !inService(karim(s)) && waiting(karim(s)).length === 0,
      },
      { view: 'agent', text: 'Plus personne n’attend : ferme ta file.', until: (s) => !karim(s).open },
    ],
  },

  client: {
    id: 'client',
    label: 'Client : je m’inscris',
    hint: 'Scan du salon, choix du coiffeur et des prestations, création du compte, rappel, présence.',
    steps: [
      { view: 'client', text: 'Scanne le QR code du salon.', until: (s) => s.clientNav.screen !== 'home' },
      { view: 'client', text: 'Regarde l’attente de chaque coiffeur, puis choisis-en un.', until: (s) => s.clientNav.screen !== 'store' },
      { view: 'client', text: 'Choisis 1 ou plusieurs prestations, puis « Prendre ma place ».', until: (s) => s.clientNav.screen !== 'choose' },
      { view: 'client', text: 'Crée ton compte : avec Google, ou par e-mail.', until: (s) => !!myTicket(s) },
      { view: 'client', text: 'Choisis quand être prévenu, puis valide.', until: (s) => s.clientNav.screen !== 'joined' },
      {
        view: 'client',
        text: 'Tu es libre d’attendre où tu veux.',
        jump: 'Aller au rappel',
        until: (s) => myTicket(s)?.ticket.remindedAt !== undefined || myTicket(s)?.ticket.confirmedAt !== undefined,
      },
      { view: 'client', text: 'Tu es revenu au salon : touche Scan pour confirmer ta présence.', until: (s) => myTicket(s)?.ticket.confirmedAt !== undefined },
      { view: 'client', text: 'Vérifie ta prestation, puis valide.', until: (s) => s.clientNav.screen !== 'confirmed' },
      { view: 'client', text: 'Ta présence est confirmée.', jump: 'Aller à ton tour', until: (s) => myTicket(s)?.ticket.calledAt !== undefined },
      { view: 'client', text: 'Touche Scan devant le poste du coiffeur pour démarrer.', until: (s) => myTicket(s)?.ticket.startedAt !== undefined },
      { view: 'client', text: 'Ta prestation est en cours.', jump: 'Aller à la fin de la prestation', until: (s) => myTicket(s)?.ticket.doneAt !== undefined },
    ],
  },

  'pro-compte': {
    id: 'pro-compte',
    label: 'Coiffeur : je crée mon compte',
    hint: 'E-mail et code, profil, prestations, horaires et pauses de la semaine.',
    steps: [
      { view: 'agent', text: 'Le gérant a validé ton adresse. Saisis ton e-mail, puis le code reçu.', until: (s) => s.agent.loggedIn },
      { view: 'agent', text: 'Renseigne ton profil.', until: (s) => s.agent.setup !== 'profil' },
      { view: 'agent', text: 'Choisis les prestations que tu proposes et règle leur durée.', until: (s) => s.agent.setup !== 'prestations' },
      { view: 'agent', text: 'Vérifie tes horaires. Le crayon ouvre un jour : début, pauses, fin.', until: (s) => s.agent.setup === 'done' },
    ],
  },
};

export const SCENARIO_LIST = [SCENARIOS['pro-journee'], SCENARIOS.client, SCENARIOS['pro-compte']];

// ---------- États de départ ----------

const TUESDAY = 1;

function karimFile(): QueueFile {
  return {
    id: AGENT_FILE_ID,
    agentName: 'Karim',
    metier: 'Barbier',
    prestations: CATALOG.map((p) => ({ ...p })),
    pauses: [],
    open: false,
    endOfDay: h(19),
    tickets: [],
  };
}

function julieFile(): QueueFile {
  return { id: 'julie', agentName: 'Julie', metier: 'Coiffeuse', prestations: JULIE_PRESTATIONS, pauses: [], open: true, endOfDay: h(19), tickets: [] };
}

const k = (name: string, at: number, prestationIds: string[], behavior: Arrival['behavior'] = 'ponctuel'): Arrival => ({
  fileId: AGENT_FILE_ID,
  name,
  prestationIds,
  behavior,
  at,
});

/**
 * La journée de Karim. Avec les réglages par défaut (pauses à 10h30, 12h30 et 16h00, fin à 19h00) :
 * - Adam, inscrit en position 2, chevauche 10h30 : la pause du matin passe avant lui, à 10h10 ;
 * - Léo, inscrit en position 1, chevauche 12h30 : la pause de midi glisse après lui, à 12h40 ;
 * - Théo, 1er après le déjeuner pour 40 min, ne vient jamais : alerte à 13h31, décision à la reprise, 13h40 ;
 * - le poste est libre à 16h00 : la pause de l'après-midi tombe à l'heure ;
 * - Kylian finit pile à la fermeture. Lucas, inscrit à 18h20, finirait à 19h30 : le coiffeur accepte ou refuse ;
 * - après 16h15, un walk-in prend place en fin de file, puis s'inscrit dans l'application (QA-27) ;
 * Les trous entre les inscriptions de l'après-midi rattrapent un walk-in plus long que prévu.
 */
const JOURNEE: Arrival[] = [
  k('Yanis', h(9, 15), ['degrade']),
  k('Hugo', h(9, 22), ['classique']),
  k('Adam', h(9, 27), ['taper', 'barbe-express']),
  k('Rayan', h(9, 33), ['crop']),
  k('Nathan', h(9, 38), ['undercut']),
  k('Léo', h(11, 50), ['degrade']),
  k('Théo', h(12, 20), ['classique', 'barbe-express'], 'absent'),
  k('Marius', h(13, 5), ['crop']),
  k('Enzo', h(13, 20), ['buzz', 'barbe-express']),
  k('Malik', h(14, 30), ['slick']),
  k('Noah', h(16, 5), ['pompadour']),
  k('Mehdi', h(16, 40), ['taper']),
  k('Sami', h(17, 5), ['classique', 'barbe-express']),
  k('Kylian', h(17, 30), ['crop']),
  { fileId: AGENT_FILE_ID, name: 'Lucas', prestationIds: ['degrade'], behavior: 'ponctuel', beforeEnd: 40 },
  { fileId: 'julie', name: 'Claire', prestationIds: ['coupe-f'], behavior: 'ponctuel', at: h(9, 10) },
  { fileId: 'julie', name: 'Nora', prestationIds: ['brushing', 'enfant'], behavior: 'ponctuel', at: h(9, 30) },
];

export function buildScenario(id: ScenarioId): SimState {
  const kf = karimFile();
  const jf = julieFile();
  const s: SimState = {
    now: h(9),
    weekday: TUESDAY,
    files: [kf, jf],
    agent: { loggedIn: false, setup: 'done', email: 'karim@salonleclos.fr', firstName: 'Karim', lastName: 'Benali', week: defaultWeek() },
    me: { favorites: [], reminderMinutes: 10 },
    clientNav: { screen: 'home' },
    notifs: [],
    script: [],
    autoAgent: id === 'client',
    scenario: { id, beat: 0 },
    nextId: 1,
    playing: false,
  };

  if (id === 'pro-journee') {
    // Le téléphone client a déjà un compte : il sert à la fin, pour l'inscription refusée.
    s.me = { firstName: 'Samir', lastName: 'Haddad', email: 'samir.haddad@exemple.fr', favorites: ['degrade'], reminderMinutes: 10 };
    s.clientNav = { screen: 'account' };
    s.script = JOURNEE;
    s.claim = { after: 10, name: 'Ilyes', prestationIds: ['buzz', 'barbe-express'] };
    // Dans ce scénario, le compte est celui du salon, pas d'un coiffeur nommé.
    s.agent.email = 'bestbarber@barber.fr';
    s.agent.firstName = 'The Best Barber';
    s.agent.lastName = '';
    kf.agentName = 'The Best Barber';
  }

  if (id === 'client') {
    // Mardi 14h10 : Karim a repris après le déjeuner, 1 client sur le fauteuil et 2 en attente.
    s.now = h(14, 10);
    s.agent.loggedIn = true;
    kf.open = true;
    kf.pauses = [
      { id: 'matin', plannedAt: h(10, 30), minutes: 15, remindedAt: h(10, 30), startedAt: h(10, 30), endedAt: h(10, 45) },
      { id: 'midi', plannedAt: h(12, 30), minutes: 60, remindedAt: h(12, 40), startedAt: h(12, 40), endedAt: h(13, 40) },
      { id: 'aprem', plannedAt: h(16), minutes: 15 },
    ];
    kf.tickets.push(mkTicket(kf, 'Marius', ['crop'], h(13, 5), 'ponctuel', { confirmedAt: h(13, 50), startedAt: h(14) }));
    kf.tickets.push(mkTicket(kf, 'Enzo', ['buzz', 'barbe-express'], h(13, 20), 'ponctuel'));
    kf.tickets.push(mkTicket(kf, 'Malik', ['slick'], h(13, 45), 'ponctuel'));
    jf.tickets.push(mkTicket(jf, 'Claire', ['coupe-f'], h(13, 40), 'ponctuel', { confirmedAt: h(13, 50), startedAt: h(14, 5) }));
    jf.tickets.push(mkTicket(jf, 'Nora', ['brushing', 'enfant'], h(13, 55), 'ponctuel'));
    s.script = [k('Noah', h(14, 50), ['pompadour']), k('Mehdi', h(15, 30), ['taper'])];
  }

  if (id === 'pro-compte') {
    s.now = h(8, 30);
    s.agent = { loggedIn: false, setup: 'profil', email: '', firstName: '', lastName: '', week: defaultWeek() };
    kf.prestations = [];
  }

  return s;
}

// ---------- Guide ----------

export type GuideAction = Action | { type: 'scenario'; id: ScenarioId } | { type: 'jump' };

export const stepsOf = (s: SimState) => SCENARIOS[s.scenario.id].steps;
export const currentStep = (s: SimState): Step | undefined => stepsOf(s)[s.scenario.beat];

/** Le reducer de la démo : celui du moteur, plus le chargement d'un scénario et l'avancée du guide. */
export function guideReducer(state: SimState, a: GuideAction): SimState {
  let s: SimState;
  if (a.type === 'scenario') s = buildScenario(a.id);
  else if (a.type === 'jump') {
    s = structuredClone(state);
    const st = currentStep(s);
    if (st?.jump) {
      // Les notifications d'avant le saut sont périmées à l'arrivée.
      s.notifs = [];
      // 1 journée entière au plus : le saut s'arrête même si sa condition n'arrive jamais.
      advanceUntil(s, st.until, 720);
      syncClock(state, s);
    }
  } else s = reducer(state, a);

  // Une étape se valide seule dès que sa condition est vraie, que ce soit par un saut ou à la main.
  const steps = stepsOf(s);
  while (s.scenario.beat < steps.length && steps[s.scenario.beat].until(s)) {
    steps[s.scenario.beat].then?.(s);
    s.scenario.beat += 1;
  }
  return s;
}
