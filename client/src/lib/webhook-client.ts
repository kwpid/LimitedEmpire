export async function sendWebhookRequest(endpoint: string, data: any): Promise<void> {
  try {
    const adminSecret = import.meta.env.VITE_ADMIN_WEBHOOK_SECRET;
    if (!adminSecret) {
      console.error('VITE_ADMIN_WEBHOOK_SECRET not configured');
      return;
    }

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': adminSecret,
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error(`Failed to send webhook to ${endpoint}:`, error);
  }
}
