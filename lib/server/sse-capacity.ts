/** Hard cap for simultaneous browser/server-sent event sessions in this Node process. */
export const MAX_SSE_CLIENTS = 128;

let activeClients = 0;

export function acquireSseClient(): (() => void) | null {
  if (activeClients >= MAX_SSE_CLIENTS) return null;
  activeClients += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeClients = Math.max(0, activeClients - 1);
  };
}

export function getActiveSseClientCount(): number {
  return activeClients;
}
