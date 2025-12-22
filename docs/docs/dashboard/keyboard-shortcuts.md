---
sidebar_position: 4
---

# Keyboard Shortcuts

Master the NestLens dashboard with powerful keyboard shortcuts for efficient navigation and debugging.

## Global Shortcuts

Available from anywhere in the dashboard.

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` (or `Cmd+K` on Mac) | Focus search box |
| `Ctrl+D` (or `Cmd+D` on Mac) | Toggle dashboard sidebar |
| `Ctrl+Shift+C` | Clear all filters |
| `?` | Show keyboard shortcuts help modal |
| `Esc` | Close modal/dialog |

## Navigation Shortcuts

Move through the dashboard quickly.

| Shortcut | Action |
|----------|--------|
| `↑` Up Arrow | Select previous entry in list |
| `↓` Down Arrow | Select next entry in list |
| `Enter` | Open selected entry details |
| `Esc` | Close entry detail view |
| `Ctrl+←` (or `Cmd+←`) | Navigate to previous page |
| `Ctrl+→` (or `Cmd+→`) | Navigate to next page |

## Entry Type Shortcuts

Jump directly to entry types.

| Shortcut | Entry Type |
|----------|-----------|
| `G` then `R` | Go to Requests |
| `G` then `Q` | Go to Queries |
| `G` then `E` | Go to Exceptions |
| `G` then `L` | Go to Logs |
| `G` then `J` | Go to Jobs |
| `G` then `C` | Go to Cache |
| `G` then `H` | Go to HTTP Client |

**Usage**: Press `G` to enter "Go" mode, then press the second key.

## Filter Shortcuts

Quick filtering actions.

| Shortcut | Action |
|----------|--------|
| `/` | Focus filter dropdown |
| `F` | Toggle filters panel |
| `Ctrl+Shift+F` | Open advanced filters |
| `Ctrl+Shift+C` | Clear all active filters |

## List View Shortcuts

When viewing entry lists.

| Shortcut | Action |
|----------|--------|
| `J` | Next entry (same as Down Arrow) |
| `K` | Previous entry (same as Up Arrow) |
| `Space` | Page down |
| `Shift+Space` | Page up |
| `Home` | Go to first entry |
| `End` | Go to last entry |

## Detail View Shortcuts

When viewing entry details.

| Shortcut | Action |
|----------|--------|
| `Esc` | Close detail view |
| `N` | Next entry (open next in sequence) |
| `P` | Previous entry (open previous in sequence) |
| `T` | Toggle tags panel |
| `R` | Toggle resolved status (exceptions only) |
| `Ctrl+C` (or `Cmd+C`) | Copy entry JSON to clipboard |
| `Ctrl+K` | Copy entry ID to clipboard |

## Selection Shortcuts

Multi-select operations (when supported).

| Shortcut | Action |
|----------|--------|
| `Ctrl+Click` (or `Cmd+Click`) | Toggle entry selection |
| `Shift+Click` | Select range |
| `Ctrl+A` (or `Cmd+A`) | Select all visible entries |
| `Ctrl+D` (or `Cmd+D`) | Deselect all |
| `Delete` | Delete selected entries (if permitted) |

## Search Shortcuts

Enhanced search functionality.

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` (or `Cmd+K`) | Focus search box |
| `Enter` | Execute search |
| `Esc` | Clear search and close |
| `↑`/`↓` | Navigate search suggestions |

## Refresh Shortcuts

Control data refreshing.

| Shortcut | Action |
|----------|--------|
| `R` | Refresh current view |
| `Ctrl+R` (or `Cmd+R`) | Force hard refresh |
| `Ctrl+Shift+R` | Toggle auto-refresh |

## Debugging Shortcuts

Developer and debugging aids.

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+D` | Toggle debug mode |
| `Ctrl+Shift+I` | Inspect entry (developer tools) |
| `Ctrl+E` | Export current view as JSON |
| `Ctrl+L` | Show network logs |

## Customization

### Viewing All Shortcuts

Press `?` anywhere in the dashboard to view the keyboard shortcuts help modal with all available shortcuts for the current context.

### Platform Differences

- **Windows/Linux**: Use `Ctrl` key
- **macOS**: Use `Cmd` key instead of `Ctrl`

Most shortcuts automatically adapt to your platform.

### Browser Conflicts

Some shortcuts may conflict with browser shortcuts. In such cases:

1. The browser shortcut takes precedence
2. Use alternative shortcuts provided
3. Use mouse/click actions as fallback

### Disabling Shortcuts

To temporarily disable shortcuts (e.g., when typing in a form):

- Shortcuts are automatically disabled in text inputs
- Focus any input field to bypass shortcuts
- Press `Esc` to exit input and re-enable shortcuts

## Tips for Efficiency

### Vim-Style Navigation

If you're familiar with Vim, use `J`/`K` for navigation:
- `J` - Move down (next entry)
- `K` - Move up (previous entry)
- `G` then `G` - Go to first entry
- `Shift+G` - Go to last entry

### Quick Entry Access

Workflow for fast debugging:

1. `Ctrl+K` - Open search
2. Type error or keyword
3. `↓` - Select result
4. `Enter` - Open details
5. `Esc` - Close
6. Repeat

### Filter Workflow

Efficient filtering:

1. `/` - Open filter dropdown
2. Type filter name
3. `Tab` - Move to value input
4. Enter value
5. `Enter` - Apply filter
6. `Ctrl+Shift+C` - Clear when done

### Cross-Entry Navigation

View related entries:

1. Open request details
2. Click "Related Entries" link
3. Use `↑`/`↓` to browse queries, logs, exceptions from same request
4. `Enter` to open
5. `Esc` to return

## Accessibility

All shortcuts have mouse equivalents for accessibility:
- Screen reader compatible
- Keyboard-only navigation fully supported
- ARIA labels on all interactive elements
- Focus indicators visible

## Next Steps

- Practice with the [Dashboard Overview](./overview.md)
- Explore [Filtering Options](./filtering.md)
- Learn about [Navigation Groups](./navigation.md)
