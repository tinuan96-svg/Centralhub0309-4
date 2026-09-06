# Samsung Galaxy Z Fold Optimization Plan

Optimize CentralHub for the unique form factor of the Samsung Galaxy Z Fold, ensuring efficiency on the narrow cover screen and productivity on the wide inner screen.

## 1. Responsive Foundation

- [x] **Custom Breakpoints**: Added `fold-cover` (300px), `fold-inner` (700px), and `xs` (400px) to Tailwind.
- [x] **Safe Area Tokens**: Added safe-area padding and touch target tokens to design system.
- [ ] **Viewport Management**: Standardize `100dvh` usage to prevent keyboard overlap issues.

## 2. Navigation Overhaul

- **Folded / Narrow ( < 700px )**:
    - Sticky Top Header with Search and Profile.
    - Bottom Navigation for top 5 modules (Home, Orders, Products, Tasks, More).
    - "More" menu opens the full navigation as a full-screen overlay or drawer.
- **Unfolded / Desktop ( > 700px )**:
    - Sidebar navigation.
    - **Auto-collapse Sidebar**: If width is between 700px and 1100px, sidebar should default to collapsed (icons only) to maximize content space.
    - Full Topbar with global search.

## 3. Component Optimizations

### Tables -> Cards
- Convert large tables into **Responsive Data Lists** on narrow screens.
- Use `useMediaQuery` hook to switch presentation logic.
- Target modules: Orders, Inventory, Products, Shipments, Procurement.

### Forms
- Ensure all inputs have `optimalTarget` (48px height).
- Set appropriate `inputmode` and `type` for numeric, email, and phone fields.
- Full-width fields on narrow screens.

### Modals & Drawers
- Mobile: Use **Bottom Sheets** (for short forms/actions) or **Full Screen Modals** (for complex flows).
- Wide Screen: Keep centered modals.

## 4. Feature-Specific Enhancements

- **Dashboard**: 1-column grid on `fold-cover`, 2-column on `fold-inner`, multi-column on `lg`.
- **Procurement**: Priority columns on cover screen, full audit trail on inner screen.
- **Barcode Scanner**: Optimize camera viewport for one-handed operation on cover screen.

## 5. Verification Strategy

- [ ] Lint & Type Checks.
- [ ] Production Build.
- [ ] Read-only verification on real data (if applicable for UI states).
