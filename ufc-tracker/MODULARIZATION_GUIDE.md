# UFC App Modularization Guide

This document describes the modularized components and utilities created to reduce code duplication across the UFC App pages.

## 📁 Project Structure

```
ufc-tracker/src/
├── components/
│   ├── shared/           # Reusable shared components
│   │   ├── index.js
│   │   ├── FighterImage.js
│   │   ├── FighterInfo.js
│   │   ├── RankBadge.js
│   │   ├── FightHistory.js
│   │   ├── LoadingState.js
│   │   ├── ErrorState.js
│   │   ├── ThemeToggle.js
│   │   └── SearchBar.js
│   └── Events/
│       └── BettingCardModular.js  # Modularized BettingCard
├── hooks/
│   ├── useEventData.js   # Existing hook
│   └── useDarkMode.js    # New: Dark mode state management
└── utils/
    ├── eventHelpers.js   # Existing utilities
    ├── formatters.js     # New: Consolidated formatting functions
    └── countryCodes.js   # Existing country codes

```

## 🧩 Shared Components

### 1. FighterImage

Displays fighter images with fallback placeholder and optional P4P badge.

**Props:**
- `fighter` (object): Fighter object with image_url
- `size` (string): 'small', 'medium', or 'large' (default: 'medium')
- `className` (string): Additional CSS classes
- `showP4PBadge` (boolean): Show P4P medal if fighter is ranked

**Usage:**
```jsx
import { FighterImage } from '../components/shared';

<FighterImage
  fighter={fighter}
  size="large"
  showP4PBadge={true}
/>
```

### 2. FighterInfo

Displays fighter name, nickname, country, and record.

**Props:**
- `fighter` (object): Fighter object
- `showNickname` (boolean): Show nickname (default: true)
- `showCountry` (boolean): Show country (default: true)
- `showRecord` (boolean): Show win-loss record (default: true)
- `align` (string): 'left', 'center', or 'right' (default: 'center')
- `className` (string): Additional CSS classes

**Usage:**
```jsx
import { FighterInfo } from '../components/shared';

<FighterInfo
  fighter={fighter}
  align="left"
  showNickname={true}
/>
```

### 3. RankBadge

Displays fighter ranking badges (Divisional and P4P).

**Props:**
- `fighter` (object): Fighter object with rankings array
- `showDivisional` (boolean): Show divisional rank (default: true)
- `showP4P` (boolean): Show P4P rank (default: true)
- `className` (string): Additional CSS classes

**Usage:**
```jsx
import { RankBadge } from '../components/shared';

<RankBadge fighter={fighter} />
```

### 4. FightHistory

Displays a fighter's recent fight results.

**Props:**
- `fighter` (object): Fighter object with fight_history array
- `limit` (number): Number of fights to display (default: 5)
- `className` (string): Additional CSS classes

**Usage:**
```jsx
import { FightHistory } from '../components/shared';

<FightHistory fighter={fighter} limit={3} />
```

### 5. LoadingState

Loading spinner component.

**Props:**
- `message` (string): Loading message (default: 'Loading...')
- `darkMode` (boolean): Dark or light theme (default: true)

**Usage:**
```jsx
import { LoadingState } from '../components/shared';

{loading && <LoadingState message="Loading fighters..." />}
```

### 6. ErrorState

Error display component with retry button.

**Props:**
- `title` (string): Error title
- `message` (string): Error message
- `onRetry` (function): Retry callback
- `darkMode` (boolean): Dark or light theme

**Usage:**
```jsx
import { ErrorState } from '../components/shared';

{error && (
  <ErrorState
    title="Failed to Load"
    message={error}
    onRetry={refetch}
  />
)}
```

### 7. ThemeToggle

Dark/Light mode toggle button.

**Props:**
- `darkMode` (boolean): Current theme state
- `onToggle` (function): Toggle callback
- `className` (string): Additional CSS classes

**Usage:**
```jsx
import { ThemeToggle } from '../components/shared';

<ThemeToggle darkMode={darkMode} onToggle={() => setDarkMode(!darkMode)} />
```

### 8. SearchBar

Search input with clear button.

**Props:**
- `value` (string): Search value
- `onChange` (function): Change handler
- `onClear` (function): Clear handler
- `placeholder` (string): Placeholder text
- `darkMode` (boolean): Dark or light theme
- `className` (string): Additional CSS classes

**Usage:**
```jsx
import { SearchBar } from '../components/shared';

<SearchBar
  value={searchQuery}
  onChange={setSearchQuery}
  onClear={() => setSearchQuery('')}
  placeholder="Search fighters..."
/>
```

## 🔧 Utilities

### formatters.js

Consolidated formatting utilities for consistent data display across the app.

**Functions:**

#### `formatDate(dateString, options)`
Format date strings to readable format.

