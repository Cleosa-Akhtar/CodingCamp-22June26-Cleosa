// ── In-Memory State ──────────────────────────────────────────────────────────
let transactions = [];
let categories = [];
let chartInstance = null;

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'ebv_transactions';
const CATEGORIES_KEY = 'ebv_categories';
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];
const WARNING_BANNER_ID = 'ebv-warning-banner';

// ── Theme_Manager Constants ───────────────────────────────────────────────────
const THEME_KEY   = 'ebv_theme';
const THEME_DARK  = 'dark';
const THEME_LIGHT = 'light';

// ── Theme_Manager — Safe Storage Helpers ─────────────────────────────────────

/**
 * Safely reads a value from localStorage without throwing.
 * Returns the stored string on success, or null on any error.
 * @param {string} key
 * @returns {string|null}
 */
function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

/**
 * Safely writes a value to localStorage without throwing.
 * Silently discards errors (e.g. quota exceeded or storage blocked).
 * @param {string} key
 * @param {string} value
 */
function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    // silently discard — consistent with existing storage-error pattern
  }
}

// ── Theme_Manager — applyTheme ────────────────────────────────────────────────

/**
 * Applies the given theme to the document by setting data-theme on <html>,
 * updates the #theme-toggle button label and aria-label, and persists the
 * choice to localStorage.
 *
 * The only DOM mutations are:
 *  - data-theme attribute on document.documentElement
 *  - textContent and aria-label on #theme-toggle (if present)
 * No inline style attributes or CSS class changes are made.
 *
 * Satisfies: Requirements 1.2, 1.3, 1.6, 1.7, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 4.5
 *
 * @param {string} theme - Either THEME_DARK ('dark') or THEME_LIGHT ('light').
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    if (theme === THEME_DARK) {
      btn.textContent = '☀️ Light Mode';
      btn.setAttribute('aria-label', 'Switch to light mode');
    } else {
      btn.textContent = '🌙 Dark Mode';
      btn.setAttribute('aria-label', 'Switch to dark mode');
    }
  }

  safeLocalStorageSet(THEME_KEY, theme);
}

// ── Theme_Manager — toggleTheme ───────────────────────────────────────────────

/**
 * Flips the active theme between light and dark by reading the current
 * data-theme attribute on <html> and calling applyTheme with the opposite.
 *
 * This is the click handler wired to #theme-toggle.
 *
 * Satisfies: Requirements 1.5, 2.1
 */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === THEME_DARK ? THEME_LIGHT : THEME_DARK);
}

// ── Theme_Manager — initTheme ─────────────────────────────────────────────────

/**
 * Reads the stored theme preference from localStorage and applies it.
 * Falls back to the OS prefers-color-scheme media query if no stored
 * preference is found. Falls back to THEME_LIGHT if both are unavailable.
 *
 * Must be called as the FIRST statement in DOMContentLoaded so the correct
 * theme is applied before any UI rendering.
 *
 * Satisfies: Requirements 1.4, 3.2, 3.3, 3.4, 3.5
 */
function initTheme() {
  const stored = safeLocalStorageGet(THEME_KEY);
  if (stored === THEME_DARK || stored === THEME_LIGHT) {
    applyTheme(stored);
  } else {
    try {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? THEME_DARK : THEME_LIGHT);
    } catch (err) {
      applyTheme(THEME_LIGHT);
    }
  }
}

// ── Warning Banner ────────────────────────────────────────────────────────────

/**
 * Shows (or updates) a non-blocking yellow warning banner at the top of the
 * page. Creates the element once and reuses it on subsequent calls.
 *
 * @param {string} message - The message to display in the banner.
 */
function showWarningBanner(message) {
  let banner = document.getElementById(WARNING_BANNER_ID);

  if (!banner) {
    banner = document.createElement('div');
    banner.id = WARNING_BANNER_ID;
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'polite');
    banner.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 100%',
      'background: #ffe066',
      'color: #333',
      'padding: 10px 16px',
      'font-size: 0.9rem',
      'text-align: center',
      'z-index: 9999',
      'box-shadow: 0 2px 4px rgba(0,0,0,0.15)',
      'box-sizing: border-box',
    ].join('; ');

    // Dismiss button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Dismiss warning');
    closeBtn.style.cssText = [
      'margin-left: 12px',
      'background: none',
      'border: none',
      'cursor: pointer',
      'font-size: 1rem',
      'color: #333',
      'vertical-align: middle',
    ].join('; ');
    closeBtn.addEventListener('click', () => banner.remove());

    banner.appendChild(closeBtn);
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // Update the text content without removing the close button
  // The first text node carries the message; recreate it each time.
  for (const node of Array.from(banner.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      banner.removeChild(node);
    }
  }
  banner.insertBefore(document.createTextNode(message), banner.firstChild);
}

