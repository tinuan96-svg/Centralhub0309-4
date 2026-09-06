# CentralHub Visual Style Guide

## Quick Reference for Developers

---

## 🎨 Color System

### Primary Colors

```css
/* Background Gradients */
bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950  /* Main background */
bg-slate-950                                                    /* Sidebar background */
bg-slate-950/95                                                 /* Topbar background (with opacity) */

/* Card Backgrounds */
bg-slate-900/50                                                 /* Standard card */
bg-slate-800/50                                                 /* Card hover state */
bg-gradient-to-br from-cyan-900/30 to-slate-900/50             /* Metric card (cyan) */
bg-gradient-to-br from-emerald-900/30 to-slate-900/50          /* Metric card (emerald) */
bg-gradient-to-br from-rose-900/30 to-slate-900/50             /* Metric card (rose) */
bg-gradient-to-br from-orange-900/30 to-slate-900/50           /* Metric card (orange) */
```

### Accent Colors

```css
/* Primary Accent (Cyan/Blue) */
text-cyan-400                      /* Accent text */
border-cyan-500/30                 /* Default accent border */
border-cyan-500/50                 /* Hover accent border */
bg-cyan-600/20                     /* Accent background */
shadow-cyan-500/10                 /* Subtle glow */
shadow-cyan-500/30                 /* Medium glow */

/* Gradients */
bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600     /* Logo gradient */
bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400     /* Text gradient */
bg-gradient-to-r from-cyan-600 to-blue-600                     /* Button gradient */
```

### Text Colors

```css
text-slate-100     /* Primary text (headings, important) */
text-slate-200     /* Secondary text */
text-slate-400     /* Tertiary text (labels) */
text-slate-500     /* Muted text (descriptions) */
```

### Border Colors

```css
border-slate-800/50     /* Default border */
border-slate-700/50     /* Input/button border */
border-cyan-500/30      /* Active/hover border */
```

---

## 📏 Spacing Scale

```css
/* Page Level */
p-8           /* Page padding */

/* Section Level */
space-y-8     /* Between major sections */
space-y-6     /* Between subsections */
space-y-4     /* Between related items */

/* Component Level */
p-6           /* Card padding */
p-4           /* Sidebar navigation padding */
px-6 py-4     /* Header/footer padding */

/* Item Level */
gap-4         /* Between grid items */
gap-3         /* Between flex items */
gap-2         /* Between inline items */
mb-8          /* Section bottom margin */
mb-6          /* Subsection bottom margin */
mb-4          /* Item bottom margin */
```

---

## 🔤 Typography Scale

### Headings

```css
/* Page Title (H1) */
text-3xl font-bold text-slate-100

/* Section Title (H2) */
text-2xl font-bold text-slate-200

/* Subsection Title (H3) */
text-lg font-semibold text-slate-200

/* Card Title */
text-lg font-semibold text-slate-200
```

### Body Text

```css
/* Primary Body */
text-sm text-slate-200

/* Secondary Body */
text-sm text-slate-400

/* Description/Caption */
text-xs text-slate-500

/* Label (Uppercase) */
text-xs font-medium text-slate-400 uppercase tracking-wider
```

### Metric Text

```css
/* Large Metric */
text-4xl font-bold text-slate-100

/* Medium Metric */
text-2xl font-bold text-cyan-400

/* Small Metric */
text-lg font-bold text-emerald-400
```

---

## 🎯 Border Radius

```css
rounded-2xl     /* Cards, modals, panels */
rounded-xl      /* Buttons (large), badges */
rounded-lg      /* Inputs, selects, buttons (standard) */
rounded-full    /* Avatar, status dots, pill badges */
```

---

## ✨ Effects & Transitions

### Shadows

```css
/* Card Shadows */
shadow-2xl shadow-cyan-500/5       /* Card default */
shadow-2xl shadow-cyan-500/10      /* Card hover */

/* Button Shadows */
shadow-lg shadow-cyan-500/30       /* Primary button */
shadow-lg shadow-purple-500/30     /* Avatar */

/* Glow Effects (behind cards) */
<div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all"></div>
```

### Backdrop Effects

```css
backdrop-blur-xl      /* Glass effect on overlays, topbar */
```

### Transitions

```css
transition-all                              /* Standard transition */
transition-all duration-300                 /* Card hover */
transition-transform                        /* Scale/rotate only */
transition-colors                           /* Color change only */

/* Hover Scales */
hover:scale-[1.02]                         /* Card hover */
hover:scale-110                            /* Icon hover */
hover:scale-105                            /* Button hover */
```

---

## 🔘 Component Patterns

### Standard Card

```tsx
<div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6">
  {/* content */}
</div>
```

### Hoverable Card

```tsx
<div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6 hover:border-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-500/10 transition-all duration-300">
  {/* content */}
</div>
```

### Metric Card (with glow)

```tsx
<div className="group relative rounded-2xl bg-gradient-to-br from-cyan-900/30 to-slate-900/50 backdrop-blur-xl border border-cyan-500/30 p-6 hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-500/20 transition-all duration-300 hover:scale-[1.02]">
  {/* Glow effect */}
  <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all"></div>

  {/* Content */}
  <div className="relative">
    {/* content here */}
  </div>
</div>
```

