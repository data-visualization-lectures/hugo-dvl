const STRIPE_API_BASE = "https://api.stripe.com/v1";
const SITE_FALLBACK_URL = "https://data-viz-lectures.com";

const courses = {
  essentials: {
    title: "【1日間】データ可視化・基礎",
    analyticsCourseName: "一日講習 データ可視化の基礎",
    contentCategory: "bootcamp-1day",
    paymentLinkUrl: "https://buy.stripe.com/9B600k9UO155cRtguc93y0b",
    fallbackPath: "/posts/1day-essentials/",
  },
  map: {
    title: "【1日間】主題地図の可視化・基礎",
    analyticsCourseName: "一日講習 地図とデータ可視化",
    contentCategory: "bootcamp-1day",
    paymentLinkUrl: "https://buy.stripe.com/4gMeVe7MG299eZB0ve93y0a",
    fallbackPath: "/posts/1day-map/",
  },
  wrangling: {
    title: "【1日間】データクレンジング・基礎",
    analyticsCourseName: "一日講習 データの整理術",
    contentCategory: "bootcamp-1day",
    paymentLinkUrl: "https://buy.stripe.com/4gM4gAff80114kX7XG93y0c",
    fallbackPath: "/posts/1day-wrangling/",
  },
  d3: {
    title: "【1日間】D3.js・基礎",
    analyticsCourseName: "一日講習 D3.js",
    contentCategory: "bootcamp-1day",
    paymentLinkUrl: "https://buy.stripe.com/9B6eVegjc6pp2cPfq893y0l",
    fallbackPath: "/posts/1day-d3/",
  },
  "ai-coding-charts": {
    title: "【90分】AIコーディングでつくるインタラクティブチャート・入門",
    analyticsCourseName: "90分講習 AIコーディングでつくるインタラクティブチャート入門",
    contentCategory: "course",
    paymentLinkUrl: "https://buy.stripe.com/eVqeVe0ke4hh4kX1zi93y0m",
    fallbackPath: "/posts/ai-coding-charts/",
  },
};

const priceIdCache = new Map();

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return jsonResponse(500, { error: "STRIPE_SECRET_KEY is not configured." });
  }

  try {
    if (event.httpMethod === "POST") {
      return await createCheckoutSession(event);
    }

    if (event.httpMethod === "GET") {
      return await retrieveCheckoutSession(event);
    }

    return jsonResponse(405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Stripe checkout function failed.", error);
    return jsonResponse(500, { error: "Stripe Checkoutの処理に失敗しました。" });
  }
};

async function createCheckoutSession(event) {
  const payload = parseJsonBody(event.body);
  const courseKey = cleanText(payload.course_key);
  const course = courses[courseKey];
  const schedule = cleanText(payload.schedule);
  const name = cleanText(payload.name);
  const email = cleanText(payload.email).toLowerCase();
  const pagePath = normalizePagePath(payload.page_path, course);

  if (!course) {
    return jsonResponse(400, { error: "Unknown course." });
  }

  if (!isIsoDate(schedule)) {
    return jsonResponse(400, { error: "Invalid schedule." });
  }

  if (!name || !isEmail(email)) {
    return jsonResponse(400, { error: "Invalid attendee information." });
  }

  const siteUrl = getSiteUrl(event);
  const successUrl = `${siteUrl}/pages/checkout-complete/?session_id={CHECKOUT_SESSION_ID}&course_key=${encodeURIComponent(courseKey)}&schedule=${encodeURIComponent(schedule)}`;
  const cancelUrl = `${siteUrl}${pagePath}#application-container-${encodeURIComponent(courseKey)}`;
  const priceId = await resolvePriceId(course);
  const metadata = {
    course_key: courseKey,
    course_title: course.title,
    course_name: course.analyticsCourseName,
    content_category: course.contentCategory,
    schedule,
    attendee_name: name,
    attendee_email: email,
  };

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("locale", "ja");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("customer_email", email);
  params.set("client_reference_id", `${courseKey}:${schedule}`);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price]", priceId);

  Object.entries(metadata).forEach(([key, value]) => {
    params.set(`metadata[${key}]`, value);
    params.set(`payment_intent_data[metadata][${key}]`, value);
  });

  const session = await stripeRequest("/checkout/sessions", {
    method: "POST",
    body: params,
  });

  return jsonResponse(200, {
    id: session.id,
    url: session.url,
  });
}

async function retrieveCheckoutSession(event) {
  const sessionId = cleanText(event.queryStringParameters?.session_id);

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return jsonResponse(400, { error: "Invalid session_id." });
  }

  const session = await stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
  });

  return jsonResponse(200, {
    id: session.id,
    status: session.status,
    payment_status: session.payment_status,
    amount_total: session.amount_total,
    currency: session.currency,
    metadata: publicMetadata(session.metadata || {}),
  });
}

async function resolvePriceId(course) {
  if (!course.paymentLinkUrl) {
    throw new Error(`Payment Link URL is missing for ${course.title}.`);
  }

  if (priceIdCache.has(course.paymentLinkUrl)) {
    return priceIdCache.get(course.paymentLinkUrl);
  }

  const paymentLink = await findPaymentLinkByUrl(course.paymentLinkUrl);
  const lineItems = await stripeRequest(`/payment_links/${paymentLink.id}/line_items?limit=2`, {
    method: "GET",
  });
  const priceId = lineItems.data?.[0]?.price?.id;

  if (!priceId) {
    throw new Error(`Stripe Price is missing for Payment Link ${paymentLink.id}.`);
  }

  priceIdCache.set(course.paymentLinkUrl, priceId);
  return priceId;
}

async function findPaymentLinkByUrl(paymentLinkUrl) {
  let startingAfter = "";

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: "100" });

    if (startingAfter) {
      query.set("starting_after", startingAfter);
    }

    const paymentLinks = await stripeRequest(`/payment_links?${query.toString()}`, {
      method: "GET",
    });
    const match = paymentLinks.data?.find((paymentLink) => paymentLink.url === paymentLinkUrl);

    if (match) {
      return match;
    }

    if (!paymentLinks.has_more || !paymentLinks.data?.length) {
      break;
    }

    startingAfter = paymentLinks.data[paymentLinks.data.length - 1].id;
  }

  throw new Error(`Payment Link was not found: ${paymentLinkUrl}`);
}

async function stripeRequest(path, options) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Stripe API error.", data);
    const message = data.error?.message || "Stripe API request failed.";
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

function parseJsonBody(body) {
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function cleanText(value) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePagePath(pagePath, course) {
  const fallback = course?.fallbackPath || "/";
  const cleaned = cleanText(pagePath);

  if (!cleaned || !cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.includes("://")) {
    return fallback;
  }

  return cleaned;
}

function getSiteUrl(event) {
  const configuredUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  const host = event.headers.host || event.headers.Host || "";
  const protocol = event.headers["x-forwarded-proto"] || "https";
  const rawUrl = configuredUrl || (host ? `${protocol}://${host}` : SITE_FALLBACK_URL);

  return rawUrl.replace(/\/+$/, "");
}

function publicMetadata(metadata) {
  return {
    course_key: metadata.course_key || "",
    course_name: metadata.course_name || "",
    content_category: metadata.content_category || "",
    schedule: metadata.schedule || "",
  };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
