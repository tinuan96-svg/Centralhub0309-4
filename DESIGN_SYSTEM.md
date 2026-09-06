# CentralHub Design System

## 🎯 Overview

This is the **ENFORCED** design system for CentralHub. ALL pages, components, and features MUST follow these rules without exception.

**Design Language:** Modern dark SaaS dashboard with clean aesthetics, subtle gradients, and high contrast readability.

---

## 🚨 STRICT RULES

### DO NOT:
- ❌ Use light backgrounds (white, gray-50, gray-100)
- ❌ Create custom card styles per page
- ❌ Mix different padding/spacing values
- ❌ Use inline styles
- ❌ Create duplicate components
- ❌ Use gradients other than blue→purple
- ❌ Hardcode colors - always use design tokens

### DO:
- ✅ Import components from `@/lib/design-system`
- ✅ Use design tokens for all styling
- ✅ Follow the page structure template
- ✅ Maintain consistent spacing
- ✅ Use semantic component naming

---

## 📦 Installation & Usage

### Import Components

```tsx
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Badge,
  StatCard,
  StatGrid,
  PageHeader,
  SectionHeader,
  designTokens,
  getInputClasses,
} from '@/lib/design-system';
```

---

## 🎨 Design Tokens

### Colors

```tsx
// Background
designTokens.colors.background.main          // bg-slate-950
designTokens.colors.background.secondary     // bg-slate-900
designTokens.colors.background.card          // bg-slate-900/60 (with transparency)
designTokens.colors.background.cardSolid     // bg-slate-900
designTokens.colors.background.overlay       // bg-slate-900/80

// Gradients
designTokens.colors.gradient.primary         // bg-gradient-to-r from-blue-500 to-purple-600
designTokens.colors.gradient.primaryHover    // hover:from-blue-600 hover:to-purple-700
designTokens.colors.gradient.text            // bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent

// Borders
designTokens.colors.border.default           // border-slate-800
designTokens.colors.border.hover             // hover:border-slate-700
designTokens.colors.border.focus             // focus:border-blue-500

// Text
designTokens.colors.text.primary             // text-white
designTokens.colors.text.secondary           // text-slate-400
designTokens.colors.text.muted               // text-slate-500

// Status
designTokens.colors.status.success           // text-green-400
designTokens.colors.status.successBg         // bg-green-500/10
designTokens.colors.status.successBorder     // border-green-500/20

// Same pattern for: warning, danger, info
```

### Spacing

```tsx
designTokens.spacing.page        // px-6 py-4 (page container)
designTokens.spacing.section     // space-y-6 (between sections)
designTokens.spacing.card        // p-6 (inside cards)
designTokens.spacing.cardSm      // p-4 (smaller cards)
designTokens.spacing.grid        // gap-6 (grid gaps)
designTokens.spacing.gridSm      // gap-4 (smaller grids)
```

### Typography

```tsx
designTokens.typography.pageTitle         // text-2xl font-bold text-white
designTokens.typography.sectionTitle      // text-xl font-semibold text-white
designTokens.typography.cardTitle         // text-lg font-semibold text-white
designTokens.typography.body              // text-sm text-slate-400
designTokens.typography.label             // text-xs font-medium text-slate-500 uppercase tracking-wider
designTokens.typography.metric            // text-3xl font-bold text-white
designTokens.typography.metricLabel       // text-xs text-slate-500
```

### Border Radius

```tsx
designTokens.borderRadius.card      // rounded-2xl
designTokens.borderRadius.button    // rounded-xl
designTokens.borderRadius.input     // rounded-xl
designTokens.borderRadius.badge     // rounded-lg
designTokens.borderRadius.full      // rounded-full
```

### Layout

```tsx
designTokens.layout.topbarHeight    // h-16
designTokens.layout.sidebarWidth    // w-64
designTokens.layout.containerMax    // max-w-7xl
```

---

## 🧩 Components

### Button

```tsx
<Button variant="primary">Primary Action</Button>
<Button variant="secondary">Secondary Action</Button>
<Button variant="danger">Delete</Button>
<Button variant="ghost">Ghost Button</Button>
```

**Variants:**
- `primary` - Blue to purple gradient (default)
- `secondary` - Slate background with border
- `danger` - Red background for destructive actions
- `ghost` - Transparent with hover effect

### Card

```tsx
<Card variant="default">
  <CardContent>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardContent>
</Card>
```

**With Header:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title in Header</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Main content
  </CardContent>
</Card>
```

**Variants:**
- `default` - Standard card with backdrop blur
- `glass` - More transparent glass effect

### Badge

```tsx
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Error</Badge>
<Badge variant="info">Info</Badge>
```

### StatCard

```tsx
<StatCard
  label="Total Revenue"
  value="£12,345"
  icon="💰"
  trend={{ value: 12.5, isPositive: true }}
  description="vs last month"
