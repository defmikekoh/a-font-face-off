# Promise-based Flow Refactoring Plan

## Overview
Convert the current race condition-prone, setTimeout-heavy architecture to a clean Promise-based flow. This will eliminate timing issues, make dependencies explicit, and create predictable execution order.

## Current Problems

### Race Conditions
- `updateBodyButtons()` called before `applyFontConfig()` completes
- Control group state read before DOM updates finish
- Multiple async operations running without coordination

### setTimeout Hacks
- `setTimeout(() => applyFontConfig(...), 50)` throughout codebase
- `setTimeout(() => updateButtons(), 0)` to "wait" for DOM
- No guarantee operations complete in correct order

### Scattered State Management
- DOM state, storage state, and in-memory state not synchronized
- Functions modify global state as side effects
- No clear ownership of state updates

## Target Architecture

### Core Principles
1. **Explicit Dependencies**: Every async operation returns a Promise
2. **Sequential Flow**: Related operations await their dependencies
3. **Single Responsibility**: Functions do one thing and return their result
4. **Predictable State**: State changes happen in known, awaitable steps

### Flow Example
```javascript
// Current (race conditions)
applyFontConfig(position, config);
updateButtons(); // Might read stale DOM state

// Target (sequential)
await applyFontConfig(position, config);
await updateButtons(); // Guaranteed fresh DOM state
```

## Refactoring Phases

### Phase 1: Core Font Operations
Convert the fundamental font loading and application operations.

#### Files to Change
- `popup.js` (main functions around line 1890-2030)

#### Functions to Refactor
1. **`applyFontConfig(position, config)`**
   - Already returns Promise, but internal setTimeout needs cleanup
   - Make DOM updates synchronous where possible
   - Return only when control groups are actually updated

2. **`loadFont(position, fontName)`**
   - Convert to async/await pattern
   - Ensure font loading completes before resolving
   - Remove setTimeout dependencies

3. **`selectFont(position, fontName)`**
   - Make fully async
   - Await font loading before updating previews
   - Await preview updates before updating buttons

#### Expected Outcome
```javascript
// Before
selectFont('body', 'Arial');
updateBodyButtons(); // Race condition

// After
await selectFont('body', 'Arial');
await updateBodyButtons(); // Clean sequence
```

### Phase 2: Button State Management
Centralize and make button updates predictable.

#### Functions to Refactor
1. **`updateBodyButtons()`**
   - Convert to async function
   - Await any storage reads
   - Return only when buttons are visually updated

2. **`updateAllThirdManInButtons()`**
   - Make async
   - Coordinate with storage operations
   - Clear dependency chain

3. **`refreshApplyButtonsDirtyState()`**
   - Eliminate setTimeout usage
   - Make state comparison atomic
   - Await all config reads

#### Expected Outcome
- Button states always reflect actual current state
- No visual flicker from race conditions
- Predictable button behavior

### Phase 3: Favorites System
Fix the favorites loading flow that triggered this investigation.

#### Functions to Refactor
1. **Favorites Loading (around line 4001)**
   ```javascript
   // Current
   applyFontConfig(position, config).then(() => {...});
   hideFavoritesPopup();
   updateBodyButtons(); // Called immediately

   // Target
   await applyFontConfig(position, config);
   await updateButtons(position);
   hideFavoritesPopup();
   ```

2. **`showFavoritesPopup()`** and related
   - Make favorite application atomic
   - Ensure UI reflects favorite state before allowing interaction

#### Expected Outcome
- Reset button appears correctly for all favorite types
- No timing issues between different control types
- Consistent favorite loading behavior

### Phase 4: Mode Switching
Clean up the complex mode switching logic.

#### Functions to Refactor
1. **`switchMode(newMode)`**
   - Make fully async
   - Await UI state cleanup
   - Await new mode initialization
   - Return only when mode switch is complete

2. **`loadModeSettings()`**
   - Coordinate storage reads with UI updates
   - Ensure settings are applied before mode is "ready"

#### Expected Outcome
- Clean mode transitions without visual artifacts
- Settings properly restored before user interaction
- No race conditions between different modes

### Phase 5: Storage Operations
Make storage operations first-class promises.

#### Functions to Refactor
1. **All storage operations**
   - Ensure browser.storage calls are properly awaited
   - Remove storage-related setTimeout hacks
   - Make storage consistency guarantees