// ── Storage ───────────────────────────────────────────────────────────────────

/**
 * Reads transactions from localStorage.
 *
 * - Returns a parsed Transaction[] on success.
 * - Returns [] and logs to console if the stored value cannot be parsed.
 * - Returns [] and shows a warning banner if localStorage itself throws
 *   (e.g. storage is disabled in the browser).
 *
 * Satisfies: Requirements 5.3, 5.4
 *
 * @returns {Array} The stored transactions, or an empty array on any failure.
 */
function loadTransactions() {
  let raw;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    showWarningBanner(
      'Storage is unavailable. Your transactions will not be saved this session.'
    );
    return [];
  }

  if (raw === null) {
    // Nothing stored yet — that's fine.
    return [];
  }

  let txns;
  try {
    const parsed = JSON.parse(raw);
    // Guard against stored non-array values
    txns = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[EBV] Failed to parse stored transactions:', err);
    return [];
  }

  // ── Pass 1: createdAt repair ──────────────────────────────────────────────
  // For every transaction that lacks a createdAt field OR whose createdAt is
  // not a valid ISO 8601 string, set createdAt to today at midnight UTC.
  // Only createdAt is touched; id, name, amount, and category are unchanged.
  const todayMidnight = new Date().toISOString().replace(/T.*/, 'T00:00:00.000Z');
  for (const tx of txns) {
    const isValidISO =
      typeof tx.createdAt === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(tx.createdAt) &&
      !isNaN(Date.parse(tx.createdAt));
    if (!isValidISO) {
      tx.createdAt = todayMidnight;
    }
  }

  // ── Pass 2: category fallback ─────────────────────────────────────────────
  // For every transaction whose category is not in the current categories array
  // and is not 'Uncategorized', set category = 'Uncategorized'.
  // Persist the corrected array if any transaction was changed.
  let categoryChanged = false;
  for (const tx of txns) {
    if (tx.category !== 'Uncategorized' && !categories.includes(tx.category)) {
      tx.category = 'Uncategorized';
      categoryChanged = true;
    }
  }
  if (categoryChanged) {
    saveTransactions(txns);
  }

  return txns;
}

/**
 * Serializes and persists the given transactions array to localStorage.
 *
 * Shows a non-blocking warning banner if the write fails (e.g. quota exceeded
 * or storage unavailable), but does not throw — the app keeps working with the
 * in-memory state for the remainder of the session.
 *
 * Satisfies: Requirements 5.1, 5.2, 5.4
 *
 * @param {Array} txns - The current transactions array to persist.
 */
function saveTransactions(txns) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txns));
  } catch (err) {
    showWarningBanner(
      'Could not save transactions to storage (storage may be full or unavailable).'
    );
  }
}

/**
 * Reads the category list from localStorage.
 *
 * - Returns the stored string[] on success.
 * - Returns DEFAULT_CATEGORIES if the key is absent or the value is not a valid
 *   JSON array; logs a console error on parse failure.
 * - Never throws.
 *
 * Satisfies: Requirements 3.1, 3.2, 3.3, 1.8
 *
 * @returns {string[]} The stored categories, or DEFAULT_CATEGORIES on any failure.
 */
function loadCategories() {
  let raw;

  try {
    raw = localStorage.getItem(CATEGORIES_KEY);
  } catch (err) {
    showWarningBanner(
      'Storage is unavailable. Your categories will not be saved this session.'
    );
    return DEFAULT_CATEGORIES.slice();
  }

  if (raw === null) {
    // Key is absent — seed with defaults.
    return DEFAULT_CATEGORIES.slice();
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    // Stored value is valid JSON but not an array — fall through to default.
    console.error('[EBV] Category store is not an array; resetting to defaults.');
    return DEFAULT_CATEGORIES.slice();
  } catch (err) {
    console.error('[EBV] Failed to parse category store; resetting to defaults:', err);
    return DEFAULT_CATEGORIES.slice();
  }
}

