// Test stub for @/main/api/apiClient — lets the integration suite drive the REAL
// microsoftMailProvider against canned Graph responses while recording the
// requests it builds. The provider (and its googleMailProvider import chain)
// pull these named exports at module load, so all must exist.

let graphHandler = async () => {
  throw new Error('apiClient stub: no graph handler set (call __setGraphHandler)');
};
let batchHandler = async () => ({ ok: false, error: 'apiClient stub: no batch handler set' });
const requests = [];

export function __setGraphHandler(fn) {
  graphHandler = fn;
}
export function __setBatchHandler(fn) {
  batchHandler = fn;
}
export function __getRequests() {
  return requests;
}
export function __reset() {
  requests.length = 0;
  graphHandler = async () => {
    throw new Error('apiClient stub: no graph handler set');
  };
  batchHandler = async () => ({ ok: false, error: 'apiClient stub: no batch handler set' });
}

function record(method, url, opts, body) {
  requests.push({ method, url, opts, body });
  return graphHandler(method, url, opts, body);
}

export const graphApiClient = {
  get: (url, opts) => record('GET', url, opts),
  post: (url, body, opts) => record('POST', url, opts, body),
  patch: (url, body, opts) => record('PATCH', url, opts, body),
  delete: (url, opts) => record('DELETE', url, opts)
};

export function graphBatch(uid, reqs) {
  requests.push({ method: 'BATCH', uid, requests: reqs });
  return batchHandler(uid, reqs);
}

// Harmless stubs the gmail import chain needs to resolve.
export const gmailApiClient = graphApiClient;
export const apiClient = graphApiClient;
export const calendarApiClient = graphApiClient;
export const isBackendConfigured = () => false;
export const setApiClientIdToken = () => {};
export const setApiActiveAccount = () => {};
export default class ApiClient {}
