import type { DocumentData, QuerySnapshot, DocumentSnapshot } from "firebase/firestore";

export interface DatabaseOperation {
  type: 'read' | 'write';
  operation: string;
  collection?: string;
  documentCount?: number;
  caller?: string;
  timestamp: number;
}

class DatabaseMonitor {
  private operations: DatabaseOperation[] = [];
  private readCount = 0;
  private writeCount = 0;
  private sessionStart = Date.now();

  logRead(operation: string, collection?: string, documentCount?: number, caller?: string) {
    this.readCount += documentCount || 1;
    const op: DatabaseOperation = {
      type: 'read',
      operation,
      collection,
      documentCount,
      caller,
      timestamp: Date.now()
    };
    this.operations.push(op);
    
    console.log(
      `%c[DB READ] %c${operation}`,
      'color: #3b82f6; font-weight: bold',
      'color: #6b7280',
      {
        collection,
        documentCount,
        caller,
        totalReads: this.readCount,
        totalWrites: this.writeCount
      }
    );
  }

  logWrite(operation: string, collection?: string, documentCount?: number, caller?: string) {
    this.writeCount += documentCount || 1;
    const op: DatabaseOperation = {
      type: 'write',
      operation,
      collection,
      documentCount,
      caller,
      timestamp: Date.now()
    };
    this.operations.push(op);
    
    console.log(
      `%c[DB WRITE] %c${operation}`,
      'color: #ef4444; font-weight: bold',
      'color: #6b7280',
      {
        collection,
        documentCount,
        caller,
        totalReads: this.readCount,
        totalWrites: this.writeCount
      }
    );
  }

  getStats() {
    const sessionDuration = Date.now() - this.sessionStart;
    return {
      totalReads: this.readCount,
      totalWrites: this.writeCount,
      totalOperations: this.operations.length,
      sessionDuration,
      operations: this.operations
    };
  }

  printStats() {
    const stats = this.getStats();
    console.group('%c📊 Database Stats', 'color: #8b5cf6; font-weight: bold; font-size: 14px');
    console.log(`Total Reads: ${stats.totalReads}`);
    console.log(`Total Writes: ${stats.totalWrites}`);
    console.log(`Total Operations: ${stats.totalOperations}`);
    console.log(`Session Duration: ${(stats.sessionDuration / 1000).toFixed(2)}s`);
    
    const readsByCollection = this.operations
      .filter(op => op.type === 'read' && op.collection)
      .reduce((acc, op) => {
        const col = op.collection!;
        acc[col] = (acc[col] || 0) + (op.documentCount || 1);
        return acc;
      }, {} as Record<string, number>);
    
    console.log('Reads by collection:', readsByCollection);
    
    const writesByCollection = this.operations
      .filter(op => op.type === 'write' && op.collection)
      .reduce((acc, op) => {
        const col = op.collection!;
        acc[col] = (acc[col] || 0) + (op.documentCount || 1);
        return acc;
      }, {} as Record<string, number>);
    
    console.log('Writes by collection:', writesByCollection);
    console.groupEnd();
  }

  reset() {
    this.operations = [];
    this.readCount = 0;
    this.writeCount = 0;
    this.sessionStart = Date.now();
    console.log('%c[DB MONITOR] Stats reset', 'color: #10b981; font-weight: bold');
  }
}

export const dbMonitor = new DatabaseMonitor();

if (typeof window !== 'undefined') {
  (window as any).dbStats = () => dbMonitor.printStats();
  (window as any).dbReset = () => dbMonitor.reset();
  console.log('%cDatabase monitor initialized. Use dbStats() to view stats, dbReset() to reset.', 'color: #8b5cf6; font-weight: bold');
}

export function trackQuery(snapshot: QuerySnapshot<DocumentData>, collection: string, operation: string, caller?: string) {
  dbMonitor.logRead(operation, collection, snapshot.docs.length, caller);
}

export function trackDocument(snapshot: DocumentSnapshot<DocumentData>, collection: string, operation: string, caller?: string) {
  dbMonitor.logRead(operation, collection, 1, caller);
}

export function trackWrite(operation: string, collection: string, documentCount: number = 1, caller?: string) {
  dbMonitor.logWrite(operation, collection, documentCount, caller);
}
