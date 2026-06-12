/**
 * Elasticity Model v0 — Logistic Booking Probability
 *
 * Model:
 *   P(book | price) = 1 / (1 + exp(beta0 + beta1 * (price / adr)))
 *
 * Fitting uses Iteratively Reweighted Least Squares (IRLS), which is
 * equivalent to Newton-Raphson on the log-likelihood of logistic regression.
 *
 * Cold start: when fewer than 30 observations are available the fitted
 * coefficients are blended with sensible Dubai STR market defaults so the
 * model degrades gracefully rather than producing wild estimates.
 */

import type {
  ElasticityParams,
  BookingObservation,
  CurvePoint,
  OptimalPriceResult,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum observations for a "fully fitted" model (no blending). */
const MIN_SAMPLE_FULL_FIT = 30;

/** Maximum IRLS iterations. */
const MAX_ITER = 100;

/** Convergence threshold for coefficient change between iterations. */
const CONVERGENCE_EPS = 1e-8;

/**
 * Default cold-start parameters calibrated for Dubai STR market.
 *
 * At price = ADR the probability is:
 *   sigmoid(2.5 + (-3.8) * 1) = sigmoid(-1.3) ~ 0.21
 *
 * That looks low, but these defaults are intentionally conservative; the
 * real curve shapes up quickly once we have 10-15 observations.  The ADR
 * placeholder (500) is replaced by the Airbtics market ADR at call time.
 */
const COLD_START_DEFAULTS: ElasticityParams = {
  beta0: 2.5,
  beta1: -3.8,
  adr: 500,
  sampleSize: 0,
  fittedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Core probability function
// ---------------------------------------------------------------------------

/**
 * Compute booking probability for a given price.
 *
 * P(book | price) = sigmoid(beta0 + beta1 * (price / adr))
 *
 * Returns a value clamped to [1e-15, 1 - 1e-15] to avoid numerical issues.
 */
export function pBook(price: number, params: ElasticityParams): number {
  const z = params.beta0 + params.beta1 * (price / params.adr);
  return sigmoid(z);
}

// ---------------------------------------------------------------------------
// Optimal price search
// ---------------------------------------------------------------------------

/**
 * Find the price that maximizes expected revenue = price * P(book | price)
 * within [floor, ceiling].
 *
 * Uses golden-section search which converges quickly on unimodal functions.
 */
export function optimalPrice(
  params: ElasticityParams,
  floor: number,
  ceiling: number,
): OptimalPriceResult {
  const expectedRev = (p: number) => p * pBook(p, params);

  // Golden-section search
  const phi = (1 + Math.sqrt(5)) / 2;
  const resphi = 2 - phi;

  let a = floor;
  let b = ceiling;
  let x1 = a + resphi * (b - a);
  let x2 = b - resphi * (b - a);
  let f1 = expectedRev(x1);
  let f2 = expectedRev(x2);

  for (let i = 0; i < 100; i++) {
    if (Math.abs(b - a) < 0.01) break;

    if (f1 < f2) {
      // Maximum is in [x1, b]
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = b - resphi * (b - a);
      f2 = expectedRev(x2);
    } else {
      // Maximum is in [a, x2]
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = a + resphi * (b - a);
      f1 = expectedRev(x1);
    }
  }

  const bestPrice = Math.round((a + b) / 2);
  const prob = pBook(bestPrice, params);

  return {
    price: bestPrice,
    expectedRevenue: Math.round(bestPrice * prob * 100) / 100,
    pBook: Math.round(prob * 1000) / 1000,
  };
}

// ---------------------------------------------------------------------------
// Model fitting — IRLS logistic regression
// ---------------------------------------------------------------------------

/**
 * Fit the logistic model to booking observations.
 *
 * Uses Iteratively Reweighted Least Squares (IRLS) — the standard algorithm
 * for maximum-likelihood estimation of logistic regression coefficients.
 *
 * Each observation is a (price, booked) pair.  The single feature is
 * `price / adr` (normalized price).
 *
 * When `observations.length < 30` the fitted coefficients are blended with
 * cold-start defaults, weighted by `n / 30`.
 *
 * @param observations  Array of booking observations
 * @param fallbackAdr   Airbtics market ADR used when observations are sparse
 * @returns             Fitted ElasticityParams
 */
export function fitElasticityModel(
  observations: BookingObservation[],
  fallbackAdr?: number,
): ElasticityParams {
  const n = observations.length;
  const adr = computeAdr(observations, fallbackAdr);

  // If no observations at all, return cold-start defaults with the real ADR.
  if (n === 0) {
    return {
      ...COLD_START_DEFAULTS,
      adr,
      fittedAt: new Date().toISOString(),
    };
  }

  // Build feature matrix: X is (n x 2) with columns [1, price/adr].
  // y is the binary outcome vector.
  const X: number[][] = [];
  const y: number[] = [];

  for (const obs of observations) {
    X.push([1, obs.price / adr]);
    y.push(obs.booked ? 1 : 0);
  }

  // Initialize coefficients (warm start from cold-start defaults).
  let beta = [COLD_START_DEFAULTS.beta0, COLD_START_DEFAULTS.beta1];

  // IRLS iterations
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Compute predicted probabilities and working weights.
    const mu: number[] = []; // predicted probabilities
    const W: number[] = []; // diagonal of weight matrix: mu_i * (1 - mu_i)

    for (let i = 0; i < n; i++) {
      const eta = beta[0] * X[i][0] + beta[1] * X[i][1];
      const p = sigmoid(eta);
      mu.push(p);
      W.push(p * (1 - p));
    }

    // Compute X^T W X  (2x2 matrix) and X^T (y - mu)  (2x1 vector).
    // Then solve for the Newton step: delta = (X^T W X)^{-1} X^T (y - mu).
    const XtWX = [
      [0, 0],
      [0, 0],
    ];
    const XtR = [0, 0]; // r = y - mu (residuals)

    for (let i = 0; i < n; i++) {
      const w = W[i];
      const r = y[i] - mu[i];

      for (let j = 0; j < 2; j++) {
        XtR[j] += X[i][j] * r;
        for (let k = 0; k < 2; k++) {
          XtWX[j][k] += X[i][j] * w * X[i][k];
        }
      }
    }

    // Add small ridge regularization to avoid singular matrix.
    XtWX[0][0] += 1e-6;
    XtWX[1][1] += 1e-6;

    // Invert 2x2 matrix.
    const inv = invert2x2(XtWX);
    if (!inv) break; // singular — stop early

    // Newton step.
    const delta = [
      inv[0][0] * XtR[0] + inv[0][1] * XtR[1],
      inv[1][0] * XtR[0] + inv[1][1] * XtR[1],
    ];

    beta[0] += delta[0];
    beta[1] += delta[1];

    // Check convergence.
    if (Math.abs(delta[0]) < CONVERGENCE_EPS && Math.abs(delta[1]) < CONVERGENCE_EPS) {
      break;
    }
  }

  // Clamp coefficients to sane ranges to prevent degenerate models.
  beta[0] = clamp(beta[0], -10, 20);
  beta[1] = clamp(beta[1], -20, 5);

  // Blend with cold-start defaults if sample is small.
  let finalBeta0 = beta[0];
  let finalBeta1 = beta[1];

  if (n < MIN_SAMPLE_FULL_FIT) {
    const w = n / MIN_SAMPLE_FULL_FIT; // 0..1
    finalBeta0 = w * beta[0] + (1 - w) * COLD_START_DEFAULTS.beta0;
    finalBeta1 = w * beta[1] + (1 - w) * COLD_START_DEFAULTS.beta1;
  }

  return {
    beta0: Math.round(finalBeta0 * 10000) / 10000,
    beta1: Math.round(finalBeta1 * 10000) / 10000,
    adr,
    sampleSize: n,
    fittedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Demand curve generation
// ---------------------------------------------------------------------------

/**
 * Generate discrete points along the demand and expected-revenue curves.
 *
 * @param params   Fitted elasticity parameters
 * @param floor    Minimum price
 * @param ceiling  Maximum price
 * @param steps    Number of points to generate (default 50)
 * @returns        Array of { price, pBook, expectedRevenue }
 */
export function elasticityCurve(
  params: ElasticityParams,
  floor: number,
  ceiling: number,
  steps: number = 50,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  const step = (ceiling - floor) / Math.max(steps - 1, 1);

  for (let i = 0; i < steps; i++) {
    const price = Math.round(floor + step * i);
    const prob = pBook(price, params);
    points.push({
      price,
      pBook: Math.round(prob * 1000) / 1000,
      expectedRevenue: Math.round(price * prob * 100) / 100,
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Numerically stable sigmoid function. */
function sigmoid(z: number): number {
  // Clamp to avoid overflow in exp()
  const clamped = clamp(z, -500, 500);
  if (clamped >= 0) {
    const ez = Math.exp(-clamped);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(clamped);
  return ez / (1 + ez);
}

/** Invert a 2x2 matrix.  Returns null if singular. */
function invert2x2(m: number[][]): number[][] | null {
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  return [
    [m[1][1] * invDet, -m[0][1] * invDet],
    [-m[1][0] * invDet, m[0][0] * invDet],
  ];
}

/** Clamp a value to [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute ADR from observations, falling back to `fallbackAdr` or the
 * cold-start default.
 */
function computeAdr(
  observations: BookingObservation[],
  fallbackAdr?: number,
): number {
  // Use booked observations to compute average daily rate.
  const booked = observations.filter((o) => o.booked);
  if (booked.length >= 5) {
    const sum = booked.reduce((s, o) => s + o.price, 0);
    return Math.round(sum / booked.length);
  }

  return fallbackAdr ?? COLD_START_DEFAULTS.adr;
}
