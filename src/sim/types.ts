// Vocabulaire : docs/02-GLOSSAIRE.md de QueueAPI.

export type Group = 'coupe' | 'barbe' | 'soin' | 'autre';

export type Prestation = { id: string; label: string; minutes: number; group: Group; description: string };

/** Comment le client simulé se comporte. `moi` = le client qui tient le téléphone. */
/** `retard` : confirme 8 min après l'alerte. `absent` : ne vient jamais. */
export type Behavior = 'moi' | 'ponctuel' | 'retard' | 'absent';

export type Ticket = {
  id: string;
  seq: number;
  name: string;
  /** Vide pour un walk-in : l'agent ne choisit qu'une durée (S44). */
  prestationIds: string[];
  /** Durée en minutes, fixée par les durées de l'agent (QA-18). */
  duration: number;
  joinedAt: number;
  behavior: Behavior;
  anonymous?: boolean;
  /** Ticket créé par l'agent pour un client entré sans scanner. Reste vrai après le rattachement. */
  walkIn?: boolean;
  /** Inscription qui finirait après la fermeture : en attente de la réponse de l'agent, puis acceptée ou refusée. */
  overtime?: 'pending' | 'accepted' | 'refused';
  /** Le walk-in a scanné le QR code de son ticket : il a maintenant un nom et des prestations (QA-27). */
  claimedAt?: number;
  confirmedAt?: number;
  /** Attente estimée à l'inscription du client, en minutes : le cercle du ticket est plein à cette valeur. Hors backlog. */
  joinWait?: number;
  /** Rappel choisi par le client, en min avant son tour : un simple « mets-toi en route ». Absent : pas de rappel. */
  reminder?: number;
  remindedAt?: number;
  /** Invitation à confirmer sa présence, 10 min avant son tour. Le re-scan du salon n'est accepté qu'à partir d'elle. */
  invitedAt?: number;
  calledAt?: number;
  lateNotifiedAt?: number;
  /** Dernière décision de l'agent sur ce retard (attendre, prendre quelqu'un d'autre). */
  lateDecidedAt?: number;
  startedAt?: number;
  /** Simulation seulement : minutes que la prestation dure réellement en plus de sa durée estimée. */
  extra?: number;
  /** Minutes ajoutées à la durée estimée : par tranches de 5 min constatées, ou annoncées par l'agent (`service.overrun`). */
  overrun?: number;
  /** Heure de passage estimée, telle que le client la connaît. Sert à le prévenir quand son tour avance. */
  eta?: number;
  doneAt?: number;
  /** Avis du client sur sa prestation, ou `skipped` s'il a choisi « Plus tard ». Hors backlog (16/11/2026). */
  rating?: Rating | 'skipped';
  abortAt?: number;
  abortReason?: 'self' | 'rejected_by_agent' | 'incident';
  rejectMotif?: string;
};

/** Avis du client. Il garde ce qu'il note : le salon, le coiffeur et la coupe. Hors backlog, QA-34. */
export type Rating = {
  stars: number;
  comment?: string;
  /** Simulation : seul le fait qu'une photo est jointe est gardé, pas l'image. */
  photo?: boolean;
  store: string;
  agentName: string;
  prestations: string[];
  at: number;
};

export type PauseId = 'matin' | 'midi' | 'aprem';

/** Pause telle que l'agent la règle : dans sa semaine type, puis à l'ouverture de sa file. */
export type PausePlan = { id: PauseId; on: boolean; at: number; minutes: number };

/** Pause de la journée en cours. */
export type Pause = {
  id: PauseId;
  /** Heure souhaitée, en minutes depuis minuit. */
  plannedAt: number;
  minutes: number;
  remindedAt?: number;
  startedAt?: number;
  /** Fin de la pause : l'agent a scanné le QR code de son poste pour reprendre. */
  endedAt?: number;
  /** L'heure de fin est passée et l'agent a été prévenu qu'il doit scanner pour reprendre. */
  endNotifiedAt?: number;
  /** Heure du scan de reprise de l'agent. Absente quand la pause a fini seule (personne ne joue le coiffeur). */
  resumedAt?: number;
  /** Minutes de retard annoncées par l'agent : elles repoussent la fin de la pause. */
  delay?: number;
  skipped?: boolean;
  /** Ticket devant lequel la pause a été placée. Une fois posé, ce choix ne bouge plus. */
  beforeTicketId?: string;
};

/** 1 jour de la semaine type. `day` : 0 = lundi. */
export type DayPlan = { day: number; works: boolean; start: number; end: number; pauses: PausePlan[] };

