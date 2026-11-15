import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { buildScenario, guideReducer, type GuideAction } from './scenarios';
import type { SimState } from './types';

// v2 : pauses, comptes et scénarios. Un état v1 n'a plus la bonne forme, il est ignoré.
const KEY = 'waitaway-demo-v2';

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

  // Lecture automatique : 1 minute simulée toutes les 2 secondes.
  useEffect(() => {
    if (!s.playing) return;
    const id = setInterval(() => dispatch({ type: 'advance', minutes: 1 }), 2000);
    return () => clearInterval(id);
  }, [s.playing]);

  return <Ctx.Provider value={{ s, dispatch }}>{children}</Ctx.Provider>;
}

export function useSim() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSim hors de SimProvider');
  return v;
}
