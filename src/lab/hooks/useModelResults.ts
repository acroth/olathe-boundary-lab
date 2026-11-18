// Runs the model on a background thread whenever the plan (or the plan it's compared with) changes.
import { useEffect, useRef, useState } from 'react';
import { dataBase, type Level, type Static } from '../data';
import type { LevelResult } from '../model/engine';
import { useUI, type Plan } from '../store';

export interface Results {
  levels: Record<Level, LevelResult>;
  feeder: { es: number; split: { ms: number; share: number }[] }[];
}

const REQUEST_DELAY_MS = 30;

/** Runs the same code on the page, for hosts that don't allow a background thread. */
function createInlineWorker(): Worker {
  const inlineWorker = new EventTarget() as any;
  inlineWorker.postMessage = (request: any) => import('../compute')
    .then(compute => compute.handle(request))
    .then(response => inlineWorker.dispatchEvent(new MessageEvent('message', { data: response })));
  inlineWorker.terminate = () => {};
  return inlineWorker as Worker;
}

export function useModelResults(staticData: Static | null, plan: Plan, comparePlan: Plan | null, includePreK: boolean) {
  const [planResults, setPlanResults] = useState<Results | null>(null);
  const [compareResults, setCompareResults] = useState<Results | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [workerFallbacks, setWorkerFallbacks] = useState(0);
  const worker = useRef<Worker | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    try {
      const backgroundWorker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
      backgroundWorker.addEventListener('error', () => {
        if (worker.current !== backgroundWorker) return;
        worker.current = createInlineWorker();
        latestRequest.current++;
        setWorkerFallbacks(count => count + 1);
      });
      worker.current = backgroundWorker;
    } catch {
      worker.current = createInlineWorker();
    }
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    if (!staticData || !worker.current) return;
    const requestId = ++latestRequest.current;
    const modelInput = (input: Plan) => ({ closures: input.closures, edits: input.edits, includePreK });
    const plans: Record<string, ReturnType<typeof modelInput>> = { A: modelInput(plan) };
    if (comparePlan) plans.B = modelInput(comparePlan);

    setIsUpdating(true);
    const sendRequest = setTimeout(() => worker.current!.postMessage({ id: requestId, plans, base: dataBase() }), REQUEST_DELAY_MS);
    const receiveResults = (event: MessageEvent) => {
      if (event.data.id !== latestRequest.current) return;
      setIsUpdating(false);
      if (event.data.error) {
        console.error(event.data.error);
        useUI.getState().set({ toast: 'Calculation error: ' + event.data.error.split('\n')[0] });
        return;
      }
      setPlanResults(event.data.res.A);
      setCompareResults(event.data.res.B ?? null);
    };
    worker.current.addEventListener('message', receiveResults);
    return () => {
      clearTimeout(sendRequest);
      worker.current?.removeEventListener('message', receiveResults);
    };
  }, [staticData, plan, comparePlan, includePreK, workerFallbacks]);

  return { planResults, compareResults, isUpdating };
}
