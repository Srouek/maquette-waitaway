import { STORE } from '../sim/data';
import { fmt, myTicket, prestationsOf, projectedStart, ticketLabel } from '../sim/engine';
import { useSim } from '../sim/store';
import type { QueueFile, Ticket } from '../sim/types';
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
  else if (nav.screen === 'choose') screen = <Choose key={nav.fileId} fileId={nav.fileId} preselect={nav.preselect} tried={nav.tried === true} />;
  else if (nav.screen === 'signup') screen = <Signup fileId={nav.fileId} prestationIds={nav.prestationIds} />;
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
      <p className="muted">À bientôt chez {STORE.name}.</p>
      <div className="actions">
        <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'clearMyTicket' })}>
          Retour à mon compte
        </button>
      </div>
    </main>
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
