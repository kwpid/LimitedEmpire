import admin from 'firebase-admin';

let app: admin.app.App;

export function initializeFirebaseAdmin() {
  if (app) {
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  
  if (!projectId) {
    console.warn('⚠️  Firebase credentials not configured - running in development mode without Firebase');
    console.warn('⚠️  Trade and authentication features will not work in this environment');
    return null;
  }

  try {
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
    console.log('✓ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    console.warn('⚠️  Running without Firebase - trade and authentication features will not work');
    return null;
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
  if (!admin) {
    console.warn('Firebase not initialized - cannot verify token');
    return null;
  }
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
  if (!admin) {
    console.warn('Firebase not initialized - cannot check admin status');
    return false;
  }
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
