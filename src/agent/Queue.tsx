import { useEffect, useState } from 'react';
import { PAUSE_LABEL } from '../sim/data';
import {
  fmt,
  fmtDuration,
  inService,
  pauseDue,
  pauseEnd,
  pendingOvertime,
  prestationsOf,
  projectedStart,
  remainingRaw,
  runningPause,
  ticketLabel,
  timeline,
  totalWait,
  waitFor,
  waiting,
} from '../sim/engine';
import { useSim } from '../sim/store';
import type { Pause, QueueFile, Ticket } from '../sim/types';
import { PauseIcon, PrestationIcon } from '../ui/icons';
import { BarberPole, DurationWheel, QrFake, Sheet, useScan } from '../ui/kit';

type Panel =
  | { kind: 'ticket'; ticket: Ticket }
  | { kind: 'pause'; pause: Pause }
  | { kind: 'walkin' }
  | { kind: 'close' }
  | { kind: 'late' }
  | { kind: 'delay'; pause: Pause }
  | { kind: 'incident' }
  | null;

/** Pourquoi la pause ne tombe pas à l'heure souhaitée. `start` : l'heure où elle est placée. */
function pauseNote(file: QueueFile, p: Pause, start: number) {
  const d = start - p.plannedAt;
  if (d === 0) return `À l’heure souhaitée, ${fmt(p.plannedAt)}.`;
  if (d > 0) return `${d} min après l’heure souhaitée (${fmt(p.plannedAt)}) : une prestation passait d’abord.`;
  const next = file.tickets.find((t) => t.id === p.beforeTicketId);
  return `${-d} min avant l’heure souhaitée (${fmt(p.plannedAt)})${next ? `, pour ne pas couper la prestation de ${next.name}` : ''}.`;
}

