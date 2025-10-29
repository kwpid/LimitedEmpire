import admin from 'firebase-admin';

let app: admin.app.App;

export function initializeFirebaseAdmin() {
  if (app) {
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const privateKeyEnv = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  
  if (!projectId || !privateKeyEnv || !clientEmail) {
    console.warn('⚠️  Firebase credentials not configured - running in development mode without Firebase');
    console.warn('⚠️  Trade and authentication features will not work in this environment');
    return null;
  }

  try {
    let serviceAccount: any;
    
    try {
      serviceAccount = JSON.parse(privateKeyEnv);
      console.log('[Firebase] Parsed service account from JSON');
    } catch {
      let formattedPrivateKey = privateKeyEnv.trim();
      
      if (formattedPrivateKey.startsWith('"') && formattedPrivateKey.endsWith('"')) {
        formattedPrivateKey = formattedPrivateKey.slice(1, -1);
      }
      
      formattedPrivateKey = formattedPrivateKey.replace(/\\n/g, '\n');
      
      console.log('[Firebase Debug] Private key starts with:', formattedPrivateKey.substring(0, 50));
      console.log('[Firebase Debug] Private key ends with:', formattedPrivateKey.substring(formattedPrivateKey.length - 50));
      console.log('[Firebase Debug] Contains actual newlines:', formattedPrivateKey.includes('\n'));
      console.log('[Firebase Debug] Contains backslash-n:', formattedPrivateKey.includes('\\n'));
      
      serviceAccount = {
        projectId,
        privateKey: formattedPrivateKey,
        clientEmail,
      };
      console.log('[Firebase] Using formatted private key');
    }
    
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
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
