import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, reauthenticateWithPopup, signInWithPopup, signOut, type User } from 'firebase/auth';
import { dropAccess, keepAccess, readAccess } from '../model/calendar';

// Sign-in only, so the sign-in screen downloads no more of Firebase than it needs (job 169); the
// database (Firestore) is in ./database, loaded once someone is signed in.

// Not secret: these only say which Firebase project to talk to. The rules in
// firestore.rules decide who may read or write the board.
export const app = initializeApp({
  apiKey: 'AIzaSyBHun-34SrmkErUqS25OJax0JCzl2xe4Wo',
  authDomain: 'note-board-a672a.firebaseapp.com',
  projectId: 'note-board-a672a',
  storageBucket: 'note-board-a672a.firebasestorage.app',
  messagingSenderId: '1016497512471',
  appId: '1:1016497512471:web:8b68c1ed7d063aa39cbc52',
});

const auth = getAuth(app);

export type { User };

export function watchUser(onChange: (user: User | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    // Every sign-out or change of person drops the calendar access kept on this device (jobs 103,
    // 107), here because this is loaded at start, before the calendar ever shows (on a phone, in the
    // ⋯ sheet). Firebase tells every tab of the browser, so a sign-out in one drops it in all.
    const uid = user?.uid ?? null;
    readAccess(() => localStorage, uid);
    // simple: moves a copy kept for the tab before job 107 to the device (same checks: same person,
    // over a minute left), so nobody connected is asked again; can go after 2026-11-19.
    const old = readAccess(() => sessionStorage, uid);
    dropAccess(() => sessionStorage);
    if (old) keepAccess(() => localStorage, old);
    onChange(user);
  });
}

export function signInWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOutUser() {
  return signOut(auth);
}

/** The person signed in now, if any. */
export const currentUser = () => auth.currentUser;

/**
 * Asks Google to confirm it is still `user` (Firebase only deletes an account signed in to
 * recently). Call it straight from a click, so the browser allows the Google window.
 */
export function confirmSignIn(user: User) {
  const provider = new GoogleAuthProvider();
  if (user.email) provider.setCustomParameters({ login_hint: user.email });
  return reauthenticateWithPopup(user, provider);
}
