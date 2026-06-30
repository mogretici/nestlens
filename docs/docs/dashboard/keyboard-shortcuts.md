---
sidebar_position: 4
---

# Keyboard Shortcuts

The NestLens dashboard ships with a small, focused set of keyboard shortcuts. This page lists exactly what the dashboard implements — nothing more.

## Global Shortcuts

Available from anywhere in the dashboard.

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` (or `Cmd+K` on Mac) | Clear all entries |
| `Ctrl+D` (or `Cmd+D` on Mac) | Toggle dark mode |
| `Esc` | Close the mobile sidebar (when open) |

Shortcuts are automatically ignored while you are typing in an input, textarea, or other editable field — except `Esc`, which always works.

## Entry List Navigation

When a row in an entry table is focused (click a row or `Tab` into the table):

| Shortcut | Action |
|----------|--------|
| `↓` Down Arrow | Move focus to the next row |
| `↑` Up Arrow | Move focus to the previous row |
| `Home` | Move focus to the first row |
| `End` | Move focus to the last row |
| `Enter` or `Space` | Open the focused entry's details |

## Tab Navigation

When a tab control is focused (e.g. inside a detail view):

| Shortcut | Action |
|----------|--------|
| `←` Left Arrow | Move to the previous tab |
| `→` Right Arrow | Move to the next tab |

## Dark Mode

Toggle dark mode with either:

- The sun/moon icon in the sidebar
- `Ctrl+D` / `Cmd+D`

Your preference (`system`, `light`, or `dark`) is persisted and re-applied on the next visit.

## Platform Differences

- **Windows/Linux**: use the `Ctrl` key
- **macOS**: `Cmd` is accepted in place of `Ctrl` for the global shortcuts

## Accessibility

Keyboard navigation is a first-class concern in the dashboard:

- Table rows are focusable (`tabindex`) and respond to arrow / `Home` / `End` / `Enter` keys
- Interactive badges and tag inputs are reachable and operable with `Enter` / `Space` / `Esc`
- Focus indicators are visible throughout

## Next Steps

- [Dashboard Overview](./overview.md)
- [Filtering Options](./filtering.md)
- [Navigation Groups](./navigation.md)
