import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { agentLate } from './engine';
import { buildScenario, guideReducer, type GuideAction } from './scenarios';
import type { SimState } from './types';

// v8 : attente à l'inscription sur le ticket du client (`joinWait`), pour le cercle minuteur. Un état plus ancien est ignoré.
const KEY = 'waitaway-demo-v8';

function load(): SimState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...(JSON.parse(raw) as SimState), playing: false };
  } catch {
    /* stockage indisponible : on repart du début */
  }
  return buildScenario('pro-journee');
}

const Ctx = createContext<{ s: SimState; dispatch: Dispatch<GuideAction> } | null>(null);

export function SimProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(guideReducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignoré */
    }
  }, [s]);

  // Lecture automatique : 1 minute simulée toutes les 2 secondes. Toutes les 5 secondes quand le coiffeur est en
  // retard sur la fin de sa pause, pour laisser le temps de montrer sa décision.
  const slow = agentLate(s);
  useEffect(() => {
    if (!s.playing) return;
    const id = setInterval(() => dispatch({ type: 'advance', minutes: 1 }), slow ? 5000 : 2000);
    return () => clearInterval(id);
  }, [s.playing, slow]);

  return <Ctx.Provider value={{ s, dispatch }}>{children}</Ctx.Provider>;
}

export function useSim() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSim hors de SimProvider');
  return v;
}
