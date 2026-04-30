import twilio from "twilio";

export interface WhatsAppResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

function getTwilioConfig():
  | {
      accountSid: string;
      authToken: string;
      from: string;
      to: string;
    }
  | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const to = process.env.TWILIO_WHATSAPP_TO;

  if (!accountSid || !authToken || !from || !to) return null;
  return { accountSid, authToken, from, to };
}

function truncateAtSentenceBoundary(text: string): string {
  const limit = 1500;
  const periodSpace = text.lastIndexOf(". ", limit);
  const periodNewline = text.lastIndexOf(".\n", limit);
  const boundary = Math.max(periodSpace, periodNewline);

  if (boundary >= 0) return text.slice(0, boundary + 1);
  return `${text.slice(0, limit - 3).trimEnd()}...`;
}

export function truncateForWhatsApp(content: string): string {
  if (!content || content.trim().length === 0) {
    return "(briefing unavailable)";
  }

  if (content.length <= 1500) {
    return content;
  }

  // Split on actual paragraph breaks. The briefing uses single newlines between paragraphs,
  // so we need to identify paragraph boundaries by content patterns rather than blank lines.
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Find structural anchors
  const titleIdx = lines.findIndex((line) =>
    /^\*?\*?Morning Briefing/i.test(line)
  );
  const actionsIdx = lines.findIndex((line) =>
    /^\*?\*?Actions today\*?\*?$/i.test(line)
  );

  // Determine title and lead paragraph
  const title = titleIdx >= 0 ? lines[titleIdx] : "";
  const leadParagraph =
    titleIdx >= 0 && titleIdx + 1 < lines.length ? lines[titleIdx + 1] : "";

  // Determine actions block (header + all numbered items until end)
  let actionsBlock = "";
  if (actionsIdx >= 0) {
    actionsBlock = lines.slice(actionsIdx).join("\n");
  }

  // Compose: title + lead paragraph + actions block
  let result = [title, leadParagraph, actionsBlock]
    .filter(Boolean)
    .join("\n\n");

  // If still too long, truncate at last sentence boundary in lead paragraph
  if (result.length > 1500) {
    const overage = result.length - 1500;
    const newLeadLength = leadParagraph.length - overage - 10;
    let truncatedLead = leadParagraph.slice(0, newLeadLength);
    const lastPeriod = truncatedLead.lastIndexOf(". ");
    if (lastPeriod > 100) {
      truncatedLead = truncatedLead.slice(0, lastPeriod + 1);
    }
    result = [title, truncatedLead, actionsBlock].filter(Boolean).join("\n\n");
  }

  // Final guarantee: never return less than 200 chars unless source was that short
  if (result.length < 200 && content.length >= 200) {
    // Something went wrong with structure detection - fall back to first 1500 chars
    result = content.slice(0, 1500);
    const lastPeriod = result.lastIndexOf(". ");
    if (lastPeriod > 1200) {
      result = result.slice(0, lastPeriod + 1);
    }
  }

  return result;
}

export async function sendBriefing(
  briefingText: string
): Promise<WhatsAppResult> {
  const config = getTwilioConfig();
  if (!config) {
    const result = { success: false, error: "Twilio not configured" };
    console.error(`[whatsapp] failed: ${result.error}`);
    return result;
  }

  try {
    const client = twilio(config.accountSid, config.authToken);
    const message = await client.messages.create({
      from: config.from,
      to: config.to,
      body: truncateForWhatsApp(briefingText),
    });
    const result = { success: true, messageSid: message.sid };
    console.log(`[whatsapp] sent ${result.messageSid}`);
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown Twilio error";
    const result = { success: false, error };
    console.error(`[whatsapp] failed: ${result.error}`);
    return result;
  }
}
