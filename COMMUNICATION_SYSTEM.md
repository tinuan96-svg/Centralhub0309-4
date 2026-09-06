# Production-Grade Event-Driven Communication System

## Overview

This is a **production-ready**, **event-driven** communication system for multi-tenant ecommerce platforms, inspired by Shopify + Klaviyo architecture.

## Architecture Philosophy

```
Events → Automation Engine → Message Queue → Worker → Provider (Twilio)
```

**CRITICAL**: Messages are NEVER sent directly from business logic. Everything flows through the event-driven system.

## Key Features

### 1. Event-Driven Architecture
- Decoupled from business logic
- Events trigger automations automatically
- Messages scheduled through queue system
- No direct API calls from order/user logic

### 2. Multi-Tenant Support
- Site-specific templates and automations
- Per-site message tracking
- Branding per site/store

### 3. Message Queue with Retry Logic
- Automatic retry (max 3 attempts)
- Exponential backoff
- Status tracking (pending → processing → sent/failed)
- Scheduled message support

### 4. Template Engine
- Variable replacement `{customer_name}`, `{order_number}`, etc.
- Template preview with sample data
- Template validation
- Reusable across channels

### 5. Smart Channel Selection
- Preferred channel support
- Automatic fallback: WhatsApp → SMS
- Channel availability checking

### 6. OTP System
- 6-digit code generation
- Expiry management (default 10 minutes)
- Rate limiting (60 seconds cooldown)
- Purpose-based (login, signup, verify, reset_password)

### 7. Marketing Campaigns
- Audience targeting
- Schedule support
- Batch sending
- Campaign analytics

## Database Schema

### comm_messages (Message Queue)
```sql
- id (uuid)
- phone (text)
- email (text, nullable)
- message (text) -- Final rendered message
- channel (sms | whatsapp | email)
- status (pending | processing | sent | failed)
- retries (int, default 0)
- max_retries (int, default 3)
- site (text) -- Multi-tenant identifier
- template_id (uuid, nullable)
- event_id (uuid, nullable)
- campaign_id (uuid, nullable)
- scheduled_at (timestamp) -- When to send
- sent_at (timestamp, nullable)
- error_message (text, nullable)
- provider_id (text, nullable) -- Twilio SID
```

### comm_templates
```sql
- id (uuid)
- name (text, unique) -- Identifier for code
- display_name (text) -- Human-readable
- content (text) -- Template with {variables}
- channel (sms | whatsapp | email)
- category (transactional | marketing | otp | system)
- site (text, nullable) -- Site-specific template
- variables (jsonb) -- Array of variable names
- is_active (boolean)
```

### comm_events
```sql
- id (uuid)
- type (text) -- signup, order_placed, order_shipped, etc.
- payload (jsonb) -- Event data with variables
- site (text)
- user_id (uuid, nullable)
- order_id (uuid, nullable)
- processed (boolean)
```

### comm_automations
```sql
- id (uuid)
- name (text)
- event_type (text) -- Which event triggers this
- template_id (uuid) -- Which template to use
- delay_minutes (int) -- Delay before sending
- channel (sms | whatsapp | email)
- site (text, nullable) -- Site-specific automation
- conditions (jsonb, nullable) -- Filtering conditions
- is_active (boolean)
- priority (int) -- Higher = more important
```

### comm_campaigns
```sql
- id (uuid)
- name (text)
- message (text)
- channel (sms | whatsapp | email)
- audience_filter (jsonb) -- Who receives this
- site (text)
- scheduled_at (timestamp, nullable)
- status (draft | scheduled | sending | sent | cancelled)
- total_recipients (int)
- sent_count (int)
- delivered_count (int)
- failed_count (int)
```

### comm_otp_codes
```sql
- id (uuid)
- phone (text)
- code (text) -- 6-digit code
- purpose (login | signup | verify | reset_password)
- site (text)
- verified (boolean)
- expires_at (timestamp)
```

### comm_user_preferences
```sql
- id (uuid)
- user_id (uuid, nullable)
- phone (text)
- email (text, nullable)
- site (text)
- marketing_sms (boolean)
- marketing_whatsapp (boolean)
- marketing_email (boolean)
- transactional_sms (boolean)
- transactional_whatsapp (boolean)
- transactional_email (boolean)
- preferred_channel (sms | whatsapp | email, nullable)
```

