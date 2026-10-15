// Test stub for sonner: records the toasts code shows and keeps the ones still
// on screen, so a test can see what the user would.
const calls = [];
const active = new Map();
let nextId = 1;

function show(type, message, data = {}) {
  const id = data.id ?? nextId++;
  calls.push({ type, message, id, action: data.action });
  active.set(id, { id, type, message, action: data.action });
  return id;
}

export const toast = Object.assign((message, data) => show('default', message, data), {
  success: (message, data) => show('success', message, data),
  error: (message, data) => show('error', message, data),
  info: (message, data) => show('info', message, data),
  warning: (message, data) => show('warning', message, data),
  message: (message, data) => show('message', message, data),
  loading: (message, data) => show('loading', message, data),
  dismiss: (id) => {
    calls.push({ type: 'dismiss', id });
    active.delete(id);
  },
  getToasts: () => [...active.values()],
  getHistory: () => calls
});

export const Toaster = () => null;

export function __toastCalls() {
  return calls;
}

export function __resetToasts() {
  calls.length = 0;
  active.clear();
}