/**
 * Serializes and persists the given categories array to localStorage.
 *
 * Shows a non-blocking warning banner if the write fails (e.g. quota exceeded
 * or storage unavailable) and returns false. Returns true on success.
 *
 * Satisfies: Requirements 3.1, 1.6
 *
 * @param {string[]} cats - The categories array to persist.
 * @returns {boolean} true on success, false on failure.
 */
function saveCategories(cats) {
  try {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
    return true;
  } catch (err) {
    showWarningBanner(
      'Could not save categories to storage (storage may be full or unavailable).'
    );
    return false;
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validates the three form inputs before a transaction is created.
 *
 * Rules:
 *  - `name`     must be a non-empty string after trimming whitespace.
 *  - `amount`   must be a number (or numeric string) that is > 0 and not NaN.
 *  - `category` must be present in the dynamic `categories` array, or be 'Uncategorized'.
 *
 * Satisfies: Requirements 1.2, 1.3, 1.4
 *
 * @param {string}   name       - The item name entered by the user.
 * @param {*}        amount     - The amount value from the form (may be string or number).
 * @param {string}   category   - The selected category string.
 * @param {string[]} categories - The current list of valid category names.
 * @returns {{ valid: boolean, message?: string }}
 *   `{ valid: true }` when all inputs pass, or
 *   `{ valid: false, message: string }` describing the first validation failure.
 */
function validateForm(name, amount, category, cats) {
  // Default to the global categories array when the 4th argument is omitted
  // (supports legacy call-sites that pass only 3 arguments).
  const validCategories = Array.isArray(cats) ? cats : categories;

  // 1. Name must be non-empty after trimming whitespace
  if (typeof name !== 'string' || name.trim() === '') {
    return { valid: false, message: 'Item name is required.' };
  }

  // 2. Amount must be a positive number (> 0, not NaN, not empty)
  const numericAmount = Number(amount);
  if (amount === '' || amount === null || amount === undefined || isNaN(numericAmount) || numericAmount <= 0) {
    return { valid: false, message: 'Amount must be a positive number.' };
  }

  // 3. Category must be one of the dynamic categories or 'Uncategorized'
  if (!validCategories.includes(category) && category !== 'Uncategorized') {
    return { valid: false, message: 'Please select a valid category.' };
  }

  return { valid: true };
}

/**
 * Validates a proposed new category name against the existing category list.
 *
 * Rules:
 *  - `name` must not be empty or whitespace-only after trimming.
 *  - Trimmed `name` must be 50 characters or fewer.
 *  - `name` (trimmed) must not already exist in `categories` (case-insensitive).
 *
 * Pure function — no DOM reads/writes, no localStorage side-effects.
 *
 * Satisfies: Requirements 1.3, 1.4
 *
 * @param {string}   name       - The proposed category name entered by the user.
 * @param {string[]} categories - The current list of category names.
 * @returns {{ valid: boolean, message?: string }}
 *   `{ valid: true }` when the name passes all checks, or
 *   `{ valid: false, message: string }` describing the first validation failure.
 */
function validateCategoryName(name, categories) {
  const trimmed = name.trim();

  // 1. Name must be non-empty after trimming whitespace
  if (trimmed === '') {
    return { valid: false, message: 'Category name is required.' };
  }

  // 2. Trimmed name must be 50 characters or fewer
  if (trimmed.length > 50) {
    return { valid: false, message: 'Category name must be 50 characters or fewer.' };
  }

  // 3. Name must not duplicate an existing category (case-insensitive)
  const lowerTrimmed = trimmed.toLowerCase();
  if (categories.some(cat => cat.toLowerCase() === lowerTrimmed)) {
    return { valid: false, message: 'Category already exists.' };
  }

  return { valid: true };
}

// ── State Mutations ───────────────────────────────────────────────────────────

/**
 * Adds a new category to the in-memory `categories` array and persists it.
 *
 * Steps:
 *  1. Validate `name` via `validateCategoryName`. On failure, display the
 *     error message in `#category-form-error` and return `false`.
 *  2. Push `name.trim()` to `categories`. Attempt `saveCategories`. If the
 *     save fails, pop the entry back out, display an error in
 *     `#category-form-error`, and return `false`.
 *  3. On success: rebuild `#item-category` options from the updated
 *     `categories` array; call `renderCategoryManager()` if it exists;
 *     clear the add-category input field; return `true`.
 *
 * Satisfies: Requirements 1.2, 1.6, 1.7
 *
 * @param {string} name - The proposed category name entered by the user.
 * @returns {boolean} `true` on success, `false` on any failure.
 */
function addCategory(name) {
  const errorEl = document.getElementById('category-form-error');

  // Step 1 — validate
  const validation = validateCategoryName(name, categories);
  if (!validation.valid) {
    if (errorEl) {
      errorEl.textContent = validation.message;
    }
    return false;
  }

  // Step 2 — optimistically push and attempt to persist
  const trimmed = name.trim();
  categories.push(trimmed);

  const saved = saveCategories(categories);
  if (!saved) {
    categories.pop();
    if (errorEl) {
      errorEl.textContent = 'Could not save the new category. Please try again.';
    }
    return false;
  }

  // Step 3 — success: update the dropdown, re-render manager, clear input
  const select = document.getElementById('item-category');
  if (select) {
    // Rebuild options from the updated categories array, preserving the
    // placeholder first option if present.
    const placeholder = select.querySelector('option[value=""]');
    select.innerHTML = '';
    if (placeholder) {
      select.appendChild(placeholder);
    }
    for (const cat of categories) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    }
  }

  // Call renderCategoryManager if it has been defined yet (later task)
  if (typeof renderCategoryManager === 'function') {
    renderCategoryManager();
  }

  // Clear the add-category input
  const input = document.getElementById('new-category-name');
  if (input) {
    input.value = '';
  }

  // Clear any previous error
  if (errorEl) {
    errorEl.textContent = '';
  }

  return true;
}

/**
 * Deletes a custom category by name, optionally reassigning its transactions
 * to the 'Uncategorized' fallback, then persists all changes.
 *
 * Steps:
 *  1. Count transactions whose `category === name`.
 *  2. If count > 0, show a `confirm()` dialog describing the reassignment.
 *     If the user cancels, return without any changes.
 *  3. Remove `name` from the in-memory `categories` array.
 *  4. Reassign affected transactions: `tx.category = 'Uncategorized'`.
 *  5. Call `saveCategories(categories)`. On failure: restore the removed entry,
 *     restore original transaction categories, call `showWarningBanner`, return.
 *  6. Call `saveTransactions(transactions)`.
 *  7. Call `renderAll()`.
 *
 * Satisfies: Requirements 2.3, 2.4, 2.5, 2.6, 2.7
 *
 * @param {string} name - The category name to delete.
 */
function deleteCategory(name) {
  // Step 1 — count affected transactions
  const affectedCount = transactions.filter(tx => tx.category === name).length;

  // Step 2 — prompt user if there are affected transactions
  if (affectedCount > 0) {
    const confirmed = confirm(
      `Deleting "${name}" will reassign ${affectedCount} transaction${affectedCount === 1 ? '' : 's'} to "Uncategorized". Proceed?`
    );
    if (!confirmed) {
      return;
    }
  }

  // Step 3 — remove from categories (save index for rollback)
  const categoryIndex = categories.indexOf(name);
  categories.splice(categoryIndex, 1);

  // Step 4 — reassign affected transactions, saving originals for rollback
  const originalCategories = transactions.map(tx => tx.category);
  for (const tx of transactions) {
    if (tx.category === name) {
      tx.category = 'Uncategorized';
    }
  }

  // Step 5 — persist categories; rollback everything on failure
  const categoriesSaved = saveCategories(categories);
  if (!categoriesSaved) {
    // Restore removed category entry
    categories.splice(categoryIndex, 0, name);
    // Restore original transaction categories
    transactions.forEach((tx, i) => {
      tx.category = originalCategories[i];
    });
    showWarningBanner(
      `Could not delete category "${name}". Storage write failed — no changes were made.`
    );
    return;
  }

  // Step 6 — persist transactions
  saveTransactions(transactions);

  // Step 7 — re-render all UI
  renderAll();
}

/**
 * Creates a new transaction and appends it to the in-memory array, then
 * persists the updated array to localStorage.
 *
 * The name is trimmed before storage. The amount is coerced to a float so
 * the stored value is always numeric regardless of whether a string or number
 * was passed in (mirrors the form's string output).
 *
 * Satisfies: Requirements 1.2, 5.1
 *
 * @param {string} name     - The item name (will be trimmed).
 * @param {number|string} amount   - The expense amount (will be parsed as float).
 * @param {string} category - One of "Food", "Transport", or "Fun".
 */
function addTransaction(name, amount, category) {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString();

  const transaction = {
    id,
    name: name.trim(),
    amount: parseFloat(amount),
    category,
    createdAt: new Date().toISOString(),
  };

  transactions.push(transaction);
  saveTransactions(transactions);
}

/**
 * Removes the transaction with the given id from the in-memory array, then
 * persists the updated array to localStorage.
 *
 * If no transaction matches the given id, the array is unchanged and
 * `saveTransactions` is still called (idempotent behaviour).
 *
 * Satisfies: Requirements 2.3, 5.2
 *
 * @param {string} id - The unique id of the transaction to remove.
 */
function deleteTransaction(id) {
  transactions = transactions.filter((tx) => tx.id !== id);
  saveTransactions(transactions);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats a numeric amount as a locale-aware currency string using the
 * browser's built-in `Intl.NumberFormat` API.
 *
 * Examples:
 *   formatCurrency(12.5)       → "$12.50"
 *   formatCurrency(0)          → "$0.00"
 *   formatCurrency(1234567.89) → "$1,234,567.89"
 *
 * Satisfies: Requirements 2.1, 3.1
 *
 * @param {number} amount - The numeric value to format.
 * @returns {string} The formatted currency string.
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Computes the running balance (sum of all amounts) across the given transactions.
 *
 * Returns 0 for an empty array. This is a pure function — it does not mutate
 * the input array or any external state.
 *
 * Examples:
 *   computeBalance([])
 *     → 0
 *
 *   computeBalance([
 *     { id: '1', name: 'Lunch', amount: 12.50, category: 'Food' },
 *     { id: '2', name: 'Bus',   amount: 2.00,  category: 'Transport' },
 *   ])
 *     → 14.50
 *
 * Satisfies: Requirements 3.1, 3.4
 *
 * @param {Array<{id: string, name: string, amount: number, category: string}>} txns
 *   The transactions to sum.
 * @returns {number} The arithmetic sum of all `amount` fields, or 0 if the array is empty.
 */
function computeBalance(txns) {
  return txns.reduce((sum, tx) => sum + tx.amount, 0);
}

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * Updates the `#balance-display` element with the current running total,
 * formatted as a currency string.
 *
 * Selects `#balance-display` from the DOM and sets its `textContent` to the
 * result of `formatCurrency(computeBalance(txns))`.
 *
 * Satisfies: Requirements 3.1, 3.2, 3.3, 3.4
 *
 * @param {Array<{id: string, name: string, amount: number, category: string}>} txns
 *   The current transactions array to compute and display the balance for.
 */
function renderBalance(txns) {
  // Update only the amount span so the "Total:" label is preserved
  const amountEl = document.getElementById('balance-amount');
  if (amountEl) {
    amountEl.textContent = formatCurrency(computeBalance(txns));
  }
}

/**
 * Renders the transaction list into `#transaction-list`.
 *
 * Clears the list and rebuilds it from the given transactions array. Each item
 * is rendered as a `<li>` containing:
 *  - A `.tx-name` span with the item name
 *  - A `.tx-amount` span with the amount formatted as currency
 *  - A `.tx-category` span (pill badge) with the category label
 *  - A `.delete-btn` button with a `data-id` attribute and accessible aria-label
 *
 * Clicking a delete button calls `deleteTransaction(id)` then `renderAll()`.
 *
 * Satisfies: Requirements 2.1, 2.3
 *
 * @param {Array<{id: string, name: string, amount: number, category: string}>} txns
 *   The current transactions array to render.
 */
function renderList(txns) {
  const listEl = document.getElementById('transaction-list');
  if (!listEl) return;

  // Clear existing items
  listEl.innerHTML = '';

  txns.forEach((tx) => {
    // <li data-id="{id}">
    const li = document.createElement('li');
    li.dataset.id = tx.id;

    // Item name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'tx-name';
    nameSpan.textContent = tx.name;

    // Formatted amount
    const amountSpan = document.createElement('span');
    amountSpan.className = 'tx-amount';
    amountSpan.textContent = formatCurrency(tx.amount);

    // Category badge
    const categorySpan = document.createElement('span');
    categorySpan.className = 'tx-category';
    categorySpan.dataset.category = tx.category;
    categorySpan.textContent = tx.category;

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.dataset.id = tx.id;
    deleteBtn.setAttribute('aria-label', `Delete transaction: ${tx.name}`);
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      deleteTransaction(tx.id);
      renderAll();
    });

    li.appendChild(nameSpan);
    li.appendChild(amountSpan);
    li.appendChild(categorySpan);
    li.appendChild(deleteBtn);

    listEl.appendChild(li);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Computes the total amount spent per category across the given transactions.
 *
 * Initialises a totals object from the provided `categories` array (plus the
 * built-in `'Uncategorized'` key), each set to 0. Iterates `txns` and
 * accumulates amounts for matching keys; unknown keys are silently ignored.
 *
 * This is a pure function — it does not mutate the input array or any external
 * state.
 *
 * Examples:
 *   computeCategoryTotals([], ['Food', 'Transport', 'Fun'])
 *     → { Food: 0, Transport: 0, Fun: 0, Uncategorized: 0 }
 *
 *   computeCategoryTotals([
 *     { id: '1', name: 'Lunch',  amount: 12.50, category: 'Food' },
 *     { id: '2', name: 'Bus',    amount: 2.00,  category: 'Transport' },
 *     { id: '3', name: 'Dinner', amount: 30.00, category: 'Food' },
 *   ], ['Food', 'Transport', 'Fun'])
 *     → { Food: 42.50, Transport: 2.00, Fun: 0, Uncategorized: 0 }
 *
 * Satisfies: Requirements 4.1, 4.4
 *
 * @param {Array<{id: string, name: string, amount: number, category: string}>} txns
 *   The transactions to aggregate.
 * @param {string[]} categories
 *   The current list of category names used to initialise the totals keys.
 * @returns {Object.<string, number>}
 *   Summed totals keyed by each entry in `categories` plus `'Uncategorized'`.
 */
function computeCategoryTotals(txns, categories) {
  // Build totals object dynamically from the categories array
  const totals = {};
  for (const cat of categories) {
    totals[cat] = 0;
  }
  totals['Uncategorized'] = 0;

  for (const tx of txns) {
    if (tx.category in totals) {
      totals[tx.category] += tx.amount;
    }
    // Unknown keys (should not occur post-migration) are silently ignored
  }

  return totals;
}

// ── Chart Rendering ───────────────────────────────────────────────────────────

/**
 * Returns a deterministic HSL colour string for the given category name.
 *
 * Uses a simple polynomial hash so every category name (including custom ones)
 * always maps to the same hue across page reloads.
 *
 * Satisfies: Requirements 4.3
 *
 * @param {string} name - The category name.
 * @returns {string} A CSS `hsl(...)` colour string.
 */
function categoryColour(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 65%, 50%)`;
}

/**
 * Renders or updates the spending pie/doughnut chart in `#spending-chart`.
 *
 * Behaviour:
 *  - When `txns` is empty: hides the `<canvas>` and shows `#chart-empty-state`.
 *  - When `txns` has data: shows the canvas, hides the empty-state element.
 *  - Only categories with a non-zero total appear as chart segments (Req 4.4).
 *  - On first call, creates a new Chart.js instance (Req 4.1).
 *  - On subsequent calls, mutates the existing instance's data and calls
 *    `.update()` — avoids destroying/recreating the canvas (Req 4.2, 4.3).
 *
 * Satisfies: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 *
 * @param {Array<{id: string, name: string, amount: number, category: string}>} txns
 *   The current transactions array used to compute chart data.
 */
function renderChart(txns) {
  const canvas    = document.getElementById('spending-chart');
  const emptyState = document.getElementById('chart-empty-state');

  if (!canvas || !emptyState) return;

  // ── Empty-state: no transactions ─────────────────────────────────────────
  if (txns.length === 0) {
    canvas.classList.add('hidden');
    emptyState.classList.remove('hidden');

    // Destroy any existing chart instance so it doesn't linger in memory
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  // ── Data has transactions: show canvas, hide empty state ─────────────────
  canvas.classList.remove('hidden');
  emptyState.classList.add('hidden');

  // Compute totals and filter to non-zero categories only (Req 4.4)
  const totals = computeCategoryTotals(txns, categories);
  const labels  = [];
  const data    = [];
  const colours = [];

  for (const [category, total] of Object.entries(totals)) {
    if (total > 0) {
      labels.push(category);
      data.push(total);
      colours.push(categoryColour(category));
    }
  }

  // ── Update existing chart ─────────────────────────────────────────────────
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  // ── Create new chart ──────────────────────────────────────────────────────
  // Guard against Chart.js CDN failing to load (Req 4.5 / Error Handling)
  if (typeof Chart === 'undefined') {
    emptyState.textContent = 'Chart unavailable (Chart.js failed to load).';
    canvas.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  chartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colours,
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 14 },
            padding: 16,
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed;
              return ` ${context.label}: ${new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(value)}`;
            },
          },
        },
      },
    },
  });
}

