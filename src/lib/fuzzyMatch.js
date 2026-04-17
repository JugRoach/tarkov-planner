// Levenshtein distance between two strings (case-insensitive)
function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

// Normalized similarity score (0-1, higher is better)
function similarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

function tokenize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length >= 2);
}

// Token-level score: for each query token, find its best match among the
// candidate's tokens. Rewards coverage (more tokens matched) and average
// per-token similarity. Handles partial captures like "can stew" → "Can of
// beef stew" where plain Levenshtein on the full string fails.
//
// Substring-contains bonus only fires when the shorter token is ≥4 chars —
// otherwise "ak" matches "lucky", "flak", "knack" and floods the scorer.
// Per-token similarity is clamped so an over-eager substring bonus can't
// push a weak partial match above a strong exact one.
function tokenScore(queryTokens, candidate) {
  const candTokens = tokenize(candidate);
  if (queryTokens.length === 0 || candTokens.length === 0) return 0;

  let total = 0;
  let matched = 0;
  for (const qt of queryTokens) {
    let best = 0;
    for (const ct of candTokens) {
      const shorter = qt.length < ct.length ? qt : ct;
      const longer = qt.length < ct.length ? ct : qt;
      const sub = shorter.length >= 4 && longer.includes(shorter) ? 0.1 : 0;
      const s = Math.min(1, similarity(qt, ct) + sub);
      if (s > best) best = s;
    }
    total += best;
    if (best >= 0.8) matched++;
  }

  const avg = total / queryTokens.length;
  const coverage = matched / queryTokens.length;
  // Penalty for extra candidate tokens not explained by the query, so
  // "AK-74" doesn't tie "AK-74N scope rail"
  const extras = Math.max(0, candTokens.length - queryTokens.length);
  const lengthPenalty = Math.min(0.15, extras * 0.04);
  // Coverage weighted higher: a single-token false positive (e.g. query
  // "Striker" matching just "Strike" in "Lucky Strike Cigarettes") now gets
  // coverage 1/1=1.0 but is offset by the lengthPenalty for extra tokens.
  return avg * 0.4 + coverage * 0.6 - lengthPenalty;
}

/**
 * Find the best matching item from the database for OCR text.
 * Checks against shortName first (highest priority), then name.
 * Returns the best match above the threshold.
 */
export function findBestMatch(ocrText, items, threshold = 0.5) {
  if (!ocrText || ocrText.length < 2 || !items?.length) return null;

  const query = ocrText.toLowerCase().trim();
  const queryTokens = tokenize(query);
  let bestItem = null;
  let bestScore = 0;

  for (const item of items) {
    // Check shortName (most likely to match OCR of icon text)
    const shortScore = similarity(query, item.shortName || "");
    const shortContains = (item.shortName || "").toLowerCase().includes(query) ? 0.15 : 0;
    const sScore = shortScore + shortContains;

    // Full-string name similarity
    const nameScore = similarity(query, item.name || "") * 0.8;
    const nameContains = (item.name || "").toLowerCase().includes(query) ? 0.15 : 0;
    const nScore = nameScore + nameContains;

    // Token-based name score — handles partial captures and extra words
    const tScore = tokenScore(queryTokens, item.name || "");

    const score = Math.max(sScore, nScore, tScore);
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  if (bestScore >= threshold) {
    return { item: bestItem, score: bestScore };
  }
  return null;
}

/**
 * Find top N matches for OCR text.
 */
export function findTopMatches(ocrText, items, n = 5, threshold = 0.4) {
  if (!ocrText || ocrText.length < 2 || !items?.length) return [];

  const query = ocrText.toLowerCase().trim();
  const queryTokens = tokenize(query);
  const scored = [];

  for (const item of items) {
    const shortScore = similarity(query, item.shortName || "");
    const shortContains = (item.shortName || "").toLowerCase().includes(query) ? 0.15 : 0;
    const nameScore = similarity(query, item.name || "") * 0.8;
    const nameContains = (item.name || "").toLowerCase().includes(query) ? 0.15 : 0;
    const tScore = tokenScore(queryTokens, item.name || "");
    const score = Math.max(shortScore + shortContains, nameScore + nameContains, tScore);

    if (score >= threshold) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n);
}
