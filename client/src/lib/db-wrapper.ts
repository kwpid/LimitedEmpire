import { 
  getDocs as _getDocs,
  getDoc as _getDoc,
  setDoc as _setDoc,
  addDoc as _addDoc,
  updateDoc as _updateDoc,
  deleteDoc as _deleteDoc,
  runTransaction as _runTransaction,
  type QuerySnapshot,
  type DocumentSnapshot,
  type DocumentData,
  type Query,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase/firestore";
import { dbMonitor } from "./db-monitor";

function getCollectionFromPath(path: string): string {
  const parts = path.split('/');
  return parts[0] || 'unknown';
}

function getCallerInfo(): string | undefined {
  try {
    const stack = new Error().stack;
    if (!stack) return undefined;
    
    const lines = stack.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('at ') && !line.includes('db-wrapper') && !line.includes('db-monitor')) {
        const match = line.match(/at (\w+)/);
        if (match) return match[1];
        
        const fileMatch = line.match(/\/([^\/]+\.(tsx?|jsx?))/);
        if (fileMatch) return fileMatch[1];
      }
    }
  } catch (e) {
  }
  return undefined;
}

export async function getDocs<T extends DocumentData>(query: Query<T>): Promise<QuerySnapshot<T>> {
  const caller = getCallerInfo();
  const snapshot = await _getDocs(query);
  
  const collection = getCollectionFromPath((query as any)._query?.path?.segments?.join('/') || 'unknown');
  dbMonitor.logRead('getDocs', collection, snapshot.docs.length, caller);
  
  return snapshot;
}

export async function getDoc<T extends DocumentData>(reference: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  const caller = getCallerInfo();
  const snapshot = await _getDoc(reference);
  
  const collection = getCollectionFromPath(reference.path);
  dbMonitor.logRead('getDoc', collection, 1, caller);
  
  return snapshot;
}

export async function setDoc<T extends DocumentData>(
  reference: DocumentReference<T>,
  data: T
): Promise<void> {
  const caller = getCallerInfo();
  const collection = getCollectionFromPath(reference.path);
  
  await _setDoc(reference, data);
  dbMonitor.logWrite('setDoc', collection, 1, caller);
}

export async function addDoc<T extends DocumentData>(
  reference: any,
  data: T
): Promise<DocumentReference<T>> {
  const caller = getCallerInfo();
  const collection = getCollectionFromPath(reference.path || 'unknown');
  
  const docRef = await _addDoc(reference, data);
  dbMonitor.logWrite('addDoc', collection, 1, caller);
  
  return docRef;
}

export async function updateDoc<T extends DocumentData>(
  reference: DocumentReference<T>,
  data: Partial<T> | any
): Promise<void> {
  const caller = getCallerInfo();
  const collection = getCollectionFromPath(reference.path);
  
  await _updateDoc(reference, data);
  dbMonitor.logWrite('updateDoc', collection, 1, caller);
}

export async function deleteDoc(reference: DocumentReference): Promise<void> {
  const caller = getCallerInfo();
  const collection = getCollectionFromPath(reference.path);
  
  await _deleteDoc(reference);
  dbMonitor.logWrite('deleteDoc', collection, 1, caller);
}

export async function runTransaction<T>(
  firestore: Firestore,
  updateFunction: (transaction: Transaction) => Promise<T>
): Promise<T> {
  const caller = getCallerInfo();
  
  dbMonitor.logWrite('runTransaction (start)', 'transaction', 1, caller);
  
  const result = await _runTransaction(firestore, updateFunction);
  
  dbMonitor.logWrite('runTransaction (complete)', 'transaction', 1, caller);
  
  return result;
}
