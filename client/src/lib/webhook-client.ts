import { auth } from "@/lib/firebase";

export async function sendWebhookRequest(endpoint: string, data: any): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.error('No authenticated user for webhook request');
      return;
    }

    const idToken = await user.getIdToken();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Webhook request to ${endpoint} failed:`, response.status, errorText);
    } else {
      console.log(`Webhook sent successfully to ${endpoint}`);
    }
  } catch (error) {
    console.error(`Failed to send webhook to ${endpoint}:`, error);
  }
}
