import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const firebaseEnabled = Object.values(config).every(Boolean);
const firebaseApp = firebaseEnabled ? initializeApp(config) : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

export async function sendPhoneCode(phoneNumber) {
  if (!firebaseAuth) {
    throw new Error('Firebase phone login is not configured yet');
  }

  const verifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', { size: 'normal' });
  return signInWithPhoneNumber(firebaseAuth, phoneNumber, verifier);
}
