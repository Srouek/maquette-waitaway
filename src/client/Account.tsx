import { useState } from 'react';
import { STORE } from '../sim/data';
import {
  CONFIRM_WINDOW,
  REMINDER_OPTIONS,
  START_GUARD,
  canConfirm,
  canStart,
  fmt,
  inService,
  myTicket,
  nextScan,
  pauseMinutesBefore,
  position,
  prestationsOf,
  remaining,
  waitFor,
} from '../sim/engine';
import { useSim } from '../sim/store';
import type { QueueFile, Ticket } from '../sim/types';
import { PrestationIcon, ScanIcon, StarIcon } from '../ui/icons';
import { Sheet, Stepper } from '../ui/kit';
import { PrestationList, TicketCard, findPrestation, type ScanFn } from './parts';

/** Rappel personnel : de 20 à 60 min avant le tour, par pas de 5. Seuls les délais encore à venir sont proposés. */
function ReminderChoice({ wait, value }: { wait: number; value?: number }) {
  const { dispatch } = useSim();
  const list: (number | null)[] = [null, ...REMINDER_OPTIONS.filter((m) => m < wait)];
  const i = Math.max(0, list.indexOf(value ?? null));
  const go = (j: number) => () => dispatch({ type: 'setReminder', minutes: list[j] });
  return (
    <Stepper
      label="le délai du rappel"
      value={value === undefined ? 'Pas de rappel' : `${value} min avant`}
      onMinus={i > 0 ? go(i - 1) : undefined}
      onPlus={i < list.length - 1 ? go(i + 1) : undefined}
    />
  );
}

/** Juste après l'inscription : le ticket, puis le réglage du rappel. */
export function Joined({ file, ticket }: { file: QueueFile; ticket: Ticket }) {
  const { s, dispatch } = useSim();
  const confirmed = ticket.confirmedAt !== undefined;
  return (
    <main className="screen with-footer">
      <h1 className="title">Tu es dans la file</h1>
      <TicketCard file={file} ticket={ticket} />
      {confirmed ? (
        // Confirmation à l'inscription (S38) : pas de rappel à régler.
        <section className="panel">
          <p>
            <strong>Ton tour arrive bientôt.</strong> Patiente dans le salon.
          </p>
        </section>
      ) : (
        <section className="panel">
          <p>
            <strong>Rappel pour partir au salon</strong>
          </p>
          {REMINDER_OPTIONS[0] < waitFor(file, ticket.id, s.now) ? (
            <ReminderChoice wait={waitFor(file, ticket.id, s.now)} value={ticket.reminder} />
          ) : (
            <p className="muted small">Ton tour est trop proche pour un rappel : reste dans le coin.</p>
          )}
          <p className="muted small">
            {ticket.reminder !== undefined && `Une notification te dira de te mettre en route ${ticket.reminder} min avant ton tour. `}
            {CONFIRM_WINDOW} min avant ton tour, tu seras invité à confirmer ta présence au salon. D&rsquo;ici là, tu es libre.
          </p>
        </section>
      )}
      <footer className="footer">
        <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'nav', nav: { screen: 'account' } })}>
          Valider
        </button>
      </footer>
    </main>
  );
}

/** Après le scan du QR code du salon : la présence est confirmée. */
export function Confirmed({ file, ticket }: { file: QueueFile; ticket: Ticket }) {
  const { dispatch } = useSim();
  return (
    <main className="screen with-footer">
      <h1 className="title">Présence confirmée</h1>
      <p className="muted">
        {file.agentName} sait que tu es au salon. Reste dans le coin : tu seras appelé quand ce sera ton tour.
      </p>
      <TicketCard file={file} ticket={ticket} detailed />
      <footer className="footer">
        <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'nav', nav: { screen: 'account' } })}>
          Valider
        </button>
      </footer>
    </main>
  );
}

