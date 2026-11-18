/// <reference lib="webworker" />
import { handle } from './compute';
self.onmessage = async (ev: MessageEvent) => { (self as any).postMessage(await handle(ev.data)); };
