# Gateway App Design Rules

Design system for the Simplaix Gateway Management Dashboard - a technical precision interface for network operations, API routing, and security management.

## Design Philosophy

**Domain**: Network operations, API routing, security management
**Feel**: Technical precision, secure, professional clarity
**Signature Elements**: Connection lines, flow indicators, status signals
**Primary Color**: Black (monochrome elegance)

## Color System

### Foundation

All colors use OKLCH format for perceptual uniformity and better dark mode transitions.

```css
/* Light Mode */
--surface-ground: oklch(0.985 0 0)    /* Page background */
--surface-raised: oklch(1 0 0)         /* Cards, elevated elements */
--surface-overlay: oklch(0.99 0 0)     /* Modals, popovers */
--surface-sunken: oklch(0.97 0 0)      /* Input fields, recessed areas */

--ink-primary: oklch(0.15 0 0)         /* Headings, primary text */
--ink-secondary: oklch(0.4 0 0)        /* Body text, labels */
--ink-tertiary: oklch(0.55 0 0)        /* Captions, help text */
--ink-muted: oklch(0.7 0 0)            /* Placeholders, disabled */

--border-subtle: oklch(0.92 0 0)       /* Dividers, card borders */
--border-default: oklch(0.88 0 0)      /* Input borders */
--border-strong: oklch(0.82 0 0)       /* Hover states, emphasis */
```

### Brand Colors

```css
/* Black primary - technical elegance */
--accent-primary: oklch(0.15 0 0)           /* Black */
--accent-primary-hover: oklch(0.25 0 0)     /* Dark gray hover */
--accent-primary-muted: oklch(0.95 0 0)     /* Light gray background */

/* Dark Mode - inverted for contrast */
--accent-primary: oklch(0.95 0 0)           /* White */
--accent-primary-hover: oklch(0.85 0 0)     /* Light gray */
--accent-primary-muted: oklch(0.25 0 0)     /* Dark gray */
```

### Semantic Colors

Status signals for operational states:

```css
/* Success - active states, confirmations */
--signal-success: oklch(0.65 0.18 145)
--signal-success-muted: oklch(0.95 0.04 145)

/* Warning - pending, caution */
--signal-warning: oklch(0.75 0.15 75)
--signal-warning-muted: oklch(0.96 0.04 75)

/* Danger - errors, destructive actions */
--signal-danger: oklch(0.6 0.2 25)
--signal-danger-muted: oklch(0.95 0.04 25)

/* Info - informational, neutral status */
--signal-info: oklch(0.6 0.15 250)
--signal-info-muted: oklch(0.95 0.03 250)
```

### Usage Rules

1. **Never hardcode colors** - Always use CSS variables
2. **Background hierarchy**: ground → raised → overlay (z-index order)
3. **Text hierarchy**: primary (headings) → secondary (body) → tertiary (captions)
4. **Semantic consistency**: Always use semantic variables for status
5. **Dark mode**: All color variables automatically adapt via `@media (prefers-color-scheme: dark)`

## Typography

### Font Stack

```css
--font-sans: "Inter", ui-sans-serif, system-ui, sans-serif
--font-mono: "JetBrains Mono", ui-monospace, monospace
```

### Hierarchy

```tsx
// Headings
<h1 className="text-xl font-semibold text-[var(--ink-primary)]">
  Page Title
</h1>

// Body
<p className="text-sm text-[var(--ink-secondary)]">
  Regular text
</p>

// Captions
<span className="text-xs text-[var(--ink-tertiary)]">
  Supporting text
</span>

// Technical IDs, tokens, codes
<code className="font-mono text-xs text-[var(--ink-secondary)]">
  sk_abc123xyz
</code>
```

### Rules

1. **Use monospace** for IDs, tokens, URLs, code snippets
2. **Font sizes**: xs (0.75rem), sm (0.875rem), base (1rem), lg (1.125rem), xl (1.25rem)
3. **Never use emoji** unless explicitly required by design
4. **Truncate long text** with `truncate` class for technical strings
5. **Line height**: 1.5 for body text (set globally)

## Spacing System

4px base unit for consistent rhythm:

```css
--space-1: 0.25rem   /* 4px */
--space-2: 0.5rem    /* 8px */
--space-3: 0.75rem   /* 12px */
--space-4: 1rem      /* 16px */
--space-5: 1.25rem   /* 20px */
--space-6: 1.5rem    /* 24px */
--space-8: 2rem      /* 32px */
--space-10: 2.5rem   /* 40px */
--space-12: 3rem     /* 48px */
```

Use Tailwind spacing classes aligned to this system: `p-2`, `px-4`, `gap-3`, `space-y-4`

## Components

### Button

**Variants**: `primary`, `secondary`, `ghost`, `danger`
**Sizes**: `sm`, `md`, `lg`

