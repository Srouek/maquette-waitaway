import { fmt, position, prestationsOf, waitFor } from '../sim/engine';
import { useSim } from '../sim/store';
import type { Prestation, QueueFile, SimState, Ticket } from '../sim/types';
import { PrestationIcon } from '../ui/icons';

export type ScanFn = (label: string, then: () => void) => void;

export function Brand() {
  return (
    <header className="brand">
      <span className="brand-mark" aria-hidden>
        W
      </span>
      WaitAway
    </header>
  );
}

/** Une prestation connue d'une des files du salon. */
export const findPrestation = (s: SimState, id: string): Prestation | undefined =>
  s.files.flatMap((f) => f.prestations).find((p) => p.id === id);

/** Liste de prestations : icône, nom, durée, et description si `detailed`. */
export function PrestationList({ items, detailed }: { items: Prestation[]; detailed?: boolean }) {
  return (
    <ul className="prestas">
      {items.map((p) => (
        <li key={p.id}>
          <PrestationIcon id={p.id} size={40} />
          <span className="prestas-text">
            <strong>{p.label}</strong>
            {detailed && <span className="muted small">{p.description}</span>}
          </span>
          <span className="muted">{p.minutes} min</span>
        </li>
      ))}
    </ul>
  );
}

/** Le ticket : position, temps d'attente estimé, heure de passage, prestations choisies. */
export function TicketCard({ file, ticket, detailed }: { file: QueueFile; ticket: Ticket; detailed?: boolean }) {
  const { s } = useSim();
  const pos = position(file, ticket.id);
  const wait = waitFor(file, ticket.id, s.now);
  const confirmed = ticket.confirmedAt !== undefined;
  return (
    <article className="ticket" aria-label="Ton ticket">
      <div className="ticket-main">
        <p className="ticket-kicker">{pos === 1 ? 'Tu es le prochain' : 'Ta position'}</p>
        <p className={`ticket-num${pos === 1 ? ' ticket-num-next' : ''}`}>{pos}</p>
        <div className="ticket-facts">
          <span>
            Attente estimée
            <strong>{wait} min</strong>
          </span>
          <span>
            Ton tour vers
            <strong>{fmt(s.now + wait)}</strong>
          </span>
        </div>
      </div>
      <div className="ticket-stub">
        <PrestationList items={prestationsOf(file, ticket.prestationIds)} detailed={detailed} />
        <span className="ticket-with">
          Avec {file.agentName}
          <span className={`chip ${confirmed ? 'chip-ok' : 'chip-wait'}`}>{confirmed ? 'Présence confirmée' : 'Pas encore confirmé'}</span>
        </span>
      </div>
    </article>
  );
}
