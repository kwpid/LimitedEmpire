import { auth } from "@/lib/firebase";

export async function sendWebhookRequest(endpoint: string, data: any): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.error('No authenticated user');
      return;
    }

    const idToken = await user.getIdToken();

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error(`Failed to send webhook to ${endpoint}:`, error);
  }
}