/** La page du compte : l'attente en cours et les prestations favorites. */
export function Account({ scan }: { scan: ScanFn }) {
  const { s, dispatch } = useSim();
  const [leaving, setLeaving] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const mine = myTicket(s);
  const favorites = s.me.favorites.flatMap((id) => findPrestation(s, id) ?? []);
  const missing = mine ? mine.ticket.prestationIds.filter((id) => !s.me.favorites.includes(id)) : [];

  const onScan = () => {
    const target = nextScan(s);
    if (target === 'store') return scan('QR code du salon', () => dispatch({ type: 'nav', nav: { screen: 'store' } }));
    const { file, ticket } = mine!;
    if (target === 'confirm')
      return scan('QR code du salon', () => {
        const err = canConfirm(file, ticket.id, s.now);
        setScanError(err);
        if (!err) dispatch({ type: 'confirm' });
      });
    scan('QR du poste de ' + file.agentName, () => {
      const err = canStart(file, ticket.id, s.now);
      setScanError(err);
      if (!err) dispatch({ type: 'clientStart' });
    });
  };

  return (
    <main className="screen">
      <header className="account-head">
        <span className="avatar" aria-hidden>
          {s.me.firstName?.[0]}
        </span>
        <strong className="account-name">{s.me.firstName}</strong>
        <button className="btn btn-primary scan-btn" onClick={onScan}>
          <ScanIcon />
          Scan
        </button>
      </header>

      <h2 className="section">Attente en cours</h2>
      {mine ? (
        <Waiting file={mine.file} ticket={mine.ticket} scanError={scanError} onScan={onScan} onLeave={() => setLeaving(true)} />
      ) : (
        <section className="panel">
          <p className="muted">Aucune attente en cours. Scanne le QR code d&rsquo;un salon pour prendre ta place.</p>
        </section>
      )}

      <h2 className="section">Prestations favorites</h2>
      {favorites.length === 0 ? (
        <section className="panel">
          <p className="muted">Aucune pour l&rsquo;instant. L&rsquo;étoile d&rsquo;une prestation la range ici, pour la retrouver à ta prochaine visite.</p>
        </section>
      ) : (
        <ul className="favs">
          {favorites.map((p) => (
            <li key={p.id}>
              <PrestationIcon id={p.id} size={40} />
              <span className="prestas-text">
                <strong>{p.label}</strong>
                <span className="muted small">{p.description}</span>
              </span>
              <button className="icon-btn star on" aria-label={`Retirer ${p.label} des favorites`} onClick={() => dispatch({ type: 'toggleFavorite', id: p.id })}>
                <StarIcon on />
              </button>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <button className="btn btn-outline" onClick={() => missing.forEach((id) => dispatch({ type: 'toggleFavorite', id }))}>
          Ajouter ma sélection du jour
        </button>
      )}

      {leaving && (
        <Sheet title="Quitter la file ?" onClose={() => setLeaving(false)}>
          <p className="muted">Tu perds ta place. Les personnes derrière toi avancent.</p>
          <button
            className="btn btn-danger btn-lg"
            onClick={() => {
              dispatch({ type: 'leave' });
              setLeaving(false);
            }}
          >
            Quitter la file
          </button>
          <button className="btn btn-outline btn-lg" onClick={() => setLeaving(false)}>
            Garder ma place
          </button>
        </Sheet>
      )}
    </main>
  );
}

function Waiting({
  file,
  ticket,
  scanError,
  onScan,
  onLeave,
}: {
  file: QueueFile;
  ticket: Ticket;
  scanError: string | null;
  onScan: () => void;
  onLeave: () => void;
}) {
  const { s } = useSim();
  const pos = position(file, ticket.id);
  const wait = waitFor(file, ticket.id, s.now);
  const ahead = pos - 1 + (inService(file) ? 1 : 0);
  const confirmed = ticket.confirmedAt !== undefined;
  const pauseMin = pauseMinutesBefore(file, ticket.id, s.now);
  const soon = pos === 1 && remaining(file, s.now) <= START_GUARD && confirmed;

  return (
    <>
      {soon ? (
        <section className="panel panel-go">
          <p>
            <strong>C&rsquo;est bientôt à toi.</strong> Quand {file.agentName} est prêt, touche Scan devant son poste pour commencer.
          </p>
          {scanError && <p className="error">{scanError}</p>}
          {/* Le même scan que le bouton du haut, placé là où le client lit la consigne. */}
          <button className="btn btn-primary btn-lg" onClick={onScan}>
            Scanner le QR du poste
          </button>
        </section>
      ) : !confirmed && ticket.invitedAt !== undefined ? (
        <section className="panel panel-remind">
          <p>
            <strong>Confirme ta présence.</strong> Au salon, touche Scan pour dire à {file.agentName} que tu es là.
          </p>
          <button className="btn btn-brass btn-lg" onClick={onScan}>
            Je suis au salon
          </button>
        </section>
      ) : !confirmed && ticket.remindedAt !== undefined ? (
        <section className="panel panel-remind">
          <p>
            <strong>Mets-toi en route.</strong> Tu pourras confirmer ta présence à partir de {fmt(s.now + wait - CONFIRM_WINDOW)}.
          </p>
        </section>
      ) : null}
      {/* Un scan refusé hors du panneau « C'est bientôt à toi » s'affiche ici. */}
      {scanError && !soon && <p className="error">{scanError}</p>}

      <section className="wait-card">
        <div className="wait-head">
          <span className="avatar" aria-hidden>
            {file.agentName[0]}
          </span>
          <span className="file-who">
            <strong>{STORE.name}</strong>
            <span className="muted">
              Avec {file.agentName}, {file.metier.toLowerCase()}
            </span>
          </span>
          <span className={`chip ${confirmed ? 'chip-ok' : 'chip-wait'}`}>{confirmed ? 'Confirmé' : 'En route'}</span>
        </div>
        <div className="wait-facts">
          <span>
            <strong>{ahead}</strong>
            {ahead > 1 ? 'personnes devant toi' : 'personne devant toi'}
          </span>
          <span>
            <strong>{wait} min</strong>
            d&rsquo;attente
          </span>
          <span>
            <strong>{fmt(s.now + wait)}</strong>
            ton tour
          </span>
        </div>
        <PrestationList items={prestationsOf(file, ticket.prestationIds)} />
        {pauseMin > 0 && (
          <p className="muted small">
            L&rsquo;attente compte {pauseMin} min de pause de {file.agentName}.
          </p>
        )}
        {!confirmed && ticket.invitedAt === undefined && (
          <p className="muted small">
            {ticket.reminder !== undefined && ticket.remindedAt === undefined && `Rappel ${ticket.reminder} min avant ton tour. `}
            Confirmation de présence à partir de {fmt(s.now + wait - CONFIRM_WINDOW)}.
          </p>
        )}
      </section>

      <button className="link-danger link-inline" onClick={onLeave}>
        Quitter la file
      </button>
    </>
  );
}
