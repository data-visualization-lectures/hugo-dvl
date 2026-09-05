const crypto = require("crypto");
const { sendPurchaseEvent } = require("./lib/ga4-purchase");

const TRACKED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method not allowed",
    };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured.");
    return {
      statusCode: 500,
      body: "Webhook secret is not configured.",
    };
  }

  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  if (!signature) {
    return {
      statusCode: 400,
      body: "Missing Stripe-Signature header.",
    };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");

  let stripeEvent;
  try {
    stripeEvent = constructStripeEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed.", error);
    return {
      statusCode: 400,
      body: "Invalid signature.",
    };
  }

  if (!TRACKED_EVENTS.has(stripeEvent.type)) {
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, ignored: stripeEvent.type }),
    };
  }

  const session = stripeEvent.data?.object;
  if (!session || session.object !== "checkout.session") {
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, ignored: "non_checkout_session" }),
    };
  }

  if (session.payment_status !== "paid") {
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, ignored: "not_paid" }),
    };
  }

  try {
    const result = await sendPurchaseEvent(session);
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, ga4: result }),
    };
  } catch (error) {
    console.error("Failed to send GA4 purchase via Measurement Protocol.", error);
    return {
      statusCode: 500,
      body: "Failed to send analytics event.",
    };
  }
};

function constructStripeEvent(payload, header, secret) {
  const elements = String(header).split(",").map((part) => part.trim());
  const timestamp = elements.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = elements
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    throw new Error("Malformed Stripe-Signature header.");
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new Error("Stripe webhook timestamp is outside tolerance.");
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const matched = signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature, "utf8");
    return actualBuffer.length === expectedBuffer.length
      && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  });

  if (!matched) {
    throw new Error("Stripe webhook signature mismatch.");
  }

  return JSON.parse(payload);
}
