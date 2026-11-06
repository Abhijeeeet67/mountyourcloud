# MountYourClouds — Razorpay Payment Gateway Setup Guide

MountYourClouds includes a full server-verified **Razorpay** billing integration supporting INR Orders, Recurring Subscriptions, HMAC-SHA256 payment verification, and idempotent Webhooks, manageable directly from the **Owner Administrator Console (`/#/app/admin`)**.

---

## 1. Encryption Prerequisite (`APP_SECRETS_ENCRYPTION_KEY`)

Before saving Razorpay credentials in the Admin Dashboard for production, generate a 32-byte hex key:

```bash
openssl rand -hex 32
```

Set it in your backend environment:

```env
APP_SECRETS_ENCRYPTION_KEY=<your-64-char-hex-key>
```

All Razorpay `Key Secret` and `Webhook Secret` values entered in `/#/app/admin` are encrypted server-side using **AES-256-GCM** and are never returned to the browser after saving.

---

## 2. Configure Razorpay in `/#/app/admin`

1. Sign in as the Owner Administrator (`MOUNTYOURCLOUDS_ADMIN_USER_ID`) and open **Admin Console → Payment Gateway (Razorpay)** (`/#/app/admin`).
2. Choose **Edit Test Credentials** (or **Edit Live Credentials**):
   - **Key ID**: `rzp_test_...` (or `rzp_live_...`)
   - **Key Secret**: Your Razorpay Key Secret (stored encrypted; displayed only as a masked badge such as `••••••••9a1f` after saving).
   - **Webhook Secret**: Your Razorpay Webhook Secret.
   - **Optional Recurring Plan IDs**: `plan_...` for PRO Monthly, PRO Annual, ULTRA Monthly, and ULTRA Annual.
3. Click **Validate Credentials** to verify your `Key ID` and `Key Secret` live against `https://api.razorpay.com/v1/orders`.
4. Toggle **Enable Razorpay Checkout** ON and click **Save Razorpay Gateway Settings**.
5. When ready to accept real payments, switch to **LIVE MODE (`rzp_live_*`)** and confirm the explicit Live Mode activation prompt.

---

## 3. Configure Razorpay Webhooks

1. Copy the **Razorpay Webhook Endpoint URL** shown in `/#/app/admin`:
   ```text
   https://<your-domain>/api/billing/webhook
   ```
2. In your [Razorpay Dashboard → Settings → Webhooks](https://dashboard.razorpay.com/#/app/webhooks), click **+ Add New Webhook**:
   - **Webhook URL**: `https://<your-domain>/api/billing/webhook`
   - **Secret**: Enter the same Webhook Secret you saved in `/#/app/admin`.
   - **Active Events**:
     - `payment.captured`
     - `payment.failed`
     - `order.paid`
     - `subscription.authenticated`
     - `subscription.activated`
     - `subscription.charged`
     - `subscription.cancelled`
     - `subscription.halted`
     - `subscription.completed`

The `/api/billing/webhook` route verifies the `x-razorpay-signature` header against the raw request body using `crypto.timingSafeEqual` and records every processed event ID in `razorpay_webhook_events` to guarantee idempotency.