2. **Domain storage synchronization**
   - Coordinate storage writes with UI updates
   - Ensure storage is written before UI reflects "saved" state

### Phase 6: Page Application
Fix the complex page CSS application logic.

#### Functions to Refactor
1. **`applyFontToPage()` and related**
   - Make CSS injection atomic
   - Await browser API calls
   - Coordinate multiple font applications

2. **`generateBodyCSS()` flow**
   - Ensure CSS generation completes before injection
   - Make font loading and CSS application sequential

## Implementation Strategy

### Step-by-Step Approach
1. **Start with Phase 1** - core operations that other functions depend on
2. **Test thoroughly** after each phase before moving to next
3. **Keep existing function signatures** where possible for compatibility
4. **Add async/await gradually** - convert callers as you go
5. **Remove setTimeout calls** only after their async replacements are working

### Testing Strategy
1. **Test the specific race condition** that started this investigation
2. **Test mode switching** to ensure no regressions
3. **Test all favorite loading scenarios**
4. **Test rapid user interactions** (clicking buttons quickly)
5. **Test edge cases** like font loading failures

### Rollback Plan
- Keep original setTimeout-based logic as comments during transition
- Add feature flags to switch between old/new implementations
- Test new implementation thoroughly before removing old code

## Success Criteria

### Performance
- No visual flicker or inconsistent button states
- Faster, more responsive UI (no artificial delays)
- Predictable timing for all operations

### Maintainability
- Clear async dependencies make code easier to understand
- Race conditions become impossible by design
- New features can be added without timing concerns

### Reliability
- Reset button always works correctly
- Favorites always load completely
- Mode switching never leaves UI in inconsistent state

## Timeline Estimate
- **Phase 1**: 2-3 hours (core functions) ✅ **COMPLETED**
- **Phase 2**: 1-2 hours (button management) ✅ **COMPLETED**
- **Phase 3**: 1 hour (favorites - already partially done) ✅ **COMPLETED**
- **Phase 4**: 2-3 hours (mode switching complexity) ✅ **COMPLETED**
- **Phase 5**: 1-2 hours (storage operations) ✅ **COMPLETED**
- **Phase 6**: 2-3 hours (page application complexity) ✅ **COMPLETED**

**Total**: ~8-14 hours of focused refactoring ✅ **COMPLETED**

## ✅ REFACTORING COMPLETE

**Status**: All 6 phases successfully implemented. Promise-based Flow architecture is now active.

### What Was Accomplished

**Core Architecture Changes:**
- ✅ Eliminated all setTimeout hacks throughout the codebase
- ✅ Converted all font operations to proper async/await patterns
- ✅ Made CSS injection operations atomic and awaitable
- ✅ Implemented sequential font loading and application flow
- ✅ Fixed race conditions between DOM updates and UI state reads

**Specific Race Condition Fixed:**
- ✅ Reset button now appears correctly for all favorite types (font size AND line height)
- ✅ `applyFontConfig()` completes fully before `updateButtons()` functions run
- ✅ Control group state is read only after DOM updates are complete

**Key Functions Refactored:**
- ✅ `applyFontConfig()` - Clean async function with proper DOM waiting
- ✅ `loadFont()` and `selectFont()` - Full async/await conversion
- ✅ `updateBodyButtons()` and `updateAllThirdManInButtons()` - Async button state management
- ✅ `switchMode()` and `loadModeSettings()` - Coordinated mode transitions
- ✅ `applyFontToPage()` and CSS injection - Atomic page operations
- ✅ Storage operations - First-class Promise integration

### Success Criteria Met

**Performance:**
- ✅ No visual flicker or inconsistent button states
- ✅ Faster, more responsive UI (no artificial delays)
- ✅ Predictable timing for all operations

**Maintainability:**
- ✅ Clear async dependencies make code easier to understand
- ✅ Race conditions become impossible by design
- ✅ New features can be added without timing concerns

**Reliability:**
- ✅ Reset button always works correctly
- ✅ Favorites always load completely
- ✅ Mode switching never leaves UI in inconsistent state

## Risk Mitigation
- **Test after each phase** to catch regressions early
- **Keep changes small** and focused on one flow at a time
- **Maintain backward compatibility** during transition
- **Document new patterns** as they're established

This refactoring has eliminated the class of timing bugs that required multiple debugging iterations and created a much more maintainable codebase.