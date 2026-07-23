import { Socket } from 'node:net';

export interface NetworkPrintOptions {
  host: string;
  port?: number;
  timeoutMs?: number;
}

/**
 * Sends raw bytes to a network printer at host:port (typically :9100 for
 * the JetDirect / RAW protocol most thermal printers speak). Returns as
 * soon as the socket is drained and closed — the printer's own buffer
 * takes over from there.
 */
export function sendToNetworkPrinter(
  data: Buffer,
  { host, port = 9100, timeoutMs = 6000 }: NetworkPrintOptions,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;
    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish({ ok: false, error: `Timeout after ${timeoutMs}ms` }));
    socket.on('error', (err) => finish({ ok: false, error: err.message }));

    socket.connect(port, host, () => {
      socket.write(data, (err) => {
        if (err) finish({ ok: false, error: err.message });
        // Give the printer a beat to accept the buffer before we tear down.
        else socket.end(() => finish({ ok: true }));
      });
    });
  });
}
