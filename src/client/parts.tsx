import { STORE } from '../sim/data';
import { CONFIRM_WINDOW, fmt, inService, position, prestationsOf, ticketLabel, waitFor, waitPhase, waitRatio, type WaitPhase } from '../sim/engine';
import { useSim } from '../sim/store';
import type { Prestation, QueueFile, SimState, Ticket } from '../sim/types';
import { PrestationIcon } from '../ui/icons';
import { CountdownRing } from '../ui/kit';

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

const PHASE_TEXT: Record<WaitPhase, string> = {
  temps: 'Tu as le temps',
  route: 'Mets-toi en route',
  arrive: 'Ton tour arrive',
  prochain: 'Tu es le prochain',
};

/** Le ticket : cercle de l'attente estimée, personnes devant, heure de passage, prestations choisies. */
export function TicketCard({ file, ticket, detailed }: { file: QueueFile; ticket: Ticket; detailed?: boolean }) {
  const { s } = useSim();
  const pos = position(file, ticket.id);
  const wait = waitFor(file, ticket.id, s.now);
  const ahead = Math.max(0, pos - 1 + (inService(file) ? 1 : 0));
  const confirmed = ticket.confirmedAt !== undefined;
  const phase = waitPhase(wait);
  // Déjà confirmé, donc au salon : « Mets-toi en route » ou « Tu as le temps » n'aurait pas de sens.
  const phaseText = confirmed && wait > CONFIRM_WINDOW ? 'Patiente au salon' : PHASE_TEXT[phase];
  return (
    <article className="ticket" aria-label="Ton ticket">
      <div className={`ticket-main phase-${phase}`}>
        <p className="ticket-where">
          {STORE.name} · avec {file.agentName}
        </p>
        <CountdownRing ratio={waitRatio(ticket, wait)} label={`${wait} min d’attente`}>
          <span className="ring-num">{wait}</span>
          <span className="ring-unit">min</span>
        </CountdownRing>
        <p className="ticket-phase">
          <span>Attente estimée</span>
          <strong>{phaseText}</strong>
        </p>
        <div className="ticket-facts">
          <span>
            Devant toi
            <strong>{ahead === 0 ? 'Personne' : `${ahead} pers.`}</strong>
          </span>
          <span>
            Ton tour vers
            <strong>{fmt(s.now + wait)}</strong>
          </span>
        </div>
      </div>
      <div className="ticket-stub">
        <p className="ticket-line">
          <strong>{ticketLabel(file, ticket)}</strong>
          <span className={`chip ${confirmed ? 'chip-ok' : 'chip-wait'}`}>{confirmed ? 'Confirmé' : 'En route'}</span>
        </p>
        {detailed && <PrestationList items={prestationsOf(file, ticket.prestationIds)} detailed />}
      </div>
    </article>
  );
}
