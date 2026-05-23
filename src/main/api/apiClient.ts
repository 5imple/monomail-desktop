import log from 'electron-log';

log.transports.console.level = import.meta.env.DEV ? 'debug' : 'warn';
log.transports.ipc.level = import.meta.env.DEV ? 'debug' : 'warn';

interface RequestOptions extends RequestInit {
  headers?: HeadersInit;
  body?: any;
  responseType?: 'json' | 'blob' | 'text';
  retries?: number; // Number of retries for network errors
  retryDelay?: number; // Delay between retries in ms
  uid?: string;
  idToken?: string;
}

type GmailBridgeRequest = {
  method: string;
  path: string;
  uid: string;
  headers?: Record<string, string>;
  body?: string;
  responseType?: 'json' | 'blob' | 'text';
};

type GmailBridgeResult<T = any> =
  | { ok: true; status: number; data: T }
  | { ok: false; status?: number; data?: any; error: string };

type WorkerGmailResolver = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

// Helper to check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

const isWebWorker =
  !isBrowser &&
  typeof self !== 'undefined' &&
  typeof (self as any).postMessage === 'function' &&
  typeof (self as any).addEventListener === 'function';

// Helper to check if we're in electron
const isElectron =
  isBrowser && typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);

let workerGmailListenerAttached = false;
const workerGmailRequests = new Map<string, WorkerGmailResolver>();

function ensureWorkerGmailResponseListener() {
  if (!isWebWorker || workerGmailListenerAttached) return;
  workerGmailListenerAttached = true;

  self.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (message?.type !== 'MAIL_API_RESPONSE') return;

    const { requestId, result } = message.payload ?? {};
    if (typeof requestId !== 'string') return;

    const pending = workerGmailRequests.get(requestId);
    if (!pending) return;
    workerGmailRequests.delete(requestId);

    if (result?.ok) {
      pending.resolve(result.data);
      return;
    }

    pending.reject({
      status: result?.status ?? 500,
      data: result?.data,
      message: result?.error ?? 'Gmail request failed'
    });
  });
}

// Helper to safely check online status
const isOnline = (): boolean => {
  return isBrowser ? navigator.onLine : true;
};

class ApiClient {
  private static instance: ApiClient;
  private baseURL: string;
  private idToken: string | null = null;
  private activeUid: string | null = null;
  private pendingRequests: Map<string, Promise<any>> = new Map();
  private isNodeEnvironment: boolean;

  constructor(baseURL: string, idToken?: string, activeUid?: string) {
    this.baseURL = baseURL;
    if (idToken) {
      this.idToken = idToken;
    }
    if (activeUid) {
      this.activeUid = activeUid;
    }

    this.isNodeEnvironment = !isBrowser && !isWebWorker;

    // Only set up browser-specific features if we're in a browser
    if (isBrowser) {
      // Setup network change listener to clear pending requests
      window.addEventListener('online', this.handleNetworkChange);
      window.addEventListener('offline', this.handleNetworkChange);
    }
  }

  private handleNetworkChange = () => {
    if (!isBrowser) return;

    // Clear pending requests when network changes
    this.pendingRequests.clear();

    if (isElectron) {
      // log.info(`[ApiClient] Network status changed. Online: ${navigator.onLine}`);
    }

    // Optionally notify the app of network change
    if (navigator.onLine) {
      this.dispatchEvent('network:online');
    } else {
      this.dispatchEvent('network:offline');
    }
  };

  private dispatchEvent(eventName: string, detail?: any) {
    if (!isBrowser) return;

    const event = new CustomEvent(eventName, { detail });
    window.dispatchEvent(event);
  }

