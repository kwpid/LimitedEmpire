import admin from 'firebase-admin';

let app: admin.app.App;

export function initializeFirebaseAdmin() {
  if (app) {
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  
  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID) environment variable is required for Firebase Admin SDK');
  }

  try {
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    throw new Error('Firebase Admin SDK initialization failed. Ensure GOOGLE_APPLICATION_CREDENTIALS is set to your service account JSON file path.');
  }

  return app;
}

export function getFirebaseAdmin() {
  if (!app) {
    return initializeFirebaseAdmin();
  }
  return app;
}

export async function verifyIdToken(idToken: string) {
  const admin = getFirebaseAdmin();
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying ID token:', error);
    return null;
  }
}

export async function checkIsAdmin(uid: string): Promise<boolean> {
  const admin = getFirebaseAdmin();
  try {
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return false;
    }
    const userData = userDoc.data();
    return userData?.isAdmin === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}
