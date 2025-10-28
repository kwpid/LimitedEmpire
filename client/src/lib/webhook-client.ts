// Utility for making authenticated webhook requests
const ADMIN_SECRET = 'change-this-in-production'; // Should match server-side

export async function sendWebhookRequest(endpoint: string, data: any): Promise<void> {
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET,
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error(`Failed to send webhook to ${endpoint}:`, error);
  }
}
