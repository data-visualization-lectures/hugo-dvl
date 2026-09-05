const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const DEFAULT_MEASUREMENT_ID = "G-GGNSDEK3RD";

async function sendPurchaseEvent(session) {
  const measurementId = process.env.GA4_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  if (!apiSecret) {
    console.warn("GA4_API_SECRET is not configured. Skipping Measurement Protocol purchase.");
    return { skipped: true, reason: "missing_api_secret" };
  }

  if (!session?.id || session.payment_status !== "paid") {
    return { skipped: true, reason: "not_paid" };
  }

  const metadata = session.metadata || {};
  const clientId = sanitizeClientId(metadata.ga_client_id) || `stripe.${session.id}`;
  const sessionId = sanitizeSessionId(metadata.ga_session_id);
  const courseKey = cleanText(metadata.course_key) || "unknown";
  const courseName = cleanText(metadata.course_name) || courseKey;
  const contentCategory = cleanText(metadata.content_category);
  const schedule = cleanText(metadata.schedule);
  const currency = String(session.currency || "jpy").toUpperCase();
  const value = typeof session.amount_total === "number" ? session.amount_total : undefined;

  const eventParams = {
    transaction_id: session.id,
    affiliation: "Stripe Checkout",
    currency,
    engagement_time_msec: 1,
    event_source: "server",
    course_key: courseKey,
    course_name: courseName,
    content_category: contentCategory,
    schedule,
    items: [
      {
        item_id: courseKey,
        item_name: courseName,
        item_category: contentCategory,
        price: value,
        quantity: 1,
      },
    ],
  };

  if (typeof value === "number") {
    eventParams.value = value;
  }

  if (sessionId) {
    eventParams.session_id = sessionId;
  }

  const payload = {
    client_id: clientId,
    events: [
      {
        name: "purchase",
        params: eventParams,
      },
    ],
  };

  const url = `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Measurement Protocol request failed: ${response.status} ${body}`);
  }

  return {
    skipped: false,
    transaction_id: session.id,
    client_id: clientId,
  };
}

function sanitizeClientId(value) {
  const cleaned = cleanText(value);
  return /^\d+\.\d+$/.test(cleaned) ? cleaned : "";
}

function sanitizeSessionId(value) {
  const cleaned = cleanText(value);
  return /^\d{1,20}$/.test(cleaned) ? cleaned : "";
}

function cleanText(value) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

module.exports = {
  sendPurchaseEvent,
};
