import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDQO0EJHMFjp7ngh5LIWb-2yYjeIzJ7jfw",
    authDomain: "web3-gamepay.firebaseapp.com",
    databaseURL: "https://web3-gamepay-default-rtdb.firebaseio.com",
    projectId: "web3-gamepay",
    storageBucket: "web3-gamepay.firebasestorage.app",
    messagingSenderId: "83896794496",
    appId: "1:83896794496:web:aa2aab00feea6c43401565",
    measurementId: "G-F676Z7D83Q"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
