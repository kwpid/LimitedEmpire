import { collection } from "firebase/firestore";
import { db, addDoc } from "@/lib/firebase";
import type { InsertAuditLog } from "@shared/schema";

export async function createAuditLog(logData: InsertAuditLog): Promise<void> {
  try {
    await addDoc(collection(db, "auditLogs"), logData);
  } catch (error) {
    console.error("Error creating audit log:", error);
  }
}
