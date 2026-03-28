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

// Helper to check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Helper to check if we're in electron
const isElectron =
  isBrowser && typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);

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

    this.isNodeEnvironment = !isBrowser;

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

  /**
   * Makes a network request with retry logic
   */
  private async request<T>(method: string, url: string, options: RequestOptions = {}): Promise<T> {
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

    const requestKey = `${method}:${url}:${JSON.stringify(body || {})}`;

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

    const accountUid = uid || this.activeUid;
    const token = idToken || this.idToken;
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
      try {
        if (isElectron) {
          // log.info(`[ApiClient] ${method} ${url} (attempt ${attempt + 1}/${retries + 1})`);
        }

        const response = await fetch(`${this.baseURL}${url}`, config);

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
      }
    };

    // Create the request promise
    const requestPromise = makeRequest().finally(() => {
      // Remove from pending requests when done
      this.pendingRequests.delete(requestKey);
    });

    // Store the promise for potential reuse
    // this.pendingRequests.set(requestKey, requestPromise);

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
    throw new Error(
      'MONO_ENV_API_URL is required (set in .env / electron-vite env). Use the origin only, e.g. https://api.example.com — /api/v1 is appended automatically.'
    );
  }
  return `${base}/api/v1`;
};

export const apiClient = ApiClient.getInstance(getApiUrl());

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