## Services

### 1. EventHandlerService
**Purpose**: Process events and create messages from automations

```typescript
import { EventHandlerService } from '@/lib/services/comm/eventHandlerService';

// Create an event
await EventHandlerService.createEvent(
  'order_placed',
  {
    customer_name: 'John Doe',
    customer_phone: '+447123456789',
    customer_email: 'john@example.com',
    order_number: 'ORD-12345',
    total: '£49.99',
  },
  'KG', // site
  userId,
  orderId
);

// The system automatically:
// 1. Finds matching automations
// 2. Renders templates with variables
// 3. Creates messages in queue
// 4. Schedules based on delay_minutes
```

### 2. TemplateEngineService
**Purpose**: Manage templates and variable replacement

```typescript
import { TemplateEngineService } from '@/lib/services/comm/templateEngineService';

// Render template
const message = await TemplateEngineService.renderTemplate(
  'order_confirmed',
  {
    customer_name: 'John Doe',
    order_number: 'ORD-12345',
    total: '£49.99',
  }
);

// Extract variables
const vars = TemplateEngineService.extractVariables(
  'Hi {name}, your order #{order_id} is ready'
);
// Returns: ['name', 'order_id']

// Preview template
const preview = TemplateEngineService.previewTemplate(
  'Hi {customer_name}, welcome!',
  { customer_name: 'Jane' }
);
```

### 3. MessageWorkerService
**Purpose**: Process message queue with retry logic

```typescript
import { MessageWorkerService } from '@/lib/services/comm/messageWorkerService';

// Process pending messages (call this from cron/worker)
const result = await MessageWorkerService.processPendingMessages(10);
// { processed: 5, succeeded: 4, failed: 1 }

// Start worker (runs every 10 seconds)
const interval = MessageWorkerService.startWorker(10);

// Stop worker
MessageWorkerService.stopWorker(interval);

// Retry failed message
await MessageWorkerService.retryFailedMessage(messageId);

// Get queue stats
const stats = await MessageWorkerService.getQueueStats();
// { pending: 12, processing: 2, sent: 145, failed: 3, overdue: 1 }
```

### 4. ProviderService
**Purpose**: Abstraction layer for SMS/WhatsApp/Email providers

```typescript
import { ProviderService } from '@/lib/services/comm/providerService';

// Send message (handles Twilio internally)
const result = await ProviderService.sendMessage(
  'sms',
  '+447123456789',
  'Your order is confirmed!'
);

// Smart channel selection
const channel = await ProviderService.smartChannelSelection(
  '+447123456789',
  'email@example.com',
  null // preferred channel
);
// Returns 'whatsapp' if available, else 'sms'

// Check provider status
const status = ProviderService.getProviderStatus();
// { sms: true, whatsapp: false, email: false }
```

### 5. OTPService
**Purpose**: Generate and verify OTP codes

```typescript
import { OTPService } from '@/lib/services/comm/otpService';

// Send OTP
const result = await OTPService.sendOTP(
  '+447123456789',
  'login',
  'KG',
  10 // expiry minutes
);
// { success: true, code: '123456' }

// Verify OTP
const verified = await OTPService.verifyOTP(
  '+447123456789',
  '123456',
  'login',
  'KG'
);
// { success: true }

// Resend with cooldown
const resent = await OTPService.resendOTP(
  '+447123456789',
  'login',
  'KG'
);
```

### 6. CampaignService
**Purpose**: Manage marketing campaigns

```typescript
import { CampaignService } from '@/lib/services/comm/campaignService';

// Create campaign
const campaign = await CampaignService.createCampaign({
  name: 'Flash Sale',
  message: 'FLASH SALE! 50% off all items. Shop now!',
  channel: 'sms',
  audience_filter: { type: 'recent_customers', days: 30 },
  site: 'KG',
  scheduled_at: null,
  status: 'draft',
  total_recipients: 0,
  created_by: userId,
});

// Launch campaign
const result = await CampaignService.launchCampaign(campaign.id);
// { success: true }

// Get campaign stats
const stats = await CampaignService.getCampaignStats();
// { total: 10, draft: 3, scheduled: 2, sent: 5, cancelled: 0 }
```

### 7. CommunicationService
**Purpose**: High-level API combining all services

