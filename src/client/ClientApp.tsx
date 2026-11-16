import { useEffect, useState } from 'react';
import { STORE } from '../sim/data';
import { fmt, myTicket, prestationsOf, projectedStart, ticketLabel } from '../sim/engine';
import { useSim } from '../sim/store';
import type { QueueFile, Ticket } from '../sim/types';
import { StarIcon } from '../ui/icons';
import { BarberPole, Toasts, useScan } from '../ui/kit';
import { Account, Confirmed, Joined } from './Account';
import { Choose, Signup, StorePage } from './Join';
import { Brand, PrestationList, type ScanFn } from './parts';

export function ClientApp() {
  const { s } = useSim();
  const scan = useScan();
  const mine = myTicket(s);
  const nav = s.clientNav;

  let screen;
  if (mine && (mine.ticket.abortReason === 'rejected_by_agent' || mine.ticket.abortReason === 'incident')) screen = <Rejected file={mine.file} ticket={mine.ticket} />;
  else if (mine && mine.ticket.doneAt !== undefined) screen = <Done file={mine.file} ticket={mine.ticket} />;
  else if (mine && mine.ticket.startedAt !== undefined) screen = <InService file={mine.file} ticket={mine.ticket} />;
  else if (mine && mine.ticket.overtime === 'pending') screen = <Pending file={mine.file} ticket={mine.ticket} />;
  else if (mine && nav.screen === 'joined') screen = <Joined file={mine.file} ticket={mine.ticket} />;
  else if (mine && nav.screen === 'confirmed') screen = <Confirmed file={mine.file} ticket={mine.ticket} />;
  else if (mine) screen = <Account scan={scan.start} />;
  else if (nav.screen === 'store') screen = <StorePage />;
  else if (nav.screen === 'choose')
    screen = <Choose key={nav.fileId} fileId={nav.fileId} preselect={nav.preselect} tried={nav.tried === true} claim={nav.claim === true} />;
  else if (nav.screen === 'signup') screen = <Signup fileId={nav.fileId} prestationIds={nav.prestationIds} claim={nav.claim === true} />;
  else if (s.me.walkIn) screen = <WalkInHome scan={scan.start} />;
  else if (s.me.firstName) screen = <Account scan={scan.start} />;
  else screen = <Home scan={scan.start} />;

  return (
    <div className="app app-client">
      <Toasts to="client" />
      {screen}
      {scan.node}
    </div>
  );
}

function Home({ scan }: { scan: ScanFn }) {
  const { dispatch } = useSim();
  return (
    <main className="screen home">
      <Brand />
      <div className="home-body">
        <h1 className="display">Attends ton tour où tu veux.</h1>
        <p className="lead">Scanne le QR code affiché à l&rsquo;entrée du salon pour voir l&rsquo;attente et prendre ta place.</p>
      </div>
      <div className="actions">
        <button className="btn btn-primary btn-lg" onClick={() => scan('QR code du salon', () => dispatch({ type: 'nav', nav: { screen: 'store' } }))}>
          Scanner le QR code du salon
        </button>
      </div>
    </main>
  );
}

/** Le client est entré sans scanner : le coiffeur lui a créé un ticket et lui montre son QR code (QA-27). */
function WalkInHome({ scan }: { scan: ScanFn }) {
  const { s, dispatch } = useSim();
  const w = s.me.walkIn!;
  return (
    <main className="screen home">
      <Brand />
      <div className="home-body">
        <h1 className="display">Ta place est gardée.</h1>
        <p className="lead">Le coiffeur t&rsquo;a ajouté à sa file. Scanne le QR code de ton ticket pour la retrouver dans l&rsquo;application.</p>
      </div>
      <div className="actions">
        <button
          className="btn btn-primary btn-lg"
          onClick={() => scan('QR code de ton ticket', () => dispatch({ type: 'nav', nav: { screen: 'choose', fileId: w.fileId, claim: true } }))}
        >
          Scanner le QR code de mon ticket
        </button>
        <button className="btn btn-outline btn-lg" onClick={() => dispatch({ type: 'nav', nav: { screen: 'store' } })}>
          Choisir un autre coiffeur
        </button>
      </div>
    </main>
  );
}

function InService({ file, ticket }: { file: QueueFile; ticket: Ticket }) {
  const { s } = useSim();
  const elapsed = s.now - ticket.startedAt!;
  return (
    <main className="screen">
      <Brand />
      <h1 className="title">C&rsquo;est parti avec {file.agentName}</h1>
      <PrestationList items={prestationsOf(file, ticket.prestationIds)} />
      <div className="service-card">
        <BarberPole ratio={elapsed / ticket.duration} over={elapsed > ticket.duration} />
        <div className="ticket-facts">
          <span>
            Commencée à<strong>{fmt(ticket.startedAt!)}</strong>
          </span>
          <span>
            Durée prévue<strong>{ticket.duration} min</strong>
          </span>
        </div>
      </div>
      <p className="muted small">Pas besoin de toucher ton téléphone. Profite.</p>
    </main>
  );
}

