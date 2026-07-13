import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDSAf_nl-72K0VsyvCkNvLLn5qzHw-ZRMI",
  authDomain: "crm-system-2ee41.firebaseapp.com",
  projectId: "crm-system-2ee41",
  storageBucket: "crm-system-2ee41.firebasestorage.app",
  messagingSenderId: "190840060045",
  appId: "1:190840060045:web:4b151ba2201b63f9754ac4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence)
  .catch((error) => console.warn("Persistence error:", error));

export { auth, db, storage, app };