```tsx
import { Button } from "@/components/ui/button";

// Primary action
<Button variant="primary" size="md">
  Create Agent
</Button>

// Secondary action
<Button variant="secondary" size="sm">
  Cancel
</Button>

// Inline action
<Button variant="ghost" size="sm">
  <EditIcon size={14} />
  Edit
</Button>

// Destructive action
<Button variant="danger" size="md">
  Delete
</Button>
```

**Rules**:
- Primary buttons = main action (create, save, submit)
- Secondary buttons = alternative action (cancel, back)
- Ghost buttons = tertiary actions (edit, view details, inline actions)
- Danger buttons = destructive actions (delete, revoke)
- Always pair icon with text for clarity
- Use `disabled` prop for loading/processing states

### Card

**Variants**: `default`, `interactive`, `highlight`
**Subcomponents**: `CardHeader`, `CardContent`, `CardFooter`

```tsx
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";

// Static card
<Card>
  <CardHeader>
    <h3>Agent Name</h3>
  </CardHeader>
  <CardContent>
    Details here
  </CardContent>
  <CardFooter>
    Actions here
  </CardFooter>
</Card>

// Clickable card
<Card variant="interactive" onClick={handleClick}>
  <CardContent className="p-3">
    Compact clickable item
  </CardContent>
</Card>

// Highlighted card (selected, active)
<Card variant="highlight">
  <CardContent>Important item</CardContent>
</Card>
```

**Rules**:
- Use `CardFooter` for actions on entity cards
- Use `interactive` variant for selectable/clickable cards
- Use `highlight` variant sparingly for active/selected states
- Always include proper padding hierarchy (header: p-4, content: p-4, footer: px-4 py-3)

### Badge

**Variants**: `default`, `success`, `warning`, `danger`, `info`, `outline`
**Special**: `StatusBadge` for standardized status display

```tsx
import { Badge, StatusBadge } from "@/components/ui/badge";

// Status indicators
<StatusBadge status="active" />
<StatusBadge status="pending" />
<StatusBadge status="failed" />

// Custom badges
<Badge variant="warning">
  <ShieldIcon size={12} />
  Confirmation Required
</Badge>

<Badge variant="outline">
  Tenant: acme-corp
</Badge>
```

**Rules**:
- Use `StatusBadge` for standard statuses (active, inactive, pending, etc.)
- Include status dots for live/real-time states
- Keep badge text concise (1-3 words)
- Pair icon with text when adding semantic meaning

### Input & Form Fields

**Components**: `Input`, `Textarea`, `Label`, `Select`

```tsx
import { Input, Textarea, Label, Select } from "@/components/ui/input";

<div>
  <Label htmlFor="name" required>
    Agent Name
  </Label>
  <Input
    id="name"
    value={value}
    onChange={onChange}
    placeholder="e.g., Slack Bot"
    error={!!errors.name}
  />
  {errors.name && (
    <p className="text-xs text-[var(--signal-danger)] mt-1">
      {errors.name}
    </p>
  )}
  <p className="text-xs text-[var(--ink-muted)] mt-1">
    Helper text goes here
  </p>
</div>
```

**Rules**:
- Always pair `Label` with form fields using `htmlFor`
- Use `required` prop on `Label` for required fields
- Show error state with `error` prop + error message below
- Include helper text below for complex fields
- Use `disabled` prop during form submission
- Validate on submit, not on blur (better UX)

### Dialog

```tsx
import { Dialog, DialogFooter } from "@/components/ui/dialog";

<Dialog
  open={open}
  onClose={onClose}
  title="Create Agent"
  description="Create a new agent to route requests"
>
  <form onSubmit={handleSubmit}>
    <div className="space-y-4">
      {/* Form fields */}
    </div>

    <DialogFooter>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" type="submit">
        Create
      </Button>
    </DialogFooter>
  </form>
</Dialog>
```

**Rules**:
- Always include `title` and `description`
- Use `DialogFooter` for action buttons
- Primary action on the right, cancel on the left
- Forms should be wrapped in `<form>` with proper `onSubmit`

### Table

```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map(item => (
      <TableRow key={item.id}>
        <TableCell className="font-medium">{item.name}</TableCell>
        <TableCell><StatusBadge status={item.status} /></TableCell>
        <TableCell className="text-right">
          <Button variant="ghost" size="sm">Edit</Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Rules**:
- Align actions to the right
- Use `font-medium` for primary column
- Use monospace for IDs, tokens, timestamps
- Keep tables responsive with horizontal scroll if needed

### Tabs

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

<Tabs defaultValue="agents" value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="agents" icon={<AgentIcon size={16} />}>
      Agents
    </TabsTrigger>
    <TabsTrigger value="tokens" icon={<TokenIcon size={16} />}>
      Tokens
      <Badge variant="warning" className="ml-1">3</Badge>
    </TabsTrigger>
  </TabsList>

  <TabsContent value="agents">
    <AgentsTab />
  </TabsContent>

  <TabsContent value="tokens">
    <TokensTab />
  </TabsContent>
</Tabs>
```