  static getInstance(baseURL: string, idToken?: string, activeUid?: string): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient(baseURL, idToken, activeUid);
    }
    return ApiClient.instance;
  }

  setApiClientIdToken(token: string | null) {
    this.idToken = token;
  }

  setApiActiveUid(uid: string | null) {
    this.activeUid = uid;
  }

  private isGmailApiClient() {
    return this.baseURL.startsWith('https://gmail.googleapis.com/');
  }

  private shouldProxyGmailRequest() {
    return this.isGmailApiClient() && (isWebWorker || isElectron);
  }

  private toPlainHeaders(headers: HeadersInit | undefined): Record<string, string> {
    if (!headers) return {};
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }
    if (Array.isArray(headers)) return Object.fromEntries(headers);
    return Object.fromEntries(
      Object.entries(headers).filter(([, value]) => typeof value === 'string')
    ) as Record<string, string>;
  }

  private withAbort<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', abort);
      });
    });
  }

  private normalizeGmailResult<T>(result: GmailBridgeResult<T>): T {
    if (result.ok) {
      const maybeBlob = result.data as any;
      if (
        maybeBlob &&
        typeof maybeBlob === 'object' &&
        typeof maybeBlob.base64 === 'string' &&
        typeof maybeBlob.type === 'string'
      ) {
        const binary = atob(maybeBlob.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: maybeBlob.type }) as T;
      }
      return result.data;
    }

    throw {
      status: result.status ?? 500,
      data: result.data,
      message: result.error
    };
  }

  private requestGmailViaElectron<T>(
    payload: GmailBridgeRequest,
    signal?: AbortSignal | null
  ): Promise<T> {
    const bridge = (window as any).electronBridge;
    if (!bridge?.gmailRequest) {
      return Promise.reject(new Error('Gmail bridge is unavailable'));
    }

    const request = bridge
      .gmailRequest(payload)
      .then((result: GmailBridgeResult<T>) => this.normalizeGmailResult(result));
    return this.withAbort(request, signal);
  }

  private requestGmailViaWorkerHost<T>(
    payload: GmailBridgeRequest,
    signal?: AbortSignal | null
  ): Promise<T> {
    ensureWorkerGmailResponseListener();

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const request = new Promise<T>((resolve, reject) => {
      workerGmailRequests.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
      self.postMessage({
        type: 'MAIL_API_REQUEST',
        payload: {
          requestId,
          ...payload
        }
      });
    });

    return this.withAbort(request, signal).catch((error) => {
      workerGmailRequests.delete(requestId);
      throw error;
    });
  }

  private requestGmailViaMain<T>(
    method: string,
    path: string,
    config: RequestInit,
    responseType: RequestOptions['responseType'],
    uid?: string | null
  ): Promise<T> {
    if (!uid) return Promise.reject(new Error('Gmail account uid is required'));

    const body = typeof config.body === 'string' ? config.body : undefined;
    const payload: GmailBridgeRequest = {
      method,
      path,
      uid,
      headers: this.toPlainHeaders(config.headers),
      body,
      responseType
    };

    if (isWebWorker) {
      return this.requestGmailViaWorkerHost<T>(payload, config.signal);
    }

    return this.requestGmailViaElectron<T>(payload, config.signal);
  }

  /**
   * Makes a network request with retry logic
   */
  private async request<T>(method: string, url: string, options: RequestOptions = {}): Promise<T> {
    if (!this.baseURL) {
      return Promise.reject(
        new Error('Backend not configured: set MONO_ENV_API_URL in .env and restart the app.')
      );
    }

    const {
      headers,
      body,
      responseType = 'json',
      retries = 2,
      retryDelay = 1000,
      uid,
      idToken,
      ...rest
    } = options;

    const accountUid = uid || this.activeUid;
    const shouldProxyGmail = this.shouldProxyGmailRequest();
    let token = shouldProxyGmail ? null : idToken || this.idToken;

    if (
      !shouldProxyGmail &&
      !idToken &&
      accountUid &&
      isBrowser &&
      isElectron &&
      this.baseURL.startsWith('https://gmail.googleapis.com/')
    ) {
      try {
        const tokenResult = await (window as any).electronBridge?.getGoogleAccountToken(accountUid);
        if (tokenResult?.ok) token = tokenResult.accessToken;
      } catch (error) {
        log.warn(
          `[ApiClient] Failed to resolve Google token for ${accountUid}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Include the account uid in the dedup key — without it, concurrent
    // requests across accounts (e.g. multi-account mailbox sync) would
    // share the same pending promise and the second account would receive
    // the first account's response data.
    const requestKey = `${accountUid ?? '_'}:${method}:${url}:${JSON.stringify(body || {})}`;

    // Check if we're offline (browser only)
    if (isBrowser && !isOnline()) {
      const errorMsg = 'You are offline. Please check your connection.';
      if (isElectron) {
        log.warn(`[ApiClient] Offline: ${method} ${url}`);
      }
      return Promise.reject(new Error(errorMsg));
    }

    // Check if we already have a pending request for this exact same resource
    if (this.pendingRequests.has(requestKey)) {
      if (isElectron) {
        log.info(`[ApiClient] Reusing pending request for ${requestKey}`);
      }
      return this.pendingRequests.get(requestKey);
    }
    // Prepare request config
    const config: RequestInit = {
      method,
      headers: Object.fromEntries(
        Object.entries({
          'Content-Type': 'application/json',
          ...(accountUid ? { 'X-Mono-Account': accountUid } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers
        }).filter(([_, value]) => value !== null) // Remove headers with null values
      ),
      mode: 'cors',
      ...rest
    };

    if (body) {
      if (body instanceof FormData) {
        config.body = body;
        config.headers = {
          ...config.headers
        };
        delete config.headers['Content-Type'];
      } else if (typeof body === 'object') {
        config.headers = {
          ...config.headers,
          'Content-Type': 'application/json'
        };
        config.body = JSON.stringify(body);
      } else {
        config.body = body;
      }
    }

    // Create a promise for the request with retries
    const makeRequest = async (attempt: number = 0): Promise<T> => {
      // Per-attempt AbortController gives us a hard timeout. Without it
      // a stalled connection (server up, no response) hangs forever and
      // can deadlock app shutdown (before-quit awaits pubsub stop, which
      // awaits this fetch).
      const REQUEST_TIMEOUT_MS = 30_000;
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      // Merge our signal with any caller-supplied signal so explicit cancels
      // still work. If a caller provided one, listen to it and abort ours.
      const callerSignal = (config as RequestInit).signal;
      if (callerSignal) {
        if (callerSignal.aborted) ctrl.abort();
        else callerSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
      }
      const attemptConfig: RequestInit = { ...config, signal: ctrl.signal };

      try {
        if (isElectron) {
          // log.info(`[ApiClient] ${method} ${url} (attempt ${attempt + 1}/${retries + 1})`);
        }

        if (shouldProxyGmail) {
          return await this.requestGmailViaMain<T>(
            method,
            url,
            attemptConfig,
            responseType,
            accountUid
          );
        }

        const response = await fetch(`${this.baseURL}${url}`, attemptConfig);

        if (response.status === 204) {
          return {} as T;
        }

        // Process response based on content type and responseType
        const contentType = response.headers.get('content-type');
        let data: T;

        switch (responseType) {
          case 'blob':
            data = (await response.blob()) as unknown as T;
            break;
          case 'text':
            data = (await response.text()) as unknown as T;
            break;
          case 'json':
          default:
            if (contentType?.includes('application/json')) {
              data = await response.json();
            } else {
              data = (await response.text()) as unknown as T;
            }
            break;
        }

        if (isElectron) {
          // log.info(`[${method} ${response.status}]: ${url}`);
        }

        if (!response.ok) {
          return Promise.reject({ status: response.status, data });
        }

        return data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTimeout = error instanceof Error && error.name === 'AbortError';
        if (isTimeout) {
          log.warn(`[ApiClient] Request aborted (timeout or caller cancel) ${method} ${url}`);
        }

        if (isElectron) {
          log.error(`[ApiClient] Request failed (${method} ${url}): ${errorMessage}`);
        }

        // Check if it's a network error
        const isNetworkError =
          (isBrowser && !isOnline()) ||
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('network') ||
          errorMessage.includes('net::ERR_NAME_NOT_RESOLVED') ||
          errorMessage.includes('Network') ||
          errorMessage.includes('ERR_NETWORK') ||
          errorMessage.includes('ERR_NETWORK_CHANGED') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('Connection');

        // Retry on network errors if we haven't exceeded max retries
        if (isNetworkError && attempt < retries) {
          if (isElectron) {
            log.info(`[ApiClient] Retrying in ${retryDelay}ms...`);
          }
          // Wait for the specified delay
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          // Try again with incremented attempt counter
          return makeRequest(attempt + 1);
        }

        // If we've exhausted retries or it's not a network error
        return Promise.reject(error);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // Create the request promise and register it for dedup. The previous
    // code commented out the `.set` line which silently broke dedup —
    // identical concurrent requests all hit the network.
    const requestPromise = makeRequest().finally(() => {
      // Remove from pending requests when done
      this.pendingRequests.delete(requestKey);
    });
    this.pendingRequests.set(requestKey, requestPromise);

    return requestPromise;
  }

  get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', url, options);
  }

  post<T>(url: string, body: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', url, { ...options, body });
  }

  put<T>(url: string, body: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', url, { ...options, body });
  }

  delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', url, options);
  }

  patch<T>(url: string, body: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PATCH', url, { ...options, body });
  }
}

// API base URL must come from env — do not commit a default that points at private infrastructure.
const getApiUrl = () => {
  const fromVite =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MONO_ENV_API_URL;
  const base = (fromVite || process.env.MONO_ENV_API_URL || '').trim().replace(/\/$/, '');
  if (!base) {
    // Do NOT throw here — throwing at module scope crashes the renderer before
    // React mounts, producing a blank frosted-glass window with no error shown.
    // Returning '' lets the app render normally; individual API calls will fail
    // with a clear "not configured" message the UI can handle.
    if (typeof console !== 'undefined') {
      console.warn(
        '[ApiClient] MONO_ENV_API_URL is not set. Copy .env.example to .env and fill in your backend URL.'
      );
    }
    return '';
  }
  return `${base}/api/v1`;
};

export const apiClient = ApiClient.getInstance(getApiUrl());

// Separate client for direct Gmail API calls. Base URL resolves to
// https://gmail.googleapis.com/gmail/v1/users/me/<path>.
// The access token is injected via setApiClientIdToken() in AuthContext
// whenever the token refreshes.
export const gmailApiClient = new ApiClient('https://gmail.googleapis.com/gmail/v1/users/me');

/**
 * Set the Mono API token.
 * @param {string} token - The API token to set.
 */
export const setApiClientIdToken = (token: string) => {
  apiClient.setApiClientIdToken(token);
};

/**
 * Set the active uid.
 * @param {string} uid - The active account uid to set.
 */
export const setApiActiveAccount = (uid: string) => {
  apiClient.setApiActiveUid(uid);
};

export default ApiClient;
