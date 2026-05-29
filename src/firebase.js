import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCMRhQJyAvCEiAKo43Wol_IyM5YdZ0_0xE",
  authDomain: "movi-ct.firebaseapp.com",
  projectId: "movi-ct",
  storageBucket: "movi-ct.firebasestorage.app",
  messagingSenderId: "1096131863803",
  appId: "1:1096131863803:web:ad68eb26f7b99017933c5e",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