/**
 * Rebuilds the `#category-list` and the `#item-category` select dropdown to
 * reflect the current in-memory `categories` array.
 *
 * For `#category-list`:
 *  - Clears the list and creates one `<li>` per category with the name as text.
 *  - If the category is NOT one of `DEFAULT_CATEGORIES`, appends a
 *    `<button class="category-delete-btn">` with an accessible `aria-label`
 *    wired to `deleteCategory(name)`.
 *
 * For `#item-category`:
 *  - Preserves the placeholder `<option value="">` first option.
 *  - Removes all other options and appends one `<option>` per category.
 *
 * Satisfies: Requirements 1.5, 2.1, 2.2
 */
function renderCategoryManager() {
  // ── Rebuild #category-list ────────────────────────────────────────────────
  const listEl = document.getElementById('category-list');
  if (listEl) {
    listEl.innerHTML = '';

    for (const name of categories) {
      const li = document.createElement('li');

      // Category name text node
      li.appendChild(document.createTextNode(name));

      // Delete button — only for non-default categories
      if (!DEFAULT_CATEGORIES.includes(name)) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'category-delete-btn';
        deleteBtn.setAttribute('aria-label', `Delete category ${name}`);
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
          deleteCategory(name);
        });
        li.appendChild(deleteBtn);
      }

      listEl.appendChild(li);
    }
  }

  // ── Rebuild #item-category select ─────────────────────────────────────────
  const select = document.getElementById('item-category');
  if (select) {
    // Preserve the placeholder option (first option with value="")
    const placeholder = select.querySelector('option[value=""]');
    select.innerHTML = '';
    if (placeholder) {
      select.appendChild(placeholder);
    }

    for (const name of categories) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }
  }
}