### Primary Button

```tsx
<button className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/30 font-medium">
  Primary Action
</button>
```

### Secondary Button

```tsx
<button className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-200 rounded-lg border border-slate-700/50 hover:border-slate-600/50 transition-all font-medium">
  Secondary Action
</button>
```

### Text Input

```tsx
<input
  type="text"
  placeholder="Search..."
  className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
/>
```

### Status Badge (Success)

```tsx
<span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
  Active
</span>
```

### Status Badge (Warning)

```tsx
<span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
  Pending
</span>
```

### Status Badge (Error)

```tsx
<span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
  Error
</span>
```

---

## 📱 Responsive Breakpoints

```css
/* Mobile First Approach */
/* Base: Mobile (< 768px) */
/* md: >= 768px (Tablet) */
/* lg: >= 1024px (Desktop) */

/* Example */
grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
```

---

## 🎭 State Patterns

### Loading State

```tsx
<div className="flex items-center justify-center h-full">
  <div className="text-center">
    <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
    <p className="text-slate-400 mt-4">Loading...</p>
  </div>
</div>
```

### Empty State

```tsx
<div className="text-center py-12 bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50">
  <div className="text-6xl mb-4 opacity-50">📦</div>
  <p className="text-slate-400">No items found</p>
</div>
```

### Active/Selected State

```tsx
{/* Navigation item active */}
<Link className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
  Active Item
</Link>

{/* Regular navigation item */}
<Link className="text-slate-400 hover:text-slate-200 hover:bg-slate-800/50">
  Regular Item
</Link>
```

---

## 🖼️ Layout Patterns

### Page Container

```tsx
<div className="p-8">
  <div className="max-w-7xl mx-auto">
    {/* page content */}
  </div>
</div>
```

### Page Header

```tsx
<div className="mb-8">
  <h1 className="text-3xl font-bold text-slate-100 mb-2 flex items-center gap-3">
    <span className="text-4xl">🎯</span>
    Page Title
  </h1>
  <p className="text-slate-400">Page description</p>
</div>
```

### Grid Layout (Metrics)

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* metric cards */}
</div>
```

### Two-Column Layout

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
  <div className="lg:col-span-2">
    {/* main content */}
  </div>
  <div className="lg:col-span-1">
    {/* sidebar */}
  </div>
</div>
```

---

## 📊 Data Display Patterns

### Table

```tsx
<div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 overflow-hidden">
  <table className="w-full">
    <thead>
      <tr className="border-b border-slate-800/50">
        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
          Header
        </th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors">
        <td className="px-6 py-4">
          <p className="text-sm text-slate-200">Data</p>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 🎨 Icon Usage

Use emojis consistently for visual hierarchy:

```tsx
🤖 Dashboard / AI
🏪 Stores
📊 Inventory / Analytics
🛒 Orders
💰 Pricing / Revenue
🏭 Suppliers
📦 Packing / Products
🚚 Shipping
💳 Payments
📋 VAT / Reports
💎 Profit
📡 Communication
🎯 Targets / Goals
⚡ Performance / Speed
✅ Success / Completed
⚠️ Warning / Low Stock
🚨 Error / Out of Stock
```

---

## 🔧 Utility Combinations

### Common Patterns

```css
/* Interactive Card */
group relative rounded-2xl backdrop-blur-xl border transition-all duration-300 hover:scale-[1.02]

/* Glass Panel */
bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50

/* Metric Value */
text-4xl font-bold text-slate-100

/* Label */
text-xs font-medium text-slate-400 uppercase tracking-wider

/* Glow Dot (Status Indicator) */
w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50

/* Animated Pulse Dot */
<div className="relative">
  <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50"></div>
  <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping"></div>
</div>
```

---

## ✅ Do's and Don'ts

### ✅ DO

- Use dark theme backgrounds for all new components
- Use cyan/blue gradients for primary actions
- Add hover states to interactive elements
- Use backdrop-blur for overlays
- Maintain consistent spacing (8px increments)
- Use group hover for nested animations
- Add transition-all for smooth effects

### ❌ DON'T

- Don't use light backgrounds (white, gray-50)
- Don't use harsh borders (use opacity instead)
- Don't use purple/indigo unless specifically requested
- Don't mix color schemes within same feature
- Don't add custom backgrounds to pages (use layout)
- Don't forget hover states
- Don't use inline styles

---

## 🚀 Quick Start Template

```tsx
export default function NewPage() {
  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2 flex items-center gap-3">
            <span className="text-4xl">🎯</span>
            Page Title
          </h1>
          <p className="text-slate-400">Page description</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Metric Label
            </p>
            <p className="text-4xl font-bold text-slate-100">123</p>
          </div>
        </div>

        {/* Content Card */}
        <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">
            Section Title
          </h2>
          {/* Content */}
        </div>
      </div>
    </div>
  );
}
```

---

This guide ensures every new component, page, or feature maintains visual consistency with the CentralHub design system.
