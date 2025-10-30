import { RARITY_TIERS, type RarityTier } from "@shared/schema";

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp?: string;
  footer?: {
    text: string;
  };
  image?: {
    url: string;
  };
  thumbnail?: {
    url: string;
  };
}

interface DiscordWebhookPayload {
  content?: string;
  embeds: DiscordEmbed[];
}

// Convert hex color to decimal for Discord
function hexToDecimal(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

// Get color for rarity
function getRarityColor(rarity: RarityTier): number {
  const color = RARITY_TIERS[rarity].color;
  if (color === "rainbow") {
    return hexToDecimal("#ff0000"); // Use red for rainbow items
  }
  return hexToDecimal(color);
}

async function sendDiscordWebhook(webhookUrl: string, payload: DiscordWebhookPayload): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Discord webhook failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Error sending Discord webhook:', error);
  }
}

// Item release webhook
export async function sendItemReleaseWebhook(itemData: {
  name: string;
  rarity: RarityTier;
  value: number;
  stock: number | null;
  imageUrl?: string;
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_ITEM_RELEASE;
  if (!webhookUrl) {
    console.warn('DISCORD_WEBHOOK_ITEM_RELEASE not configured');
    return;
  }

  const stockDisplay = itemData.stock === null ? "Infinite" : itemData.stock.toLocaleString();

  const embed: DiscordEmbed = {
    title: itemData.name,
    color: getRarityColor(itemData.rarity),
    fields: [
      {
        name: "Rarity",
        value: RARITY_TIERS[itemData.rarity].name,
        inline: false,
      },
      {
        name: "Value",
        value: `$${itemData.value.toLocaleString()}`,
        inline: false,
      },
      {
        name: "Stock",
        value: stockDisplay,
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  // Add thumbnail if provided
  if (itemData.imageUrl) {
    embed.thumbnail = {
      url: itemData.imageUrl,
    };
  }

  const payload: DiscordWebhookPayload = { embeds: [embed] };
  
  if (itemData.value >= 500000) {
    payload.content = '<@&1381033979502661722>';
  }

  await sendDiscordWebhook(webhookUrl, payload);
}

// Admin log webhook
export async function sendAdminLogWebhook(logData: {
  action: string;
  adminUsername: string;
  targetUsername?: string;
  details: string[];
  color?: number;
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_ADMIN_LOG;
  if (!webhookUrl) {
    console.warn('DISCORD_WEBHOOK_ADMIN_LOG not configured');
    return;
  }

  const description = logData.details.join('\n');
  const title = logData.targetUsername 
    ? `${logData.action} - ${logData.targetUsername}`
    : logData.action;

  const embed: DiscordEmbed = {
    title,
    description,
    color: logData.color || hexToDecimal("#5865F2"), // Discord blurple default
    timestamp: new Date().toISOString(),
    footer: {
      text: `Action by ${logData.adminUsername}`,
    },
  };

  await sendDiscordWebhook(webhookUrl, { embeds: [embed] });
}
