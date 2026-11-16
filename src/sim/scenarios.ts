import { CATALOG } from './catalog';
import { SALON_START, salonFiles, salonHook, salonSteps } from './salon';
import { AGENT_FILE_ID, MATHIS_FILE_ID, MATHIS_PRESTATIONS, defaultWeek, h } from './data';
import { advanceUntil, durationSuggestions, fileById, inService, myTicket, pauseEnd, reducer, remaining, syncClock, waiting, type Action } from './engine';
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

const agentQueue = (s: SimState) => fileById(s, AGENT_FILE_ID);
const ticket = (s: SimState, name: string) => agentQueue(s).tickets.find((t) => t.name === name);
const pause = (s: SimState, id: PauseId) => agentQueue(s).pauses.find((p) => p.id === id);
/** Vrai aussi quand l'agent a retiré cette pause de sa journée : l'étape saute. */
const pauseHandled = (s: SimState, id: PauseId) => {
  const p = pause(s, id);
  return !p || p.startedAt !== undefined || p.skipped === true;
};
const pauseCalled = (s: SimState, id: PauseId) => pauseHandled(s, id) || pause(s, id)!.remindedAt !== undefined;
/** Le walk-in qui prend place dans la file et attend son tour (pas celui pris tout de suite à la place d'un retardataire). */
const guest = (s: SimState) =>
  agentQueue(s).tickets.find((t) => t.walkIn && t.startedAt !== t.joinedAt && t.joinedAt < agentQueue(s).endOfDay - 40);
/** Arrête le temps : l'agent a quelque chose à faire. */
const stopClock = (s: SimState) => {
  s.playing = false;
};

const scanPause = 'Scanne le QR code de ton poste pour démarrer ta pause.';
const scanResume =
  'Ta pause finit dans 5 min. Scanne ton poste maintenant : le client confirmé te voit revenir et démarre 2 min après. Ou laisse filer : à la fin, le temps ralentit et tu choisis entre reprendre, annoncer un retard ou fermer ta file.';
/** Il reste 5 min de pause ou moins (ou elle est déjà reprise, ou n'a pas eu lieu). */
const pauseNear = (s: SimState, id: PauseId) => {
  const p = pause(s, id);
  return !p || p.skipped === true || p.endedAt !== undefined || (p.startedAt !== undefined && s.now >= pauseEnd(p) - 5);
};
/** Un client a démarré après le scan de reprise de cette pause. */
const startedAfterResume = (s: SimState, id: PauseId) => {
  const p = pause(s, id);
  return p?.endedAt !== undefined && agentQueue(s).tickets.some((t) => t.startedAt !== undefined && t.startedAt >= p.endedAt!);
};
const announceLeo = 'Léo veut un dégradé avec un motif : ce sera plus long que prévu. Touche sa carte et annonce un retard.';
/** Léo a un retard annoncé ou constaté, ou n'est plus à servir. */
const leoHandled = (s: SimState) => {
  const t = ticket(s, 'Léo');
  return !t || t.doneAt !== undefined || t.abortAt !== undefined || (t.overrun ?? 0) > 0;
};
/** L'agent a scanné pour reprendre, ou la pause n'a pas eu lieu. */
const pauseResumed = (s: SimState, id: PauseId) => {
  const p = pause(s, id);
  return !p || p.skipped === true || p.endedAt !== undefined;
};

