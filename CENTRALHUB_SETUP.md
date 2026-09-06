# CentralHub - Production-Ready Admin Dashboard

CentralHub is a comprehensive multi-store ecommerce admin dashboard built with Next.js, Supabase, and AI-powered features.

## Tech Stack

- **Frontend**: Next.js 13 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **AI**: OpenAI GPT-4o (always configured)
- **Messaging**: Twilio (SMS, WhatsApp ready)
- **State Management**: Zustand

## Key Features

### 1. Multi-Store Management
- Manage multiple stores from one dashboard
- Store-specific product overrides
- Per-store pricing and inventory
- Store analytics and performance tracking

### 2. Product Management
- Global product catalog
- Store-specific overrides (name, price, description, stock)
- SKU generation
- SEO title optimization
- Image management

### 3. Inventory System
- Centralized inventory tracking
- Reserved quantity management
- Low stock alerts
- Inventory logs and history
- Order-inventory synchronization

### 4. Pricing Engine
- Dynamic pricing rules
- Percentage and fixed price adjustments
- Store/category/product-level rules
- Priority-based rule application
- Price simulation and breakdown

### 5. Order Management
- Complete order lifecycle tracking
- Inventory sync on status changes
- Order numbering system
- Payment tracking (multiple methods)
- Delivery management

### 6. AI-Powered Features
- **AI Insights**: Automated stock, sales, pricing, and anomaly detection
- **AI Actions**: Automated suggestions with priority scoring
- **AI Command Chat**: Natural language commands (English + Malayalam)
- **Proactive AI**: Real-time monitoring and alerts
- **AI Pricing Suggestions**: Dynamic pricing recommendations

### 7. Messaging System (NEW)
- SMS, Email, WhatsApp support
- Message templates
- Order status notifications
- Marketing campaigns
- Twilio integration (ready to use)
- Message tracking and analytics

### 8. Analytics Dashboard
- Revenue and sales trends
- Product performance
- Time-series charts
- Activity heatmaps
- Store comparison

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI (Required for AI features)
NEXT_PUBLIC_OPENAI_API_KEY=your_openai_api_key

# Twilio (Optional - for messaging)
NEXT_PUBLIC_TWILIO_ACCOUNT_SID=your_twilio_account_sid
NEXT_PUBLIC_TWILIO_AUTH_TOKEN=your_twilio_auth_token
NEXT_PUBLIC_TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

### AI Configuration

The system is configured to **ALWAYS** use OpenAI's `gpt-4o` model. This is enforced at the configuration level:

- Location: `lib/config/aiConfig.ts`
- Default model: `gpt-4o`
- Provider: `openai`
- Temperature: `0.7`
- Max tokens: `2000`

The AI configuration is centralized and validates that:
1. Model is always `gpt-4o`
2. Provider is always `openai`
3. Configuration never returns undefined
4. All AI services use the centralized config

### Messaging Setup

1. Sign up for [Twilio](https://www.twilio.com/)
2. Get your Account SID, Auth Token, and Phone Number
3. Add credentials to `.env`
4. Messages will automatically be sent via Twilio
5. Access messaging at `/messaging`

## Installation

```bash
# Install dependencies
npm install

# Run database migrations
# (Migrations are applied automatically via Supabase)

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
├── app/                    # Next.js app router pages
│   ├── dashboard/         # Main analytics dashboard
│   ├── inventory/         # Inventory management
│   ├── messaging/         # Messaging center (NEW)
│   ├── orders/            # Order management
│   ├── pricing/           # Pricing rules
│   └── stores/            # Store management
├── components/            # React components
│   ├── AICommandChat.tsx  # AI chat interface
│   ├── MessagingPanel.tsx # Messaging UI (NEW)
│   ├── ProductsTable.tsx  # Product grid
│   └── ...
├── lib/
│   ├── config/            # Configuration files
│   │   └── aiConfig.ts   # AI model configuration (gpt-4o)
│   ├── services/          # Business logic services
│   │   ├── aiService.ts  # Centralized AI service
│   │   ├── messagingService.ts  # Messaging service (NEW)
│   │   ├── productService.ts
│   │   ├── orderService.ts
│   │   └── ...
│   ├── store/             # Zustand state management
│   ├── supabase.ts        # Supabase client
│   └── types.ts           # TypeScript types
└── supabase/
    └── migrations/        # Database migrations
```

## Database Schema

The database includes these main tables:

- `stores` - Store information
- `products` - Global product catalog
- `store_products` - Store-specific overrides
- `central_inventory` - Centralized inventory
- `orders` - Order records
- `order_items` - Order line items
- `pricing_rules` - Dynamic pricing rules
- `ai_insights` - AI-generated insights
- `ai_actions` - AI-suggested actions
- `message_templates` - Message templates (NEW)
- `messages` - Sent messages (NEW)
- `message_campaigns` - Marketing campaigns (NEW)

## Error Safety

All services implement error-safe patterns:

1. **Default Values**: Every function returns a safe default (empty array, 0, etc.)
2. **Try-Catch**: All async operations wrapped in error handlers
3. **Null Checks**: All data access checks for null/undefined
4. **Type Safety**: Full TypeScript coverage
5. **Fallback UI**: Loading and empty states in all components

## AI Model Guarantee

The system guarantees that:
- AI model is **ALWAYS** `gpt-4o`
- Model is **NEVER** undefined
- All AI services use centralized configuration
- Model configuration is validated on every request

Location: `lib/config/aiConfig.ts`

```typescript
export const DEFAULT_AI_CONFIG: AIConfig = {
  model: 'gpt-4o',        // ← ALWAYS gpt-4o
  temperature: 0.7,
  maxTokens: 2000,
  provider: 'openai',     // ← ALWAYS openai
};
```

## Navigation

Desktop:
- Left sidebar with all main sections
- Top bar with store selector and user menu

Mobile:
- Top header with menu
- Bottom navigation bar
- Responsive design for all screens

## Usage

### Sending Messages

1. Navigate to `/messaging`
2. Click "Send Message"
3. Enter recipient details
4. Choose template or write custom message
5. Send via SMS/Email/WhatsApp

### Using AI Commands

1. Click the AI chat button
2. Type natural language commands:
   - "show low stock"
   - "increase atta price by 10%"
   - "restock rice to 100 units"
3. Confirm suggested actions
4. View results

### Managing Orders

1. Go to `/orders`
2. View all orders with status
3. Update order status
4. Inventory automatically syncs
5. Customer notifications sent (if messaging configured)

### Setting Pricing Rules

1. Go to `/pricing`
2. Create rules for stores/categories/products
3. Set percentage or fixed adjustments
4. Rules apply automatically
5. Preview in price simulator

## Support

For issues or questions:
- Check the console for detailed error messages
- All services log errors with context
- Database operations are logged
- AI requests show model information

## Best Practices

1. **Always** configure OpenAI API key for AI features
2. **Optional** configure Twilio for messaging
3. Enable RLS policies for security
4. Use store overrides for multi-store pricing
5. Monitor AI insights daily
6. Review and approve AI actions
7. Track message delivery rates
8. Use templates for consistent messaging

## License

Proprietary - CentralHub Admin Dashboard
