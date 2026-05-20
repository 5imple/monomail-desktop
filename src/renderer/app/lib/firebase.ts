// Firebase Analytics has been removed in favour of the on-prem-friendly
// Mixpanel + Amplitude pipeline (see useUserTrackingData). Auth and Messaging
// still live here until Phase B replaces them with a direct OAuth + WebSocket
// implementation.
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, indexedDBLocalPersistence, setPersistence } from 'firebase/auth';
import { getMessaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.MONO_ENV_FIREBASE_API_KEY,
  authDomain: import.meta.env.MONO_ENV_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.MONO_ENV_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.MONO_ENV_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.MONO_ENV_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.MONO_ENV_FIREBASE_APP_ID
};

export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(firebaseApp);
setPersistence(auth, indexedDBLocalPersistence);

export const messaging = getMessaging(firebaseApp);