/>
```

**StatGrid** - For laying out multiple stats:
```tsx
<StatGrid columns={3}>
  <StatCard label="..." value="..." />
  <StatCard label="..." value="..." />
  <StatCard label="..." value="..." />
</StatGrid>
```

**Columns:** 2, 3, or 4 (responsive)

### PageHeader

```tsx
<PageHeader
  icon="🏪"
  title="Store Management"
  subtitle="Manage all your store locations"
  action={
    <Button variant="primary">Add Store</Button>
  }
/>
```

### SectionHeader

```tsx
<SectionHeader
  title="Recent Orders"
  subtitle="Latest customer orders"
  action={
    <Button variant="secondary">View All</Button>
  }
/>
```

### Inputs

```tsx
<input
  type="text"
  placeholder="Search..."
  className={getInputClasses()}
/>

<select className={getInputClasses()}>
  <option>Option 1</option>
</select>
```

---

## 📐 Page Structure

**Every page MUST follow this structure:**

```tsx
export default function YourPage() {
  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        {/* 1. Page Header */}
        <PageHeader
          icon="🎯"
          title="Page Title"
          subtitle="Page description"
          action={<Button>Action</Button>}
        />

        {/* 2. Content Sections */}
        <div className={designTokens.spacing.section}>
          {/* 2a. Optional Stats */}
          <StatGrid columns={3}>
            <StatCard label="..." value="..." icon="📊" />
            <StatCard label="..." value="..." icon="💰" />
            <StatCard label="..." value="..." icon="✨" />
          </StatGrid>

          {/* 2b. Main Content Cards */}
          <Card>
            <CardContent>
              <SectionHeader title="Section Title" />
              {/* Content */}
            </CardContent>
          </Card>

          {/* 2c. Additional Sections */}
          <Card>
            <CardContent>
              {/* More content */}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

---

## 🎨 Color Usage Guide

### Primary Gradient (Blue → Purple)
- **Use for:** Logos, primary buttons, important CTAs, active states
- **Example:** `className={designTokens.colors.gradient.primary}`

### Background Colors
- **Main:** Page background (slate-950)
- **Secondary:** Section backgrounds (slate-900)
- **Card:** Card backgrounds with transparency for glass effect (slate-900/60)
- **Overlay:** Modals, topbar (slate-900/80)

### Text Colors
- **Primary (white):** Headings, important text
- **Secondary (slate-400):** Body text, descriptions
- **Muted (slate-500):** Labels, less important info

### Status Colors
- **Success (green):** Completed, active, positive trends
- **Warning (yellow):** Pending, needs attention
- **Danger (red):** Errors, destructive actions, negative trends
- **Info (blue):** Informational, neutral status

---

## 📏 Spacing System

**Based on 4px increments:**

| Token | Class | Use Case |
|-------|-------|----------|
| `spacing.page` | `px-6 py-4` | Page container padding |
| `spacing.section` | `space-y-6` | Vertical spacing between major sections |
| `spacing.card` | `p-6` | Padding inside cards |
| `spacing.cardSm` | `p-4` | Smaller card padding |
| `spacing.grid` | `gap-6` | Grid gaps |
| `spacing.gridSm` | `gap-4` | Smaller grid gaps |

**Additional spacing:**
- `gap-2` - Very tight spacing (inline items)
- `gap-3` - Tight spacing (related items)
- `gap-4` - Normal spacing (list items)
- `gap-6` - Loose spacing (sections)
- `gap-8` - Wide spacing (major sections)

---

## 📱 Responsive Grid System

```tsx
// 3 columns on desktop, 2 on tablet, 1 on mobile
<StatGrid columns={3}>
  {/* Cards */}
</StatGrid>

// Custom grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Items */}
</div>
```

---

## 🎭 Interactive States

### Buttons
- **Hover:** Gradient shifts slightly darker
- **Active:** Pressed state
- **Disabled:** 50% opacity, no pointer events

### Cards
- **Default:** Slate background with border
- **Hover:** Optional border color change
- **Focus:** For interactive cards

### Inputs
- **Default:** Slate background with border
- **Hover:** Border brightens
- **Focus:** Blue ring appears
- **Error:** Red border and ring

---

## 🔧 Helper Functions

### getButtonClasses(variant)
Returns complete button classes for a variant.

```tsx
getButtonClasses('primary')   // Blue-purple gradient button
getButtonClasses('secondary') // Slate button with border
getButtonClasses('danger')    // Red danger button
getButtonClasses('ghost')     // Transparent button
```

### getCardClasses(variant)
Returns complete card classes.

```tsx
getCardClasses('default')  // Standard card
getCardClasses('glass')    // Glass effect card
```

### getBadgeClasses(variant)
Returns complete badge classes.

```tsx
getBadgeClasses('success')  // Green badge
getBadgeClasses('warning')  // Yellow badge
getBadgeClasses('danger')   // Red badge
getBadgeClasses('info')     // Blue badge
```

### getInputClasses()
Returns complete input/select classes.

```tsx
<input className={getInputClasses()} />
<select className={getInputClasses()} />
```

---

## ✅ Validation Checklist

Before pushing any new page or component:

- [ ] Uses components from `@/lib/design-system`
- [ ] Uses design tokens for ALL colors
- [ ] Uses design tokens for spacing
- [ ] Follows page structure template
- [ ] Has PageHeader with icon, title, subtitle
- [ ] Uses Card components (not custom divs)
- [ ] Uses Button component (not custom buttons)
- [ ] Uses Badge component for status
- [ ] Has consistent spacing (no random padding)
- [ ] No inline styles
- [ ] No hardcoded colors
- [ ] Responsive on mobile/tablet/desktop
- [ ] Uses blue→purple gradient (not cyan)

---

## 🚀 Quick Start Examples

### Simple Page

```tsx
import { PageHeader, Card, CardContent, designTokens } from '@/lib/design-system';

export default function SimplePage() {
  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        <PageHeader
          icon="🎯"
          title="Simple Page"
          subtitle="This is a basic page example"
        />

        <div className={designTokens.spacing.section}>
          <Card>
            <CardContent>
              <p className={designTokens.typography.body}>
                Your content here
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

### Page with Stats

```tsx
import { PageHeader, StatGrid, StatCard, Card, CardContent, designTokens } from '@/lib/design-system';

export default function StatsPage() {
  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        <PageHeader
          icon="📊"
          title="Analytics"
          subtitle="View your performance metrics"
        />

        <div className={designTokens.spacing.section}>
          <StatGrid columns={3}>
            <StatCard
              label="Total Orders"
              value="1,234"
              icon="📦"
              trend={{ value: 12, isPositive: true }}
            />
            <StatCard
              label="Revenue"
              value="£56,789"
              icon="💰"
              trend={{ value: 8, isPositive: true }}
            />
            <StatCard
              label="Customers"
              value="456"
              icon="👥"
            />
          </StatGrid>

          <Card>
            <CardContent>
              {/* More content */}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

---

## 🎨 Common Patterns

### Table in Card

```tsx
<Card>
  <CardContent padding="normal">
    <table className="w-full">
      <thead>
        <tr className={`border-b ${designTokens.colors.border.default}`}>
          <th className={`px-4 py-3 text-left ${designTokens.typography.label}`}>
            Header
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className={`border-b ${designTokens.colors.border.default} hover:bg-slate-800/30 ${designTokens.transition.default}`}>
          <td className="px-4 py-3">
            <span className={designTokens.typography.body}>Data</span>
          </td>
        </tr>
      </tbody>
    </table>
  </CardContent>
</Card>
```

### Form in Card

```tsx
<Card>
  <CardHeader>
    <CardTitle>Form Title</CardTitle>
    <CardDescription>Form description</CardDescription>
  </CardHeader>
  <CardContent>
    <form className="space-y-4">
      <div>
        <label className={designTokens.typography.label}>
          Field Label
        </label>
        <input
          type="text"
          className={`w-full mt-2 ${getInputClasses()}`}
        />
      </div>
      <Button variant="primary">Submit</Button>
    </form>
  </CardContent>
</Card>
```

### Empty State

```tsx
<Card>
  <CardContent>
    <div className="text-center py-12">
      <div className="text-6xl mb-4 opacity-50">📦</div>
      <h3 className={designTokens.typography.cardTitle}>
        No Items Found
      </h3>
      <p className={`${designTokens.typography.body} mt-2`}>
        Get started by adding your first item
      </p>
      <Button variant="primary" className="mt-4">
        Add Item
      </Button>
    </div>
  </CardContent>
</Card>
```

### Loading State

```tsx
<div className="flex items-center justify-center py-12">
  <div className="text-center">
    <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    <p className={`${designTokens.typography.body} mt-4`}>
      Loading...
    </p>
  </div>
</div>
```

---

## 🔒 Enforcement

This design system is **MANDATORY**. Any PR that violates these rules will be rejected.

**Review checklist for PRs:**
1. ✅ Uses design system components
2. ✅ No hardcoded colors
3. ✅ Follows page structure
4. ✅ Consistent spacing
5. ✅ Blue-purple gradient only
6. ✅ No inline styles
7. ✅ Responsive design

---

## 📚 Additional Resources

- See `lib/design-system/PageTemplate.tsx` for a complete example
- See `lib/design-system/tokens.ts` for all design tokens
- See `lib/design-system/components/` for component implementations

---

**Last Updated:** Now
**Version:** 1.0
**Maintained by:** CentralHub Team