// ---------- Les 3 scénarios ----------

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  'pro-journee': {
    id: 'pro-journee',
    label: 'Coiffeur : ma journée',
    hint: 'The Best Barber ouvre sa file à 9h00. Clients, 3 pauses, un retard, des walk-in, la fermeture.',
    steps: [
      { view: 'agent', text: 'Connecte-toi : ton e-mail, puis le code reçu par e-mail.', until: (s) => s.agent.loggedIn },
      { view: 'agent', text: 'Scanne le QR code de ton poste, puis valide tes prestations, tes pauses et ton heure de fin.', until: (s) => agentQueue(s).open },
      { view: 'agent', text: 'Ta file est vide.', jump: 'Aller à 9h15 : 1er client', until: (s) => s.now >= h(9, 15) && !!ticket(s, 'Louis') },
      { view: 'agent', text: 'Louis est inscrit, déjà au salon.', jump: 'Louis scanne le QR du poste', until: (s) => ticket(s, 'Louis')?.startedAt !== undefined },
      { view: 'agent', text: 'Sa prestation tourne.', jump: 'Aller à 9h40 : 4 inscriptions', until: (s) => s.now >= h(9, 40) },
      {
        view: 'agent',
        text: 'Regarde où ta pause du matin s’est placée dans la file. Louis va dépasser : à 5 min de dépassement, les clients qui passent bientôt et ne sont pas au salon sont prévenus, sans geste de ta part.',
        jump: 'Aller à la pause du matin',
        until: (s) => pauseCalled(s, 'matin'),
      },
      { view: 'agent', text: scanPause, until: (s) => pauseHandled(s, 'matin') },
      { view: 'agent', text: 'Tu es en pause.', jump: 'Aller à 5 min de la fin de la pause', until: (s) => pauseNear(s, 'matin') },
      { view: 'agent', text: scanResume, until: (s) => pauseResumed(s, 'matin') || !agentQueue(s).open },
      {
        view: 'agent',
        text: 'Adam te voit revenir et scanne le QR du poste : taper fade et barbe.',
        jump: 'Aller au tour de Léo',
        // Après un gros retard le matin, la pause de midi peut passer avant Léo : l'étape suivante saute alors.
        until: (s) => ticket(s, 'Léo')?.startedAt !== undefined || pauseCalled(s, 'midi'),
        then: stopClock,
      },
      {
        view: 'agent',
        text: announceLeo,
        until: (s) => ticket(s, 'Léo')?.startedAt === undefined || leoHandled(s),
      },
      { view: 'agent', text: 'Les clients concernés sont prévenus et la file est recalculée.', jump: 'Aller à la pause de midi', until: (s) => pauseCalled(s, 'midi') },
      { view: 'agent', text: scanPause, until: (s) => pauseHandled(s, 'midi') },
      { view: 'agent', text: 'Tu déjeunes.', jump: 'Aller à 5 min de la reprise', until: (s) => pauseNear(s, 'midi') },
      { view: 'agent', text: scanResume, until: (s) => pauseResumed(s, 'midi') || !agentQueue(s).open },
      // Si la pause de midi est passée avant Léo (coiffeur en retard le matin), l'annonce de son retard se fait ici.
      // Sinon ces 2 étapes sautent : Léo a déjà démarré, et son retard est déjà annoncé ou constaté.
      {
        view: 'agent',
        text: 'Léo passe bientôt : sa prestation sera plus longue que prévu.',
        jump: 'Aller au tour de Léo',
        until: (s) => ticket(s, 'Léo')?.startedAt !== undefined || leoHandled(s),
        then: (s) => {
          if (!leoHandled(s)) stopClock(s);
        },
      },
      { view: 'agent', text: announceLeo, until: leoHandled },
      // Après un retard annoncé le matin, la pause de midi peut passer avant Léo : Théo n'est alors plus le 1er
      // à la reprise. L'étape attend qu'il soit en position 1, poste libre. Sinon, elle saute.
      {
        view: 'agent',
        text: 'Tu as repris. Théo, inscrit à 12h20, est le prochain.',
        jump: 'Aller au tour de Théo',
        until: (s) => ticket(s, 'Théo')?.lateNotifiedAt !== undefined && !inService(agentQueue(s)) && waiting(agentQueue(s))[0]?.name === 'Théo',
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
      { view: 'agent', text: 'Tu es en pause.', jump: 'Aller à 5 min de la fin de la pause', until: (s) => pauseNear(s, 'aprem') },
      { view: 'agent', text: scanResume, until: (s) => pauseResumed(s, 'aprem') || !agentQueue(s).open },
      // Le 1er client après la reprise dépend du retard pris par le coiffeur. File vide à la reprise : l'étape saute.
      {
        view: 'agent',
        text: 'Le client confirmé te voit revenir : il scanne le QR du poste dans 2 min.',
        until: (s) =>
          startedAfterResume(s, 'aprem') ||
          pause(s, 'aprem')?.skipped === true ||
          (pauseResumed(s, 'aprem') && !inService(agentQueue(s)) && waiting(agentQueue(s)).every((t) => t.confirmedAt === undefined)),
        then: stopClock,
      },
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
        text: 'Côté client : Romain veut aussi passer, pour 40 min. Touche « Prendre ma place ». Fermeture à 19h00 : il finirait plus de 30 min après, c’est refusé d’office. Fermeture à 20h00 ou plus tard : sa demande arrive chez toi.',
        until: (s) => (s.clientNav.screen === 'choose' && s.clientNav.tried === true) || !!myTicket(s),
      },
      {
        view: 'agent',
        text: 'Romain a demandé une place : accepte ou refuse.',
        until: (s) => myTicket(s)?.ticket.overtime !== 'pending',
      },
      {
        view: 'agent',
        text: 'Plus personne ne s’inscrit.',
        jump: 'Aller à 5 min de la fin de la dernière prestation',
        until: (s) => waiting(agentQueue(s)).every((t) => t.behavior === 'moi') && remaining(agentQueue(s), s.now) <= 5,
      },
      {
        view: 'client',
        text: 'Côté client : c’est le tour de Romain. Touche Scan devant le poste.',
        until: (s) => !waiting(agentQueue(s)).some((t) => t.behavior === 'moi'),
      },
      {
        view: 'agent',
        text: 'Dernière prestation de la journée.',
        jump: 'Aller à 5 min de la fin de sa prestation',
        until: (s) => waiting(agentQueue(s)).length === 0 && remaining(agentQueue(s), s.now) <= 5,
        // Le temps repart : sans geste du coiffeur, la prestation finit et la notification de fermeture arrive.
        then: (s) => {
          if (agentQueue(s).open) s.playing = true;
        },
      },
      {
        view: 'agent',
        text: 'Dernière prestation, 5 min au plus. Touche « Fermer ma file » pour la terminer et fermer, ou attends sa fin : une notification t’invitera à fermer.',
        until: (s) => !agentQueue(s).open,
      },
      {
        view: 'agent',
        text: 'Ta file est fermée. Ton dégradé a dépassé 2 fois aujourd’hui : réponds à la suggestion.',
        until: (s) => durationSuggestions(agentQueue(s)).length === 0,
      },
    ],
  },

  // Les étapes viennent du coiffeur choisi : voir `salon.ts`.
  client: {
    id: 'client',
    label: 'Client : je m’inscris',
    hint: '8 coiffeurs, 8 cas : parcours normal, premier de la file, retard du coiffeur, tour qui avance, client en retard, après la fermeture, imprévu, walk-in.',
    steps: [],
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

function agentQueueFile(): QueueFile {
  return {
    id: AGENT_FILE_ID,
    agentName: 'Antoine',
    metier: 'Barbier',
    prestations: CATALOG.map((p) => ({ ...p })),
    pauses: [],
    open: false,
    endOfDay: h(19),
    tickets: [],
  };
}

function mathisFile(): QueueFile {
  return { id: MATHIS_FILE_ID, agentName: 'Mathis', metier: 'Barbier', prestations: MATHIS_PRESTATIONS, pauses: [], open: true, endOfDay: h(19), tickets: [] };
}

const k = (name: string, at: number, prestationIds: string[], behavior: Arrival['behavior'] = 'ponctuel'): Arrival => ({
  fileId: AGENT_FILE_ID,
  name,
  prestationIds,
  behavior,
  at,
});

/** Client du soir : il ne vient que si le coiffeur a fixé sa fin de journée à `minEnd` ou plus tard. */
const evening = (name: string, at: number, prestationIds: string[], minEnd: number): Arrival => ({ ...k(name, at, prestationIds), minEnd });

/**
 * La journée du coiffeur. Avec les réglages par défaut (pauses à 10h30, 12h30 et 16h00, fin à 19h00), en reprenant
 * dès chaque saut de fin de pause :
 * - Louis (dégradé) dure 7 min de plus que prévu : 5 min de retard constatées à 9h50, 1er dépassement (S20) ;
 * - Adam, inscrit en position 2, chevauche 10h30 : la pause du matin passe avant lui, à 10h17 ;
 * - Léo (dégradé) démarre à 12h14 et dure 10 min de plus : le coiffeur annonce le retard, 2e dépassement ;
 * - Léo, en position 1, chevauche 12h30 : la pause de midi glisse après lui, à 12h54 ;
 * - Théo, 1er après le déjeuner pour 40 min, ne vient jamais : décision à la reprise, 13h49 ;
 * - après la fermeture, la suggestion propose de passer le dégradé de 30 à 35 min ;
 * - le poste est libre à 16h00 : la pause de l'après-midi tombe à l'heure ;
 * - Kylian finit pile à la fermeture. Lucas, inscrit à 18h20, finirait à 19h30 : le coiffeur accepte ou refuse ;
 * - après 16h15, un walk-in prend place en fin de file, puis s'inscrit dans l'application (QA-27) ;
 * Les trous entre les inscriptions de l'après-midi rattrapent un walk-in plus long que prévu.
 *
 * Fin de journée plus tardive : Lucas arrive 40 min avant la fermeture, la file est vide et il s'inscrit
 * normalement. La demande du téléphone client (40 min) finit alors 30 min après la fermeture : elle arrive
 * chez le coiffeur. À 21h00, 22h00 et 23h00, 2 clients du soir par heure en plus occupent le coiffeur
 * et repartent avant l'arrivée de Lucas (fermeture - 40 min). Les fins à 19h00 et 20h00 n'en ont pas.
 */
const JOURNEE: Arrival[] = [
  { ...k('Louis', h(9, 15), ['degrade']), extra: 7 },
  k('Hugo', h(9, 22), ['classique']),
  k('Adam', h(9, 27), ['taper', 'barbe-express']),
  k('Jules', h(9, 33), ['crop']),
  k('Nathan', h(9, 38), ['undercut']),
  { ...k('Léo', h(11, 50), ['degrade']), extra: 10 },
  k('Théo', h(12, 20), ['classique', 'barbe-express'], 'absent'),
  k('Marius', h(13, 5), ['crop']),
  k('Enzo', h(13, 20), ['buzz', 'barbe-express']),
  k('Arthur', h(14, 30), ['slick']),
  k('Noah', h(16, 5), ['pompadour']),
  k('Maxime', h(16, 40), ['taper']),
  k('Paul', h(17, 5), ['classique', 'barbe-express']),
  k('Kylian', h(17, 30), ['crop']),
  evening('Victor', h(19, 10), ['crop'], h(21)),
  evening('Baptiste', h(19, 40), ['classique'], h(21)),
  evening('Clément', h(20, 10), ['crop'], h(22)),
  evening('Valentin', h(20, 40), ['classique'], h(22)),
  evening('Martin', h(21, 10), ['crop'], h(23)),
  evening('Alexandre', h(21, 40), ['classique'], h(23)),
  { fileId: AGENT_FILE_ID, name: 'Lucas', prestationIds: ['degrade'], behavior: 'ponctuel', beforeEnd: 40 },
  { fileId: MATHIS_FILE_ID, name: 'Bastien', prestationIds: ['degrade'], behavior: 'ponctuel', at: h(9, 10) },
  { fileId: MATHIS_FILE_ID, name: 'Rémi', prestationIds: ['taper', 'barbe-express'], behavior: 'ponctuel', at: h(9, 30) },
];

export function buildScenario(id: ScenarioId): SimState {
  const kf = agentQueueFile();
  const mf = mathisFile();
  const s: SimState = {
    now: h(9),
    weekday: TUESDAY,
    files: [kf, mf],
    agent: { loggedIn: false, setup: 'done', email: 'antoine@salonleclos.fr', firstName: 'Antoine', lastName: 'Lefèvre', week: defaultWeek() },
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
    s.me = { firstName: 'Romain', lastName: 'Girard', email: 'romain.girard@exemple.fr', favorites: ['degrade'], reminderMinutes: 10 };
    s.clientNav = { screen: 'account' };
    s.script = JOURNEE;
    s.claim = { after: 10, name: 'Tom', prestationIds: ['buzz', 'barbe-express'] };
    // Dans ce scénario, le compte est celui du salon, pas d'un coiffeur nommé.
    s.agent.email = 'bestbarber@barber.fr';
    s.agent.firstName = 'The Best Barber';
    s.agent.lastName = '';
    kf.agentName = 'The Best Barber';
  }

  if (id === 'client') {
    s.now = SALON_START;
    s.agent.loggedIn = true;
    s.files = salonFiles();
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

export const stepsOf = (s: SimState) => (s.scenario.id === 'client' ? salonSteps(s) : SCENARIOS[s.scenario.id].steps);
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
  if (s.scenario.id === 'client') s = salonHook(s);

  // Une étape se valide seule dès que sa condition est vraie, que ce soit par un saut ou à la main.
  const steps = stepsOf(s);
  while (s.scenario.beat < steps.length && steps[s.scenario.beat].until(s)) {
    steps[s.scenario.beat].then?.(s);
    s.scenario.beat += 1;
  }
  // Fermer sa file sur imprévu (QA-33) est une issue possible de la journée : le scénario s'arrête là.
  if (fileById(s, AGENT_FILE_ID).incident) s.scenario.beat = steps.length;
  return s;
}