**Rules**:
- Always include icons on tab triggers for visual hierarchy
- Use badges for notification counts
- Keep tab labels concise (single word preferred)
- Use controlled tabs (`value` + `onValueChange`) for state management

## Status Indicators

### Status Dots

```tsx
// Global CSS classes
.status-dot              // Base dot
.status-dot-active       // Green with pulse
.status-dot-inactive     // Gray
.status-dot-pending      // Yellow with pulse animation
.status-dot-error        // Red
```

**Rules**:
- Use for real-time status (agent health, confirmation state)
- Always pair with text label
- Animate pending/loading states with pulse

### Status Badge Mapping

```tsx
const statusMap = {
  active: "success",      // Green - operational
  inactive: "default",    // Gray - disabled
  pending: "warning",     // Yellow - awaiting action
  success: "success",     // Green - completed successfully
  failed: "danger",       // Red - error state
  approved: "success",    // Green - approved
  rejected: "danger",     // Red - rejected
  completed: "success",   // Green - finished
}
```

## Layout Patterns

### Dashboard Layout

```tsx
<div className="flex h-screen w-screen">
  <main className="flex-1 flex flex-col min-w-0 bg-[var(--surface-ground)]">
    {/* Header */}
    <header className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <h1 className="text-xl font-semibold">Page Title</h1>
      <p className="text-sm text-[var(--ink-tertiary)]">Description</p>
    </header>

    {/* Content */}
    <div className="flex-1 overflow-auto p-6">
      {/* Content here */}
    </div>
  </main>

  {/* Optional Sidebar */}
  <aside className="w-96 border-l border-[var(--border-subtle)]">
    {/* Sidebar content */}
  </aside>
</div>
```

### List Layout

```tsx
// Grid for cards
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
  {items.map(item => <ItemCard key={item.id} item={item} />)}
</div>

// Stack for compact items
<div className="space-y-2">
  {items.map(item => <CompactCard key={item.id} item={item} />)}
</div>
```

### Empty States

```tsx
<div className="text-center py-12">
  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center">
    <Icon size={24} className="text-[var(--ink-muted)]" />
  </div>
  <h3 className="font-medium text-[var(--ink-primary)] mb-1">
    No agents yet
  </h3>
  <p className="text-sm text-[var(--ink-tertiary)] mb-4">
    Create your first agent to get started
  </p>
  <Button variant="primary">
    <PlusIcon size={16} />
    Create Agent
  </Button>
</div>
```

## Animations

### Utilities

```css
.animate-fade-in        /* Fade in 150ms */
.animate-slide-up       /* Slide up with fade 200ms */
.animate-pulse-subtle   /* Subtle pulse for pending states */
```

### Rules

- Keep animations fast (150-200ms)
- Use `ease-out` for entrances
- Use `ease-in` for exits
- Pulse animations for pending/loading states only
- Avoid animation on layout shifts

## Icons

### Sizing

```tsx
<Icon size={12} />  // Badges, inline indicators
<Icon size={14} />  // Buttons, small UI elements
<Icon size={16} />  // Tab triggers, standard UI
<Icon size={20} />  // Headers, prominent actions
<Icon size={24} />  // Empty states, hero sections
```

### Usage

```tsx
import {
  AgentIcon,
  TokenIcon,
  CheckIcon,
  AlertIcon
} from "@/components/ui/icons";

// Always pair with text (except ghost buttons)
<Button variant="primary">
  <PlusIcon size={14} />
  Create
</Button>

// Icon-only for compact actions
<Button variant="ghost" size="sm" title="Edit">
  <EditIcon size={14} />
</Button>
```

## Responsive Design

### Breakpoints

```css
sm: 640px   /* Mobile landscape, small tablets */
md: 768px   /* Tablets */
lg: 1024px  /* Laptops */
xl: 1280px  /* Desktops */
2xl: 1536px /* Large desktops */
```

### Patterns

```tsx
// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

// Responsive spacing
<div className="p-4 md:p-6 lg:p-8">

// Responsive text
<h1 className="text-lg md:text-xl lg:text-2xl">

// Hide on mobile
<div className="hidden md:block">
```

## Accessibility

### Focus States

All interactive elements have visible focus rings:

```css
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-[var(--focus-ring)]
```

### Keyboard Navigation

- All dialogs trap focus
- Tab order follows visual hierarchy
- Escape closes modals
- Enter submits forms

### ARIA Labels

