# Design System Quick Start Guide

## 🚀 5-Minute Quickstart

### 1. Import Components

```tsx
import {
  PageHeader,
  SectionHeader,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  StatCard,
  StatGrid,
  designTokens,
  getInputClasses,
} from '@/lib/design-system';
```

### 2. Create a Page

```tsx
export default function MyPage() {
  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        <PageHeader
          icon="🎯"
          title="My Page Title"
          subtitle="Brief description"
          action={<Button variant="primary">Add New</Button>}
        />

        <div className={designTokens.spacing.section}>
          {/* Your content here */}
        </div>
      </div>
    </div>
  );
}
```

---

## 📦 Common Components

### Button

```tsx
<Button variant="primary">Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="danger">Delete</Button>
<Button variant="ghost">Link</Button>
```

### Card

```tsx
<Card>
  <CardContent>
    Your content
  </CardContent>
</Card>
```

### Badge

```tsx
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Error</Badge>
<Badge variant="info">Info</Badge>
```

### Stats

```tsx
<StatGrid columns={3}>
  <StatCard
    label="Total Orders"
    value="1,234"
    icon="📦"
    trend={{ value: 12.5, isPositive: true }}
  />
  <StatCard
    label="Revenue"
    value="£5,678"
    icon="💰"
  />
</StatGrid>
```

---

## 🎨 Using Design Tokens

### Colors

```tsx
// Text
<p className={designTokens.colors.text.primary}>Primary text</p>
<p className={designTokens.colors.text.secondary}>Secondary text</p>
<p className={designTokens.colors.text.muted}>Muted text</p>

// Backgrounds
<div className={designTokens.colors.background.main}>Main bg</div>
<div className={designTokens.colors.background.card}>Card bg</div>

// Gradient
<div className={designTokens.colors.gradient.primary}>Gradient</div>
<h1 className={designTokens.colors.gradient.text}>Gradient Text</h1>
```

### Typography

```tsx
<h1 className={designTokens.typography.pageTitle}>Page Title</h1>
<h2 className={designTokens.typography.sectionTitle}>Section Title</h2>
<h3 className={designTokens.typography.cardTitle}>Card Title</h3>
<p className={designTokens.typography.body}>Body text</p>
<span className={designTokens.typography.label}>Label</span>
<span className={designTokens.typography.metric}>1,234</span>
```

### Spacing

```tsx
// Page container
<div className={designTokens.spacing.page}>
  {/* px-6 py-4 */}
</div>

// Section spacing
<div className={designTokens.spacing.section}>
  {/* space-y-6 */}
</div>

// Card padding
<div className={designTokens.spacing.card}>
  {/* p-6 */}
</div>

// Grid
<div className={designTokens.spacing.grid}>
  {/* gap-6 */}
</div>
```

---

## 📝 Form Inputs

```tsx
<input
  type="text"
  placeholder="Enter text..."
  className={getInputClasses()}
/>

<select className={getInputClasses()}>
  <option>Option 1</option>
  <option>Option 2</option>
</select>

<textarea
  placeholder="Enter description..."
  className={getInputClasses()}
/>
```

---

## 📐 Complete Page Example

```tsx
import {
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  StatGrid,
  StatCard,
  SectionHeader,
  designTokens,
  getInputClasses,
} from '@/lib/design-system';

export default function ExamplePage() {
  return (
    <div className={designTokens.spacing.page}>
      <div className={designTokens.layout.containerMax}>
        {/* Page Header */}
        <PageHeader
          icon="🏪"
          title="Store Management"
          subtitle="Manage all your store locations"
          action={
            <Button variant="primary">
              Add Store
            </Button>
          }
        />

        {/* Content */}
        <div className={designTokens.spacing.section}>
          {/* Stats */}
          <StatGrid columns={3}>
            <StatCard
              label="Total Stores"
              value="12"
              icon="🏪"
              trend={{ value: 2, isPositive: true }}
              description="2 new this month"
            />
            <StatCard
              label="Total Revenue"
              value="£45,678"
              icon="💰"
              trend={{ value: 15.3, isPositive: true }}
            />
            <StatCard
              label="Active Orders"
              value="234"
              icon="📦"
            />
          </StatGrid>

          {/* Stores List */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <SectionHeader
                  title="All Stores"
                  subtitle="View and manage stores"
                />
                <input
                  type="text"
                  placeholder="Search stores..."
                  className={`w-64 ${getInputClasses()}`}
                />
              </div>

              {/* Store list here */}
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 rounded-xl bg-slate-800/30"
                  >
                    <div>
                      <h4 className={designTokens.typography.cardTitle}>
                        Store {i}
                      </h4>
                      <p className={designTokens.typography.body}>
                        Location details
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="success">Active</Badge>
                      <Button variant="secondary">Edit</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Additional Section */}
          <Card>
            <CardContent>
              <SectionHeader title="Recent Activity" />
              <p className={designTokens.typography.body}>
                Activity log here...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

---

## ✅ Checklist Before Submit

Before pushing your code:

- [ ] Imported from `@/lib/design-system`
- [ ] Used design tokens for colors
- [ ] Used design tokens for spacing
- [ ] Used Button component (not custom buttons)
- [ ] Used Card component (not custom divs)
- [ ] Used Badge for status indicators
- [ ] Followed page structure template
- [ ] Added PageHeader with icon
- [ ] No hardcoded colors
- [ ] No inline styles
- [ ] Build passes: `npm run build`

---

## 🔗 More Information

- **Full Documentation:** See `DESIGN_SYSTEM.md`
- **Implementation Details:** See `DESIGN_SYSTEM_IMPLEMENTATION.md`
- **Template:** See `lib/design-system/PageTemplate.tsx`
- **Components:** See `lib/design-system/components/`

---

## 💡 Pro Tips

1. **Use StatGrid for metrics** - Automatically responsive
2. **PageHeader is required** - Every page should have one
3. **Card for all sections** - Don't use raw divs
4. **Badge for status** - Consistent status indicators
5. **Design tokens > hardcoded values** - Always use tokens

---

## 🚫 Common Mistakes to Avoid

❌ Don't hardcode colors:
```tsx
// BAD
<div className="bg-blue-500">

// GOOD
<div className={designTokens.colors.gradient.primary}>
```

❌ Don't use inline styles:
```tsx
// BAD
<div style={{ padding: '24px' }}>

// GOOD
<div className={designTokens.spacing.card}>
```

❌ Don't create custom buttons:
```tsx
// BAD
<button className="px-4 py-2 bg-blue-500 text-white rounded-lg">

// GOOD
<Button variant="primary">
```

❌ Don't skip PageHeader:
```tsx
// BAD
<div>
  <h1>My Page</h1>
  <p>Description</p>
</div>

// GOOD
<PageHeader
  title="My Page"
  subtitle="Description"
  icon="🎯"
/>
```

---

**Happy Coding! 🎨**

For questions or issues, refer to the full documentation in `DESIGN_SYSTEM.md`.