export function QueueScreen({ file }: { file: QueueFile }) {
  const { s, dispatch } = useSim();
  const scan = useScan();
  const [panel, setPanel] = useState<Panel>(null);
  const cur = inService(file);
  const list = waiting(file);
  const late = s.lateAlert && file.tickets.find((t) => t.id === s.lateAlert!.ticketId);
  const run = runningPause(file);
  const due = pauseDue(file, s.now);
  // La pause en cours et la pause à prendre ont leur carte : la liste montre la suite.
  const slots = timeline(file, s.now).filter((x) => !(x.kind === 'pause' && (x.pause.id === run?.id || x.pause.id === due?.id)));
  const startPause = (p: Pause) => scan.start('QR du poste de ' + file.agentName, () => dispatch({ type: 'startPause', id: p.id }));
  const resume = () => scan.start('QR du poste de ' + file.agentName, () => dispatch({ type: 'resume' }));
  // QA-28, décision de Gabi le 16/11/2026 : la fermeture se fait depuis l'application, sans scan du poste.
  // En cas de problème, l'agent doit pouvoir fermer depuis son téléphone, même loin de son poste.
  const close = (current?: 'terminer' | 'rejeter') => {
    setPanel(null);
    dispatch({ type: 'closeFile', current });
  };

  // L'alerte de retard a disparu (client arrivé, retiré) : son panneau se ferme.
  useEffect(() => {
    if (!late && panel?.kind === 'late') setPanel(null);
  }, [late, panel]);

  let n = 0;
  return (
    <main className="screen with-footer agent-queue">
      <header className="agent-head">
        <span className="avatar" aria-hidden>
          {file.agentName[0]}
        </span>
        <span>
          <strong>Ma file</strong>
          <span className="muted">Ouverte jusqu&rsquo;à {fmt(file.endOfDay)}</span>
        </span>
        <span className="agent-stat">
          <strong>{totalWait(file, s.now)} min</strong>
          <span className="muted">d&rsquo;attente</span>
        </span>
      </header>

      {late && (
        <button className="banner banner-late" onClick={() => setPanel({ kind: 'late' })}>
          <strong>{late.name} n&rsquo;a pas confirmé</strong>
          <span>{waitFor(file, late.id, s.now) > 0 ? `Son tour est dans ${waitFor(file, late.id, s.now)} min.` : 'C’est son tour et il n’est pas là.'} Touche pour décider.</span>
        </button>
      )}

      {pendingOvertime(file).map((t) => {
        const start = projectedStart(file, s.now, t.duration);
        const end = start + t.duration;
        return (
          <section key={t.id} className="banner banner-pause">
            <strong>{t.name} demande une place après ta fermeture</strong>
            <span>
              {ticketLabel(file, t)}, {t.duration} min. Il passerait vers {fmt(start)} et finirait vers {fmt(end)}, {end - file.endOfDay} min après ta
              fermeture. Il est au salon : il peut te parler.
            </span>
            <div className="banner-actions banner-actions-even">
              <button className="btn btn-primary" onClick={() => dispatch({ type: 'decideOvertime', ticketId: t.id, accept: true })}>
                Accepter
              </button>
              <button className="btn btn-outline" onClick={() => dispatch({ type: 'decideOvertime', ticketId: t.id, accept: false })}>
                Refuser
              </button>
            </div>
          </section>
        );
      })}

      {due && (
        <section className="banner banner-pause">
          <strong>{PAUSE_LABEL[due.id]} : c&rsquo;est le moment</strong>
          <span>
            {fmtDuration(due.minutes)}. {pauseNote(file, due, due.remindedAt ?? s.now)}
          </span>
          <div className="banner-actions">
            <button className="btn btn-brass" onClick={() => startPause(due)}>
              Scanner pour démarrer
            </button>
            <button className="btn btn-outline" onClick={() => dispatch({ type: 'skipPause', id: due.id })}>
              Sauter
            </button>
          </div>
        </section>
      )}

      {run ? (
        <PauseCard
          pause={run}
          onResume={resume}
          onDelay={() => setPanel({ kind: 'delay', pause: run })}
          onIncident={() => setPanel({ kind: 'incident' })}
        />
      ) : cur ? (
        <CurrentCard file={file} ticket={cur} onOpen={() => setPanel({ kind: 'ticket', ticket: cur })} />
      ) : (
        <p className="empty-chair">Personne sur le fauteuil.</p>
      )}

      <h2 className="section">{list.length === 0 ? 'Personne n’attend' : `${list.length} en attente`}</h2>
      <ol className="queue">
        {slots.map((slot) => {
          if (slot.kind === 'pause')
            return (
              <li key={slot.pause.id}>
                <button className="queue-row queue-pause" onClick={() => setPanel({ kind: 'pause', pause: slot.pause })}>
                  <span className="queue-pos" aria-hidden>
                    <PauseIcon />
                  </span>
                  <span className="queue-who">
                    <strong>{PAUSE_LABEL[slot.pause.id]}</strong>
                    <span className="muted">
                      {fmtDuration(slot.pause.minutes)}
                      {slot.start !== slot.pause.plannedAt && `, souhaitée à ${fmt(slot.pause.plannedAt)}`}
                    </span>
                  </span>
                  <span className="queue-side">
                    {slot.start !== slot.pause.plannedAt && (
                      <span className="chip chip-late">{slot.start < slot.pause.plannedAt ? 'Avancée' : 'Décalée'}</span>
                    )}
                    <span className="muted small">vers {fmt(slot.start)}</span>
                  </span>
                </button>
              </li>
            );
          const t = slot.ticket;
          n += 1;
          return (
            <li key={t.id}>
              <button className="queue-row" onClick={() => setPanel({ kind: 'ticket', ticket: t })}>
                <span className="queue-pos">{n}</span>
                <span className="queue-who">
                  <strong>
                    {t.name}
                    {s.me.ticketRef?.ticketId === t.id && <span className="you"> (le téléphone client)</span>}
                    {t.claimedAt !== undefined && <span className="you"> (walk-in, inscrit à {fmt(t.claimedAt)})</span>}
                  </strong>
                  <span className="muted">
                    {ticketLabel(file, t)}, {t.duration} min
                  </span>
                </span>
                <span className="queue-side">
                  <span className={`chip ${t.confirmedAt !== undefined ? 'chip-ok' : t.lateNotifiedAt !== undefined ? 'chip-late' : 'chip-wait'}`}>
                    {t.confirmedAt !== undefined ? 'Confirmé' : t.lateNotifiedAt !== undefined ? 'En retard' : 'En route'}
                  </span>
                  <span className="muted small">vers {fmt(slot.start)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <footer className="footer footer-2">
        <button className="btn btn-outline" onClick={() => setPanel({ kind: 'close' })}>
          Fermer ma file
        </button>
        <button className="btn btn-primary" onClick={() => setPanel({ kind: 'walkin' })}>
          Ajouter un client
        </button>
      </footer>

      {panel?.kind === 'late' && late && <LateSheet file={file} ticket={late} onClose={() => setPanel(null)} />}
      {panel?.kind === 'ticket' && <TicketSheet file={file} ticket={panel.ticket} onClose={() => setPanel(null)} />}
      {panel?.kind === 'pause' && (
        <PauseSheet
          file={file}
          pause={panel.pause}
          onClose={() => setPanel(null)}
          onStart={(p) => {
            setPanel(null);
            startPause(p);
          }}
        />
      )}
      {panel?.kind === 'walkin' && <WalkInSheet file={file} onClose={() => setPanel(null)} />}
      {panel?.kind === 'close' && <CloseSheet file={file} onClose={() => setPanel(null)} onConfirm={close} />}
      {panel?.kind === 'delay' && run && <DelaySheet file={file} pause={run} onClose={() => setPanel(null)} />}
      {panel?.kind === 'incident' && <IncidentSheet file={file} onClose={() => setPanel(null)} />}
      {scan.node}
    </main>
  );
}

function CurrentCard({ file, ticket, onOpen }: { file: QueueFile; ticket: Ticket; onOpen: () => void }) {
  const { s } = useSim();
  const rem = remainingRaw(file, s.now);
  const elapsed = s.now - ticket.startedAt!;
  const prestations = prestationsOf(file, ticket.prestationIds);
  return (
    <button className="current" onClick={onOpen}>
      <span className="current-top">
        <span>
          <span className="muted">Sur le fauteuil</span>
          <strong>{ticket.name}</strong>
        </span>
        <span className={rem < 0 ? 'over' : ''}>{rem >= 0 ? `encore ${rem} min` : `${-rem} min de plus que prévu`}</span>
      </span>
      <BarberPole ratio={elapsed / ticket.duration} over={rem < 0} />
      {prestations.length > 0 ? (
        <span className="current-prestas">
          {prestations.map((p) => (
            <span key={p.id}>
              <PrestationIcon id={p.id} size={36} />
              {p.label}
            </span>
          ))}
        </span>
      ) : (
        <span className="muted small">Walk-in, {ticket.duration} min</span>
      )}
    </button>
  );
}

function PauseCard({ pause, onResume, onDelay, onIncident }: { pause: Pause; onResume: () => void; onDelay: () => void; onIncident: () => void }) {
  const { s } = useSim();
  const left = pauseEnd(pause) - s.now;
  const total = pause.minutes + (pause.delay ?? 0);
  const ratio = Math.min(1, (s.now - pause.startedAt!) / total);
  return (
    <section className="pausecard">
      <span className="current-top">
        <span>
          <span className="muted">En pause</span>
          <strong>{PAUSE_LABEL[pause.id]}</strong>
        </span>
        <span className={left < 0 ? 'over' : ''}>{left > 0 ? `encore ${left} min` : left === 0 ? 'terminée' : `${-left} min de retard`}</span>
      </span>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${Math.max(4, ratio * 100)}%` }} />
      </div>
      {left > 0 ? (
        <span className="muted small">
          Commencée à {fmt(pause.startedAt!)}, reprise prévue à {fmt(pauseEnd(pause))}
          {pause.delay ? `, avec ${pause.delay} min de retard annoncées` : ''}. Les clients voient l&rsquo;attente avec ta pause.
        </span>
      ) : (
        <span className="small">
          Finie à {fmt(pauseEnd(pause))}. Scanne le QR code de ton poste pour reprendre : tant que tu ne l&rsquo;as pas fait, aucun client ne peut
          démarrer sa prestation. Si tu n&rsquo;es pas là, préviens tes clients.
        </span>
      )}
      <button className={left > 0 ? 'btn btn-outline' : 'btn btn-brass'} onClick={onResume}>
        Scanner pour reprendre
      </button>
      <button className="btn btn-outline" onClick={onDelay}>
        Prévenir d&rsquo;un retard
      </button>
      {left <= 0 && (
        <button className="btn btn-danger-outline" onClick={onIncident}>
          Fermer ma file : imprévu
        </button>
      )}
    </section>
  );
}

/** Retard au retour de pause (QA-32) : l'agent choisit combien de minutes il annonce. */
function DelaySheet({ file, pause, onClose }: { file: QueueFile; pause: Pause; onClose: () => void }) {
  const { s, dispatch } = useSim();
  const [minutes, setMinutes] = useState(10);
  const back = Math.max(s.now, pauseEnd(pause)) + minutes;
  const n = waiting(file).length;
  return (
    <Sheet title="Prévenir d’un retard" onClose={onClose}>
      <p className="muted">Combien de minutes de retard annonces-tu ?</p>
      <DurationWheel label="Retard annoncé" value={minutes} onChange={setMinutes} />
      <p className="muted small">
        Tu reprendras vers <strong>{fmt(back)}</strong>.{' '}
        {n > 0 ? `${n} ${n > 1 ? 'clients sont prévenus' : 'client est prévenu'} et leurs heures de passage sont recalculées.` : 'Personne n’attend.'} À
        cette heure-là, tu scanneras ton poste pour reprendre.
      </p>
      <button
        className="btn btn-primary btn-lg"
        onClick={() => {
          dispatch({ type: 'declareDelay', minutes });
          onClose();
        }}
      >
        Annoncer {minutes} min de retard
      </button>
    </Sheet>
  );
}

/** Fermeture sur incident (QA-33) : tous les clients sortent de la file et sont prévenus. */
function IncidentSheet({ file, onClose }: { file: QueueFile; onClose: () => void }) {
  const { dispatch } = useSim();
  const n = waiting(file).length + pendingOvertime(file).length;
  return (
    <Sheet title="Fermer ma file pour aujourd’hui" onClose={onClose}>
      <p>Un imprévu t&rsquo;empêche de revenir ?</p>
      <p className="muted">
        {n > 0
          ? `${n} ${n > 1 ? 'clients sortent de la file. Ils sont prévenus' : 'client sort de la file. Il est prévenu'} tout de suite que tu as dû fermer.`
          : 'Personne n’attend.'}{' '}
        Plus personne ne pourra s&rsquo;inscrire chez toi aujourd&rsquo;hui.
      </p>
      <button className="btn btn-danger-outline btn-lg" onClick={() => dispatch({ type: 'incidentClose' })}>
        Fermer ma file
      </button>
      <button className="btn btn-outline btn-lg" onClick={onClose}>
        Annuler
      </button>
    </Sheet>
  );
}

/** Pause à venir : la prendre plus tôt, ou la sauter. */
function PauseSheet({ file, pause, onClose, onStart }: { file: QueueFile; pause: Pause; onClose: () => void; onStart: (p: Pause) => void }) {
  const { s, dispatch } = useSim();
  const slot = timeline(file, s.now).find((x) => x.kind === 'pause' && x.pause.id === pause.id);
  const cur = inService(file);
  const blocked = runningPause(file) !== undefined;
  return (
    <Sheet title={PAUSE_LABEL[pause.id]} onClose={onClose}>
      <p>
        {fmtDuration(pause.minutes)}, prévue vers <strong>{fmt(slot?.start ?? pause.plannedAt)}</strong>.
      </p>
      {slot && <p className="muted">{pauseNote(file, pause, slot.start)}</p>}
      <button className="btn btn-primary btn-lg" disabled={blocked} onClick={() => onStart(pause)}>
        La démarrer maintenant
      </button>
      {cur && !blocked && <p className="muted small">La prestation de {cur.name} sera clôturée.</p>}
      <button
        className="btn btn-outline btn-lg"
        onClick={() => {
          dispatch({ type: 'skipPause', id: pause.id });
          onClose();
        }}
      >
        Sauter cette pause
      </button>
    </Sheet>
  );
}

const MOTIFS = ['Client absent', 'Prestation impossible aujourd’hui', 'Comportement'];

function TicketSheet({ file, ticket, onClose }: { file: QueueFile; ticket: Ticket; onClose: () => void }) {
  const { s, dispatch } = useSim();
  const [rejecting, setRejecting] = useState(false);
  // Relire le ticket : il a pu changer depuis l'ouverture du panneau.
  const t = file.tickets.find((x) => x.id === ticket.id) ?? ticket;
  const isCurrent = t.startedAt !== undefined && t.doneAt === undefined;
  const isFirst = waiting(file)[0]?.id === t.id;
  const canTake = !isCurrent && t.abortAt === undefined && (t.confirmedAt !== undefined || t.anonymous);

  const gone = t.abortAt !== undefined || t.doneAt !== undefined;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
  if (gone) return null;

  return (
    <Sheet title={t.name} onClose={onClose}>
      <p className="muted">
        {ticketLabel(file, t)}, {t.duration} min. Inscrit à {fmt(t.joinedAt)}.
      </p>
      {!rejecting ? (
        <>
          {canTake && (
            <button
              className="btn btn-primary btn-lg"
              onClick={() => {
                dispatch({ type: 'agentStart', ticketId: t.id });
                onClose();
              }}
            >
              {isFirst ? 'Démarrer sa prestation' : 'Le prendre maintenant'}
            </button>
          )}
          {canTake && !isFirst && <p className="muted small">Les clients devant gardent leur place.</p>}
          {t.anonymous && t.confirmedAt === undefined && !isCurrent && (
            <button className="btn btn-outline btn-lg" onClick={() => dispatch({ type: 'agentConfirm', ticketId: t.id })}>
              Il est au salon : confirmer
            </button>
          )}
          <button className="btn btn-danger-outline btn-lg" onClick={() => setRejecting(true)}>
            Retirer de la file
          </button>
          {s.me.ticketRef?.ticketId === t.id && <p className="muted small">C&rsquo;est le ticket du téléphone client : il le verra tout de suite.</p>}
        </>
      ) : (
        <>
          <p>Pourquoi ? Le client verra ce motif.</p>
          {MOTIFS.map((m) => (
            <button
              key={m}
              className="btn btn-outline btn-lg"
              onClick={() => {
                dispatch({ type: 'reject', ticketId: t.id, motif: m });
                onClose();
              }}
            >
              {m}
            </button>
          ))}
        </>
      )}
    </Sheet>
  );
}

/** Décision après `customer.late` (S37), plus le walk-in pris à la place (S44). */
function LateSheet({ file, ticket, onClose }: { file: QueueFile; ticket: Ticket; onClose: () => void }) {
  const { s, dispatch } = useSim();
  const [stage, setStage] = useState<'menu' | 'present' | 'walkin'>('menu');
  const [minutes, setMinutes] = useState(20);
  const present = waiting(file).filter((t) => t.id !== ticket.id && (t.confirmedAt !== undefined || t.anonymous));
  const wait = waitFor(file, ticket.id, s.now);
  const run = runningPause(file);
  const pauseLeft = run ? pauseEnd(run) - s.now : 0;

  if (stage === 'walkin')
    return (
      <Sheet title="Prendre un walk-in" onClose={onClose}>
        <p className="muted">
          Quelqu&rsquo;un vient d&rsquo;entrer sans être dans ta file. Prends-le pendant que {ticket.name} n&rsquo;est pas là : tu n&rsquo;attends pas pour rien.
        </p>
        <DurationWheel label="Durée de la prestation" value={minutes} onChange={setMinutes} />
        <p className="muted small">
          Il passe tout de suite, jusqu&rsquo;à {fmt(s.now + minutes)}, à la place de {ticket.name} ({ticket.duration} min prévues). Les heures de
          toute la file sont recalculées.
          {pauseLeft > 0 && ` Ta pause s’arrête maintenant, ${pauseLeft} min avant la fin.`}
        </p>
        <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'walkIn', minutes, startNow: true, rejectLate: true })}>
          Valider et retirer {ticket.name}
        </button>
        <button className="btn btn-outline btn-lg" onClick={() => dispatch({ type: 'walkIn', minutes, startNow: true })}>
          Valider, {ticket.name} garde sa place
        </button>
      </Sheet>
    );

  return (
    <Sheet title={`${ticket.name} n’a pas confirmé`} onClose={onClose}>
      <p>
        {wait > 0 ? (
          <>
            Son tour est dans <strong>{wait} min</strong>
          </>
        ) : (
          <strong>C&rsquo;est son tour</strong>
        )}{' '}
        {ticket.anonymous ? (
          <>et personne n&rsquo;a confirmé que ce walk-in est toujours au salon.</>
        ) : (
          <>et {ticket.name} n&rsquo;a pas rescanné le QR code de l&rsquo;entrée.</>
        )}
      </p>
      {stage === 'menu' ? (
        <>
          {ticket.anonymous && (
            <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'agentConfirm', ticketId: ticket.id })}>
              Il est au salon : confirmer
            </button>
          )}
          <button className={`btn ${ticket.anonymous ? 'btn-outline' : 'btn-primary'} btn-lg`} onClick={() => setStage('walkin')}>
            Prendre un walk-in
          </button>
          <button className="btn btn-outline btn-lg" onClick={() => dispatch({ type: 'dismissLate' })}>
            Attendre {ticket.name}
          </button>
          <button className="btn btn-outline btn-lg" disabled={present.length === 0} onClick={() => setStage('present')}>
            Prendre un client de la file
          </button>
          {present.length === 0 && <p className="muted small">Aucun client confirmé derrière {ticket.name} pour l&rsquo;instant.</p>}
          <button className="btn btn-danger-outline btn-lg" onClick={() => dispatch({ type: 'reject', ticketId: ticket.id, motif: 'Client absent' })}>
            Retirer {ticket.name}
          </button>
        </>
      ) : (
        <>
          <p className="muted small">{ticket.name} garde la 1re place.</p>
          {present.map((t) => (
            <button
              key={t.id}
              className="btn btn-outline btn-lg"
              onClick={() => {
                dispatch({ type: 'agentStart', ticketId: t.id });
                dispatch({ type: 'dismissLate' });
              }}
            >
              {t.name}, {t.duration} min
            </button>
          ))}
        </>
      )}
    </Sheet>
  );
}

/** Ticket anonyme pour un walk-in : l'agent ne choisit qu'une durée (S44, QA-27). */
function WalkInSheet({ file, onClose }: { file: QueueFile; onClose: () => void }) {
  const { s, dispatch } = useSim();
  const [minutes, setMinutes] = useState(30);
  const [created, setCreated] = useState<string | null>(null);
  const startsAt = projectedStart(file, s.now, minutes);
  const endsAt = startsAt + minutes;

  if (created)
    return (
      <Sheet title="Place réservée" onClose={onClose}>
        <div className="walkin-qr">
          <QrFake seed={created} size={200} />
        </div>
        <p>S&rsquo;il a l&rsquo;application, fais-lui scanner ce code : il suivra sa place sur son téléphone. Sinon, il n&rsquo;a rien à faire.</p>
        <button className="btn btn-primary btn-lg" onClick={onClose}>
          Terminé
        </button>
      </Sheet>
    );

  return (
    <Sheet title="Ajouter un client présent" onClose={onClose}>
      <p className="muted">Pour quelqu&rsquo;un qui entre au salon sans avoir scanné le QR code. Il passe en dernier, vers {fmt(startsAt)}.</p>
      <DurationWheel label="Durée de la prestation" value={minutes} onChange={setMinutes} />
      {/* QA-27, règle 10 : l'agent est prévenu et peut créer le ticket quand même. */}
      {endsAt > file.endOfDay && (
        <p className="warn">
          Il finirait vers {fmt(endsAt)}, après ta fin de journée ({fmt(file.endOfDay)}). Tu peux l&rsquo;ajouter quand même.
        </p>
      )}
      <button
        className="btn btn-primary btn-lg"
        onClick={() => {
          dispatch({ type: 'walkIn', minutes });
          setCreated(`walkin-${s.now}-${minutes}`);
        }}
      >
        Ajouter à la file
      </button>
    </Sheet>
  );
}

/** Fermeture de file (QA-28). */
function CloseSheet({ file, onClose, onConfirm }: { file: QueueFile; onClose: () => void; onConfirm: (current?: 'terminer' | 'rejeter') => void }) {
  const n = waiting(file).length;
  const cur = inService(file);

  if (n > 0)
    return (
      <Sheet title="Pas encore" onClose={onClose}>
        <p>
          {n} {n > 1 ? 'clients attendent' : 'client attend'} encore. Sers-les ou retire-les de la file avant de fermer.
        </p>
        <button className="btn btn-outline btn-lg" onClick={onClose}>
          Compris
        </button>
      </Sheet>
    );

  return (
    <Sheet title="Fermer ma file" onClose={onClose}>
      {cur ? (
        <>
          <p>{cur.name} est encore sur le fauteuil.</p>
          <button className="btn btn-primary btn-lg" onClick={() => onConfirm('terminer')}>
            Terminer sa prestation et fermer
          </button>
          <button className="btn btn-danger-outline btn-lg" onClick={() => onConfirm('rejeter')}>
            Retirer {cur.name} et fermer
          </button>
        </>
      ) : (
        <>
          <p className="muted">Plus personne ne pourra s&rsquo;inscrire chez toi aujourd&rsquo;hui.</p>
          <button className="btn btn-primary btn-lg" onClick={() => onConfirm()}>
            Fermer ma file
          </button>
        </>
      )}
    </Sheet>
  );
}
