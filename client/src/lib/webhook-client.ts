import { auth } from "@/lib/firebase";

export async function sendWebhookRequest(endpoint: string, data: any): Promise<void> {
  console.log(`[WEBHOOK] Attempting to send webhook to ${endpoint}`, data);
  
  try {
    const user = auth.currentUser;
    if (!user) {
      console.error('[WEBHOOK] ERROR: No authenticated user for webhook request');
      return;
    }

    console.log('[WEBHOOK] Getting ID token...');
    const idToken = await user.getIdToken();

    console.log(`[WEBHOOK] Sending POST request to ${endpoint}...`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(data),
    });

    console.log(`[WEBHOOK] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WEBHOOK] ERROR: Request to ${endpoint} failed with status ${response.status}`);
      console.error(`[WEBHOOK] ERROR Response:`, errorText);
    } else {
      const responseData = await response.json();
      console.log(`[WEBHOOK] SUCCESS: Webhook sent to ${endpoint}`, responseData);
    }
  } catch (error: any) {
    console.error(`[WEBHOOK] EXCEPTION: Failed to send webhook to ${endpoint}:`, error);
    console.error(`[WEBHOOK] Error details:`, {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
  }
}