```typescript
import { CommunicationService } from '@/lib/services/comm/communicationService';

// Send message (manual)
await CommunicationService.sendMessage({
  phone: '+447123456789',
  email: 'customer@example.com',
  message: 'Custom message',
  channel: 'sms',
  site: 'KG',
  template_name: 'order_confirmed', // Optional
  variables: { order_number: 'ORD-123' }, // Optional
});

// Get messages with filters
const messages = await CommunicationService.getMessages(50, {
  status: 'sent',
  channel: 'sms',
  site: 'KG',
});

// Get analytics
const analytics = await CommunicationService.getAnalytics('KG');
// {
//   total_messages: 1250,
//   pending_messages: 12,
//   sent_messages: 1200,
//   failed_messages: 38,
//   delivery_rate: 97,
//   messages_by_channel: { sms: 800, whatsapp: 400, email: 50 },
//   messages_by_site: { KG: 900, SiteB: 350 },
//   messages_by_day: [...]
// }

// Get automations
const automations = await CommunicationService.getAutomations('KG');

// Toggle automation
await CommunicationService.toggleAutomation(automationId);
```

## Usage Examples

### Example 1: Order Confirmation Flow

```typescript
// In your order creation logic
import { EventHandlerService } from '@/lib/services/comm/eventHandlerService';

async function createOrder(orderData) {
  // Create order in database
  const order = await db.createOrder(orderData);

  // DO NOT send message directly
  // Instead, emit an event
  await EventHandlerService.createEvent(
    'order_placed',
    {
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email,
      order_number: order.order_number,
      total: `£${(order.total / 100).toFixed(2)}`,
    },
    order.site,
    order.user_id,
    order.id
  );

  return order;
}

// The system automatically:
// 1. Finds "order_placed" automation
// 2. Uses "order_confirmed" template
// 3. Replaces variables
// 4. Queues message
// 5. Worker sends via Twilio
```

### Example 2: OTP Login

```typescript
import { OTPService } from '@/lib/services/comm/otpService';

async function sendLoginOTP(phone: string) {
  const result = await OTPService.sendOTP(
    phone,
    'login',
    'KG',
    10 // 10 minutes expiry
  );

  if (result.success) {
    return { success: true };
  } else {
    return { success: false, error: result.error };
  }
}

async function verifyLoginOTP(phone: string, code: string) {
  const result = await OTPService.verifyOTP(phone, code, 'login', 'KG');

  if (result.success) {
    // Create session, etc.
    return { success: true };
  } else {
    return { success: false, error: 'Invalid or expired OTP' };
  }
}
```

### Example 3: Marketing Campaign

```typescript
import { CampaignService } from '@/lib/services/comm/campaignService';

async function launchFlashSale() {
  // Create campaign
  const campaign = await CampaignService.createCampaign({
    name: 'Weekend Flash Sale',
    message: 'WEEKEND SPECIAL! 40% OFF everything. Use code WEEKEND40. Shop now: https://kg.com/sale',
    channel: 'sms',
    audience_filter: {
      type: 'recent_customers',
      days: 90,
    },
    site: 'KG',
    scheduled_at: null, // Send immediately
    status: 'draft',
    total_recipients: 0,
    created_by: adminUserId,
  });

  // Launch campaign
  const result = await CampaignService.launchCampaign(campaign.id);

  if (result.success) {
    console.log('Campaign launched successfully!');
  }
}
```

## UI Components

### /communication
Main dashboard with 5 tabs:

1. **Messages Tab** (`MessagesTab.tsx`)
   - View message queue
   - Filter by status, channel, site
   - Retry failed messages
   - Real-time updates (5s refresh)

2. **Templates Tab**
   - Create/edit templates
   - Variable management
   - Template preview
   - Category organization

3. **Automations Tab**
   - Link events → templates
   - Set delays
   - Configure conditions
   - Toggle active/inactive

4. **Campaigns Tab**
   - Create campaigns
   - Audience targeting
   - Schedule sending
   - Track performance

5. **Analytics Tab**
   - Message stats
   - Channel breakdown
   - Site breakdown
   - Time-series charts

## Environment Variables

