// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDSAf_nl-72K0VsyvCkNvLLn5qzHw-ZRMI",
  authDomain: "crm-system-2ee41.firebaseapp.com",
  projectId: "crm-system-2ee41",
  storageBucket: "crm-system-2ee41.firebasestorage.app",
  messagingSenderId: "190840060045",
  appId: "1:190840060045:web:4b151ba2201b63f9754ac4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Set persistence to LOCAL (keep user logged in)
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.warn("Error setting persistence:", error);
  });

// Export for use in other modules
export { auth, db, storage, app };