function Done({ file, ticket }: { file: QueueFile; ticket: Ticket }) {
  const { dispatch } = useSim();
  return (
    <main className="screen end">
      <Brand />
      <h1 className="display">C&rsquo;est terminé.</h1>
      <p className="lead">
        {ticketLabel(file, ticket)} avec {file.agentName}, en {ticket.doneAt! - ticket.startedAt!} min.
      </p>
      {ticket.rating === undefined ? (
        <Survey file={file} ticket={ticket} />
      ) : (
        <p className="muted">{ticket.rating === 'skipped' ? `À bientôt chez ${STORE.name}.` : `Merci pour ton avis. À bientôt chez ${STORE.name}.`}</p>
      )}
      <div className="actions">
        <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'clearMyTicket' })}>
          Retour à mon compte
        </button>
      </div>
    </main>
  );
}

/**
 * Questionnaire de satisfaction, à la fin de la prestation (QA-34, épic à cadrer). L'avis garde le salon, le coiffeur
 * et la coupe. La photo vient de l'appareil du client : souvent un selfie pris au salon, avec la coupe du jour.
 */
function Survey({ file, ticket }: { file: QueueFile; ticket: Ticket }) {
  const { dispatch } = useSim();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  // Simulation : l'image reste dans le navigateur le temps de l'écran, elle n'est ni envoyée ni sauvegardée.
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo)), [photo]);
  return (
    <section className="panel survey">
      <h2 className="section">Ton avis sur ta prestation</h2>
      <dl className="survey-about">
        <dt>Salon</dt>
        <dd>{STORE.name}</dd>
        <dt>Coiffeur</dt>
        <dd>{file.agentName}</dd>
        <dt>Coupe</dt>
        <dd>{ticketLabel(file, ticket)}</dd>
      </dl>
      <div className="stars" role="radiogroup" aria-label="Note de 1 à 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} sur 5`} className={n <= stars ? 'on' : ''} onClick={() => setStars(n)}>
            <StarIcon on={n <= stars} />
          </button>
        ))}
      </div>
      <label className="field">
        Un commentaire ? (facultatif)
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {photo ? (
        <figure className="survey-photo">
          <img src={photo} alt="Ta photo, jointe à ton avis" />
          <button className="link" onClick={() => setPhoto(null)}>
            Retirer la photo
          </button>
        </figure>
      ) : (
        <label className="btn btn-outline btn-lg survey-add">
          Ajouter une photo de ta coupe
          <input
            type="file"
            accept="image/*"
            capture="user"
            className="visually-hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPhoto(URL.createObjectURL(file));
            }}
          />
        </label>
      )}
      <button className="btn btn-primary btn-lg" disabled={stars === 0} onClick={() => dispatch({ type: 'rate', stars, comment, photo: photo !== null })}>
        Envoyer mon avis
      </button>
      <button className="btn btn-outline btn-lg" onClick={() => dispatch({ type: 'rate' })}>
        Plus tard
      </button>
    </section>
  );
}

/** Demande d'inscription après la fermeture : le coiffeur doit répondre. */
function Pending({ file, ticket }: { file: QueueFile; ticket: Ticket }) {
  const { s, dispatch } = useSim();
  const end = projectedStart(file, s.now, ticket.duration) + ticket.duration;
  return (
    <main className="screen">
      <Brand />
      <h1 className="title">Demande envoyée à {file.agentName}</h1>
      <p className="lead">
        Ta prestation finirait vers {fmt(end)}, après sa fermeture ({fmt(file.endOfDay)}).
      </p>
      <section className="panel panel-remind">
        <p>
          <strong>{file.agentName} est juste là.</strong> Parle-lui : il accepte ou refuse ta demande, et tu as la réponse ici.
        </p>
      </section>
      <PrestationList items={prestationsOf(file, ticket.prestationIds)} />
      <button className="link-danger" onClick={() => dispatch({ type: 'leave' })}>
        Annuler ma demande
      </button>
    </main>
  );
}

function Rejected({ file, ticket }: { file: QueueFile; ticket: Ticket }) {
  const { dispatch } = useSim();
  return (
    <main className="screen end">
      <Brand />
      <h1 className="title">
        {ticket.abortReason === 'incident'
          ? `${file.agentName} a dû fermer sa file`
          : ticket.overtime === 'refused'
            ? `${file.agentName} ne peut pas te prendre aujourd’hui`
            : `${file.agentName} a retiré ton ticket`}
      </h1>
      <p className="lead">Motif : {ticket.rejectMotif}</p>
      <p className="muted">Tu peux reprendre une place si le salon est encore ouvert.</p>
      <div className="actions">
        <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'clearMyTicket' })}>
          Retour à mon compte
        </button>
      </div>
    </main>
  );
}