```env
# Twilio (Required for SMS/WhatsApp)
NEXT_PUBLIC_TWILIO_ACCOUNT_SID=your_account_sid
NEXT_PUBLIC_TWILIO_AUTH_TOKEN=your_auth_token
NEXT_PUBLIC_TWILIO_PHONE_NUMBER=+1234567890
NEXT_PUBLIC_TWILIO_WHATSAPP_NUMBER=+1234567890 # Optional

# OpenAI (Already configured for AI features)
NEXT_PUBLIC_OPENAI_API_KEY=your_api_key
```

## Message Worker Setup

The message worker processes the queue automatically. You can:

### Option 1: Client-side worker (development)
```typescript
// In a useEffect or similar
import { MessageWorkerService } from '@/lib/services/comm/messageWorkerService';

useEffect(() => {
  const interval = MessageWorkerService.startWorker(10); // 10 seconds
  return () => MessageWorkerService.stopWorker(interval);
}, []);
```

### Option 2: Server-side cron (production)
Create an API route that runs every 10 seconds:

```typescript
// app/api/cron/process-messages/route.ts
import { MessageWorkerService } from '@/lib/services/comm/messageWorkerService';

export async function GET() {
  const result = await MessageWorkerService.processPendingMessages(20);
  return Response.json(result);
}
```

Then configure your hosting platform to hit this endpoint every 10 seconds.

## Default Templates

The system includes pre-configured templates:

- `otp_login` - OTP code messages
- `order_confirmed` - Order confirmation
- `order_packed` - Order packed notification
- `order_shipped` - Shipping notification
- `order_delivered` - Delivery confirmation
- `welcome_new_customer` - Welcome message
- `abandoned_cart` - Cart reminder
- `reorder_reminder` - Restock reminder
- `review_request` - Review request
- `flash_sale` - Sale announcements

## Default Automations

Pre-configured automations:

1. **Order Confirmation** (instant)
   - Event: `order_placed`
   - Template: `order_confirmed`
   - Delay: 0 minutes

2. **Order Shipped** (instant)
   - Event: `order_shipped`
   - Template: `order_shipped`
   - Delay: 0 minutes

3. **Review Request** (5 days after delivery)
   - Event: `order_delivered`
   - Template: `review_request`
   - Delay: 7200 minutes (5 days)

## Best Practices

1. **Always use events, never send directly**
   ```typescript
   // ❌ BAD
   await sendSMS(phone, 'Your order is confirmed');

   // ✅ GOOD
   await EventHandlerService.createEvent('order_placed', payload, site);
   ```

2. **Use templates for consistency**
   - Don't hardcode messages
   - Use template system
   - Maintain brand voice

3. **Respect user preferences**
   - Check opt-in/opt-out status
   - Honor preferred channel
   - Follow regulations (GDPR, TCPA)

4. **Monitor queue health**
   - Check failed messages
   - Review retry patterns
   - Monitor delivery rates

5. **Test with mock mode**
   - Without Twilio credentials, system runs in mock mode
   - Messages logged to console
   - Full functionality without sending

## Testing

```typescript
// Test event flow
await EventHandlerService.createEvent(
  'order_placed',
  {
    customer_name: 'Test User',
    customer_phone: '+447123456789',
    order_number: 'TEST-001',
    total: '£10.00',
  },
  'KG'
);

// Check if message was created
const messages = await CommunicationService.getMessages(10);
console.log(messages);

// Process queue manually
const result = await MessageWorkerService.processPendingMessages();
console.log(result);
```

## Architecture Benefits

1. **Decoupled** - Business logic separate from messaging
2. **Scalable** - Queue-based processing
3. **Reliable** - Automatic retries
4. **Flexible** - Easy to add new channels/providers
5. **Multi-tenant** - Site-specific everything
6. **Auditable** - Complete message history
7. **Testable** - Mock mode for development

## Future Enhancements

- Email provider integration (SendGrid, Postmark)
- Web push notifications
- In-app notifications
- A/B testing for campaigns
- Advanced segmentation
- Delivery webhooks from Twilio
- Message analytics dashboards
- Template A/B testing
- Rate limiting per site
- Cost tracking per message

## Support

Access the Communication Center at `/communication`

All services log errors with full context for easy debugging.

---

**Built with**: Next.js, TypeScript, Supabase, Twilio
**Architecture**: Event-driven, Queue-based, Multi-tenant
**Status**: Production-ready ✅