// ── Monthly Summary Computation ───────────────────────────────────────────────

/**
 * Formats a YYYY-MM key string into a human-readable "Month YYYY" label.
 *
 * Examples:
 *   formatMonthLabel('2025-06') → 'June 2025'
 *   formatMonthLabel('2024-01') → 'January 2024'
 *
 * Uses Intl.DateTimeFormat with UTC time zone to avoid day-boundary shifts
 * caused by local time zone offsets when constructing the Date.
 *
 * Satisfies: Requirements 5.2, 6.2
 *
 * @param {string} key - A YYYY-MM string.
 * @returns {string} A human-readable label like "June 2025".
 */
function formatMonthLabel(key) {
  // Append "-01" to get the first day of the month, then parse as UTC.
  const date = new Date(`${key}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Groups and summarises transactions by calendar month.
 *
 * Pure function — no DOM reads/writes, no localStorage side-effects.
 *
 * Algorithm:
 *  1. Extract the YYYY-MM prefix from each transaction's `createdAt` field.
 *  2. Accumulate per-category amounts and a running total for each month key.
 *  3. Return a MonthEntry[] sorted in descending lexicographic order by key
 *     (most recent month first).
 *
 * MonthEntry shape:
 *  {
 *    key:        string,  // "YYYY-MM"
 *    label:      string,  // "June 2025"
 *    categories: object,  // { [categoryName]: number } — only non-zero entries
 *    total:      number,  // arithmetic sum of all amounts in the month
 *  }
 *
 * Satisfies: Requirements 5.1, 5.2, 5.3, 5.4, 6.2
 *
 * @param {Array<{createdAt: string, category: string, amount: number}>} txns
 *   The transactions to summarise.
 * @returns {Array<{key: string, label: string, categories: object, total: number}>}
 *   Month entries sorted descending by key.
 */
function computeMonthlySummary(txns) {
  const map = {};

  for (const tx of txns) {
    const key = tx.createdAt.slice(0, 7); // "YYYY-MM"
    if (!map[key]) {
      map[key] = { totals: {}, total: 0 };
    }
    map[key].totals[tx.category] = (map[key].totals[tx.category] || 0) + tx.amount;
    map[key].total += tx.amount;
  }

  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a)) // descending by key
    .map(([key, data]) => ({
      key,
      label: formatMonthLabel(key),
      categories: data.totals,
      total: data.total,
    }));
}

/**
 * Renders the monthly summary cards into `#monthly-summary-content`.
 *
 * Behaviour:
 *  - Clears `#monthly-summary-content` on every call.
 *  - If `txns.length === 0`, shows `#monthly-summary-empty` and returns early.
 *  - Otherwise hides `#monthly-summary-empty`, calls `computeMonthlySummary`,
 *    and creates one `.month-card` `<div>` per MonthEntry containing:
 *      • an `<h3>` with the month label
 *      • one `.month-category-row` `<div>` per non-zero category
 *      • a `.month-total-row` `<div>` with the month total
 *
 * Satisfies: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 *
 * @param {Array<{createdAt: string, category: string, amount: number}>} txns
 *   The current transactions array to summarise and render.
 */
function renderMonthlySummary(txns) {
  const contentEl = document.getElementById('monthly-summary-content');
  const emptyEl   = document.getElementById('monthly-summary-empty');

  if (!contentEl || !emptyEl) return;

  // Clear previous content
  contentEl.innerHTML = '';

  if (txns.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  const entries = computeMonthlySummary(txns);

  for (const entry of entries) {
    const card = document.createElement('div');
    card.className = 'month-card';

    // Month heading
    const heading = document.createElement('h3');
    heading.textContent = entry.label;
    card.appendChild(heading);

    // Per-category rows (only non-zero, already filtered by computeMonthlySummary)
    for (const [cat, amount] of Object.entries(entry.categories)) {
      const row = document.createElement('div');
      row.className = 'month-category-row';
      row.innerHTML = `<span>${cat}</span><span>${formatCurrency(amount)}</span>`;
      card.appendChild(row);
    }

    // Total row
    const totalRow = document.createElement('div');
    totalRow.className = 'month-total-row';
    totalRow.innerHTML = `<span>Total</span><span>${formatCurrency(entry.total)}</span>`;
    card.appendChild(totalRow);

    contentEl.appendChild(card);
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Re-renders the transaction list, balance display, chart, and monthly summary
 * from the current in-memory `transactions` array.
 *
 * Call this after every state mutation (add or delete) so all four UI regions
 * stay in sync.
 *
 * Satisfies: Requirements 2.1, 3.2, 3.3, 4.2, 4.3, 5.5
 */
function renderAll() {
  renderList(transactions);
  renderBalance(transactions);
  renderChart(transactions);
  renderMonthlySummary(transactions);
  renderCategoryManager();
}

// ── Event Listeners & Bootstrap ───────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Apply the saved or system theme before any UI rendering (Task 7.1)
  initTheme();

  // Wire the theme toggle click handler
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // Hydrate in-memory state from localStorage.
  // categories must be loaded BEFORE transactions so Pass 2 migration works.
  categories = loadCategories();
  transactions = loadTransactions();

  // Initial render
  renderAll();
  renderCategoryManager();

  // Transaction form submission handler
  const form = document.getElementById('transaction-form');
  const errorEl = document.getElementById('form-error');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name     = document.getElementById('item-name').value;
      const amount   = document.getElementById('item-amount').value;
      const category = document.getElementById('item-category').value;

      const result = validateForm(name, amount, category, categories);

      if (!result.valid) {
        errorEl.textContent = result.message;
        errorEl.style.display = 'block';
        return;
      }

      // Clear any previous error and hide the error element
      errorEl.textContent = '';
      errorEl.style.display = 'none';

      addTransaction(name, amount, category);
      renderAll();

      // Reset form fields (Req 1.5)
      form.reset();
    });
  }

  // Add-category form submission handler
  const addCategoryForm = document.getElementById('add-category-form');
  if (addCategoryForm) {
    addCategoryForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('new-category-name');
      if (nameInput) {
        addCategory(nameInput.value);
      }
    });
  }
});
