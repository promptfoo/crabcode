/**
 * WebSocket Probe Tool
 *
 * Connect to WebSocket endpoint and send/receive messages.
 */

import WebSocket from 'ws';

export interface WsProbeRequest {
  url: string;
  message: string | object;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface WsProbeResponse {
  success: boolean;
  messages: string[];
  error?: string;
  timing: {
    connectTime: number;
    responseTime: number;
    totalTime: number;
  };
}

/**
 * Probe a WebSocket endpoint
 */
export async function probeWs(request: WsProbeRequest): Promise<WsProbeResponse> {
  const startTime = Date.now();
  const timeout = request.timeout || 10000;
  const messages: string[] = [];

  return new Promise((resolve) => {
    let connectTime = 0;
    let responseTime = 0;
    let resolved = false;

    const ws = new WebSocket(request.url, {
      headers: request.headers,
    });

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve({
          success: messages.length > 0,
          messages,
          error: messages.length === 0 ? `Timeout after ${timeout}ms` : undefined,
          timing: {
            connectTime,
            responseTime,
            totalTime: Date.now() - startTime,
          },
        });
      }
    }, timeout);

    ws.on('open', () => {
      connectTime = Date.now() - startTime;

      // Send the message
      const msg = typeof request.message === 'string'
        ? request.message
        : JSON.stringify(request.message);

      ws.send(msg);
    });

    ws.on('message', (data) => {
      if (responseTime === 0) {
        responseTime = Date.now() - startTime;
      }

      const msg = data.toString();
      messages.push(msg);

      // For simple request/response, close after first message
      // For streaming, we wait for timeout
      if (messages.length === 1) {
        // Wait a bit for any follow-up messages
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            ws.close();
            resolve({
              success: true,
              messages,
              timing: {
                connectTime,
                responseTime,
                totalTime: Date.now() - startTime,
              },
            });
          }
        }, 1000);
      }
    });

    ws.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve({
          success: false,
          messages,
          error: error.message,
          timing: {
            connectTime,
            responseTime,
            totalTime: Date.now() - startTime,
          },
        });
      }
    });

    ws.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve({
          success: messages.length > 0,
          messages,
          timing: {
            connectTime,
            responseTime,
            totalTime: Date.now() - startTime,
          },
        });
      }
    });
  });
}