```tsx
// Icon-only buttons
<Button variant="ghost" title="Delete agent" aria-label="Delete agent">
  <TrashIcon size={14} />
</Button>

// Status indicators
<StatusBadge status="active" aria-label="Agent is active" />

// Loading states
<Button disabled aria-busy="true">
  Saving...
</Button>
```

## Code Style

### Component Structure

```tsx
"use client";

import { forwardRef } from "react";
import { ComponentProps } from "./types";

export const Component = forwardRef<HTMLElement, ComponentProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    const baseStyles = `
      // Base styles here
    `;

    const variants = {
      default: "...",
      // Variant styles
    };

    return (
      <element
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Component.displayName = "Component";
```

### Naming Conventions

- **Components**: PascalCase (`AgentCard`, `StatusBadge`)
- **Files**: kebab-case (`agent-card.tsx`, `status-badge.tsx`)
- **Props**: camelCase (`onSelect`, `isActive`)
- **CSS variables**: kebab-case (`--accent-primary`)
- **Tailwind classes**: kebab-case (`bg-[var(--surface-raised)]`)

### File Organization

```
src/
├── components/
│   ├── ui/              # Base components (Button, Card, etc.)
│   ├── agents/          # Domain components (AgentCard, AgentList)
│   ├── confirmations/   # Domain components
│   ├── forms/           # Form dialogs
│   ├── shared/          # Shared utilities
│   └── tabs/            # Tab content components
├── hooks/               # Custom hooks
├── lib/                 # Utilities, API clients
├── types/               # TypeScript types
└── app/                 # Next.js pages
```

## Best Practices

### DO ✓

- Use CSS variables for all colors
- Use semantic color names (signal-success, not green)
- Include loading states on async actions
- Show validation errors clearly
- Use monospace font for technical data
- Provide empty states with CTAs
- Use forwardRef for all components
- Export skeleton components for loading states
- Include proper TypeScript types
- Use proper ARIA labels

### DON'T ✗

- Hardcode colors or spacing values
- Use inline styles
- Create one-off components (use existing UI components)
- Nest forms inside forms
- Use `any` type in TypeScript
- Skip error handling
- Forget disabled states during loading
- Use emoji without explicit design requirement
- Create new color variables (use existing semantic colors)
- Animate every interaction (keep it subtle)

## Shadcn Integration

This design system is **inspired by shadcn/ui** but custom-built for the gateway domain. When adding new components:

1. **Reference shadcn/ui** for component API design
2. **Customize styling** to match our CSS variable system
3. **Maintain consistency** with existing components
4. **Use forwardRef** pattern for all components
5. **Support variants** through props, not class names
6. **Export TypeScript types** for all component props

### Example: Adding a New Component

```tsx
// 1. Check shadcn/ui for API inspiration
// 2. Build custom component with our system

"use client";

import { forwardRef, HTMLAttributes } from "react";

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "info" | "success" | "warning" | "danger";
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className = "", variant = "info", children, ...props }, ref) => {
    const variants = {
      info: "bg-[var(--signal-info-muted)] border-[var(--signal-info)] text-[var(--signal-info)]",
      success: "bg-[var(--signal-success-muted)] border-[var(--signal-success)] text-[var(--signal-success)]",
      warning: "bg-[var(--signal-warning-muted)] border-[var(--signal-warning)] text-[var(--signal-warning)]",
      danger: "bg-[var(--signal-danger-muted)] border-[var(--signal-danger)] text-[var(--signal-danger)]",
    };

    return (
      <div
        ref={ref}
        className={`
          p-4 rounded-[var(--radius-md)] border
          ${variants[variant]}
          ${className}
        `}
        role="alert"
        {...props}
      >
        {children}
      </div>
    );
  }
);

Alert.displayName = "Alert";
```

## Quick Reference

### Common Patterns

```tsx
// Entity card with actions
<Card>
  <CardHeader>Title + Badge</CardHeader>
  <CardContent>Details</CardContent>
  <CardFooter>Action Buttons</CardFooter>
</Card>

// Form field with validation
<div>
  <Label htmlFor="field" required>Label</Label>
  <Input id="field" error={!!error} />
  {error && <p className="text-xs text-[var(--signal-danger)] mt-1">{error}</p>}
</div>

// Status indicator
<div className="flex items-center gap-2">
  <span className="status-dot status-dot-active" />
  <StatusBadge status="active" />
</div>

// Action group
<div className="flex items-center gap-2">
  <Button variant="primary">Primary</Button>
  <Button variant="secondary">Secondary</Button>
</div>

// Empty state
<div className="text-center py-12">
  <Icon />
  <h3>Title</h3>
  <p>Description</p>
  <Button>CTA</Button>
</div>
```

---

**Version**: 1.0
**Last Updated**: 2026-02-02
**Maintainer**: Simplaix Gateway Team