export type QueueFile = {
  id: string;
  agentName: string;
  metier: string;
  prestations: Prestation[];
  pauses: Pause[];
  open: boolean;
  /** Fin de journée, en minutes depuis minuit. */
  endOfDay: number;
  closedAt?: number;
  /** Heure de la notification « Plus personne n'attend » qui invite l'agent à fermer sa file. */
  closeHintAt?: number;
  /** La file a été fermée sur incident (QA-33), pas en fin de journée. */
  incident?: boolean;
  tickets: Ticket[];
  /** Démo : le cas que montre ce coiffeur, affiché sous son nom dans l'écran du salon. */
  demoTag?: string;
  /** Les demandes d'inscription après la fermeture passent par ce coiffeur (en plus de celui du téléphone). */
  decidesOvertime?: boolean;
  /** Dépassements de la journée, par prestation (S20). */
  overruns?: Record<string, number>;
};

/** Compte de l'agent qui tient la vue « Coiffeur ». */
export type AgentAccount = {
  loggedIn: boolean;
  /** Étape de création du compte. `done` : le compte est prêt. */
  setup: 'profil' | 'prestations' | 'horaires' | 'done';
  email: string;
  firstName: string;
  lastName: string;
  week: DayPlan[];
};

export type Notif = {
  id: number;
  to: 'client' | 'agent';
  title: string;
  body: string;
};

export type ClientNav =
  | { screen: 'home' }
  | { screen: 'store' }
  | { screen: 'choose'; fileId: string; preselect?: string[]; tried?: boolean; claim?: true }
  | { screen: 'signup'; fileId: string; prestationIds: string[]; claim?: true }
  | { screen: 'joined' }
  | { screen: 'account' }
  | { screen: 'confirmed' };

/** Inscription d'un client simulé, prévue par le scénario. */
export type Arrival = {
  fileId: string;
  name: string;
  prestationIds: string[];
  behavior: Behavior;
  /** Heure d'inscription. */
  at?: number;
  /** Ou : minutes avant la fin de journée de la file. */
  beforeEnd?: number;
  /** L'arrivée n'a lieu que si la fin de journée de la file est à cette heure ou plus tard. */
  minEnd?: number;
  /** Simulation seulement : minutes que sa prestation durera en plus de sa durée estimée (voir `Ticket.extra`). */
  extra?: number;
};

/**
 * Geste d'un coiffeur simulé. En données, pas en fonction : l'état est sauvegardé en JSON.
 * Il part à l'heure `at`, ou `afterMyTurn` min après que le ticket du client est en position 1, poste libre, sans confirmation.
 */
export type AgentEvent = {
  fileId: string;
  at?: number;
  afterMyTurn?: number;
  /** Heure où la condition de `afterMyTurn` est devenue vraie. */
  armedAt?: number;
  /** `leave` : le client `name` quitte la file. `announce` : retard de `minutes` annoncé sur la prestation en cours.
   * `incident` : fermeture de la file sur imprévu. `replaceMine` : l'agent prend un client présent et retire le ticket du client. */
  do: 'leave' | 'announce' | 'incident' | 'replaceMine';
  name?: string;
  minutes?: number;
};

export type ScenarioId = 'pro-journee' | 'client' | 'pro-compte';

export type SimState = {
  /** Heure simulée, en minutes depuis minuit. */
  now: number;
  /** Jour simulé. 0 = lundi. */
  weekday: number;
  files: QueueFile[];
  agent: AgentAccount;
  me: {
    firstName?: string;
    lastName?: string;
    email?: string;
    favorites: string[];
    reminderMinutes: number;
    ticketRef?: { fileId: string; ticketId: string };
    /** Le client est un walk-in : l'agent lui a créé ce ticket anonyme, il n'a pas encore scanné son QR code (QA-27). */
    walkIn?: { fileId: string; ticketId: string };
  };
  clientNav: ClientNav;
  notifs: Notif[];
  /** Ticket signalé par `customer.late`, en attente d'une décision de l'agent. */
  lateAlert?: { fileId: string; ticketId: string };
  /** Inscriptions à venir. */
  script: Arrival[];
  /** Rattachement prévu par le scénario : le walk-in qui attend depuis `after` min s'inscrit dans l'application. */
  claim?: { after: number; name: string; prestationIds: string[] };
  /** Ce que font les coiffeurs que personne ne joue, dans les scénarios client. */
  agentEvents?: AgentEvent[];
  /** Vrai quand personne ne tient le téléphone du coiffeur : il prend ses pauses seul. */
  autoAgent: boolean;
  /** Scénario en cours et étape du guide. `branch` : le coiffeur choisi dans le scénario client, qui décide du cas joué. */
  scenario: { id: ScenarioId; beat: number; branch?: string };
  nextId: number;
  playing: boolean;
};
