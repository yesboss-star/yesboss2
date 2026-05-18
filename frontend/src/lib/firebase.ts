import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBjFwWVhr92mNi4VXs1O9UbJ1WGdJmhSiY",
  authDomain: "yesboss-8b789.firebaseapp.com",
  projectId: "yesboss-8b789",
  storageBucket: "yesboss-8b789.firebasestorage.app",
  messagingSenderId: "6509834745",
  appId: "1:6509834745:web:3a6ce241d03ad7d42a0d28",
  measurementId: "G-3S2CB1VG3Y"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);