```jsx
import { formatDate } from '../utils/formatters';

const formatted = formatDate('2024-12-25');
// "Wednesday, December 25, 2024"
```

#### `formatTime(timeString)`
Convert 24-hour time to 12-hour format with AM/PM.

```jsx
import { formatTime } from '../utils/formatters';

const formatted = formatTime('18:00');
// "6:00 PM EST"
```

#### `formatRecord(fighter)`
Format fighter win-loss-draw record.

```jsx
import { formatRecord } from '../utils/formatters';

const record = formatRecord(fighter);
// "20-5-1" or "15-3"
```

#### `formatStat(value, decimals, suffix)`
Format numeric statistics with proper decimal places.

```jsx
import { formatStat } from '../utils/formatters';

const stat = formatStat(fighter.sig_strikes_landed_per_min, 2);
// "5.23"
```

#### `getDivisionFromWeight(weightClass, fighter1, fighter2)`
Get division name from weight class, handling men's/women's divisions.

```jsx
import { getDivisionFromWeight } from '../utils/formatters';

const division = getDivisionFromWeight('135', fighter1, fighter2);
// "Bantamweight" or "Women's Bantamweight"
```

#### `isPPV(eventName, eventType)`
Check if event is Pay-Per-View.

```jsx
import { isPPV } from '../utils/formatters';

if (isPPV(event.name, event.type)) {
  // Show PPV badge
}
```

#### `isChampionshipFight(fight)`
Check if fight is for a championship.

```jsx
import { isChampionshipFight } from '../utils/formatters';

if (isChampionshipFight(fight)) {
  // Show championship indicator
}
```

#### `getRecentFights(fighter, limit)`
Get fighter's most recent fights.

```jsx
import { getRecentFights } from '../utils/formatters';

const recent = getRecentFights(fighter, 5);
```

#### `getFinishRates(fighter)`
Calculate finish rates (KO, SUB, DEC percentages).

```jsx
import { getFinishRates } from '../utils/formatters';

const rates = getFinishRates(fighter);
// { ko: 40, sub: 20, dec: 40 }
```

## 🪝 Custom Hooks

### useDarkMode

Manages dark mode state with localStorage persistence.

**Usage:**
```jsx
import useDarkMode from '../hooks/useDarkMode';

const MyComponent = () => {
  const [darkMode, setDarkMode] = useDarkMode(true); // default: true

  return (
    <ThemeToggle darkMode={darkMode} onToggle={() => setDarkMode(!darkMode)} />
  );
};
```

## 🎯 Migration Examples

### Before (Inline Implementation):

```jsx
// Events.js - Before
const Events = () => {
  const [darkMode, setDarkMode] = useState(true);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div>
      <button onClick={() => setDarkMode(!darkMode)}>
        {darkMode ? <Sun /> : <Moon />}
      </button>
      <p>{formatDate(event.date)}</p>
    </div>
  );
};
```

### After (Using Modular Components):

```jsx
// Events.js - After
import { ThemeToggle } from '../components/shared';
import { formatDate } from '../utils/formatters';
import useDarkMode from '../hooks/useDarkMode';

const Events = () => {
  const [darkMode, setDarkMode] = useDarkMode();

  return (
    <div>
      <ThemeToggle darkMode={darkMode} onToggle={() => setDarkMode(!darkMode)} />
      <p>{formatDate(event.date)}</p>
    </div>
  );
};
```

## 📊 Benefits

1. **Code Reusability**: Components used across Events.js, Rankings.js, and UpcomingFights.js
2. **Consistency**: Standardized formatting and styling
3. **Maintainability**: Single source of truth for common functionality
4. **Reduced Bundle Size**: Shared components imported once
5. **Easier Testing**: Isolated components can be tested independently
6. **Better Developer Experience**: Clear component APIs with props

## 🔄 Next Steps

To fully modularize your pages:

1. **Update Events.js**:
   - Replace inline `BettingCard` with `BettingCardModular`
   - Use `ThemeToggle`, `SearchBar` components
   - Import formatters from `utils/formatters`

2. **Update Rankings.js**:
   - Use `FighterImage`, `FighterInfo`, `RankBadge`
   - Replace loading/error states with shared components

3. **Update UpcomingFights.js**:
   - Use shared components for fighter display
   - Import formatting utilities

## 📝 Notes

- All components use **styled-jsx** for scoped styling
- Components are designed to work in both dark and light modes
- Fallback values are provided for missing data (e.g., 'N/A', placeholders)
- Components follow React best practices (prop validation, memoization where needed)

## 🤝 Contributing

When creating new pages or components:

1. Check if a shared component exists before creating inline components
2. Extract common patterns into shared components
3. Add utility functions to `formatters.js` if they're used in multiple places
4. Update this guide when adding new shared components
