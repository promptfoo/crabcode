/**
 * Probe Tool - Simple HTTP/WebSocket Request
 *
 * SIMPLE: Send request, return raw response. No interpretation.
 * The agent (LLM) decides what the response means.
 */

import { randomUUID } from 'node:crypto';

export interface ProbeRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface ProbeResponse {
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  bodyRaw?: string;
  timing: {
    start: number;
    end: number;
    duration: number;
  };
  error?: string;
  traceId?: string;
}

/**
 * Generate a W3C traceparent header for trace correlation
 */
export function generateTraceId(): { traceId: string; traceparent: string } {
  const traceId = randomUUID().replace(/-/g, '');
  const spanId = randomUUID().replace(/-/g, '').slice(0, 16);
  const traceparent = `00-${traceId}-${spanId}-01`;
  return { traceId, traceparent };
}

/**
 * Probe a target - send request, return raw response
 *
 * No interpretation, no success/failure detection.
 * The agent reads the response and decides what it means.
 */
export async function probe(request: ProbeRequest): Promise<ProbeResponse> {
  const startTime = Date.now();
  const timeout = request.timeout || 30000;

  // Generate trace ID for correlation
  const { traceId, traceparent } = generateTraceId();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      ...request.headers,
      'traceparent': traceparent,
    };

    const fetchOptions: RequestInit = {
      method: request.method || 'GET',
      headers,
      signal: controller.signal,
    };

    if (request.body !== undefined) {
      if (typeof request.body === 'string') {
        fetchOptions.body = request.body;
      } else {
        fetchOptions.body = JSON.stringify(request.body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    const response = await fetch(request.url, fetchOptions);
    clearTimeout(timeoutId);

    const endTime = Date.now();
    const bodyRaw = await response.text();

    // Try to parse as JSON, but don't fail if it's not
    let body: unknown = bodyRaw;
    try {
      body = JSON.parse(bodyRaw);
    } catch {
      // Keep as string
    }

    // Extract response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body,
      bodyRaw,
      timing: {
        start: startTime,
        end: endTime,
        duration: endTime - startTime,
      },
      traceId,
    };
  } catch (error) {
    const endTime = Date.now();
    const err = error as Error;

    return {
      success: false,
      error: err.name === 'AbortError' ? `Timeout after ${timeout}ms` : err.message,
      timing: {
        start: startTime,
        end: endTime,
        duration: endTime - startTime,
      },
      traceId,
    };
  }
}
