/**
 * Elasticity Model Types
 *
 * Types for the logistic booking probability model:
 *   P(book | price) = 1 / (1 + exp(beta0 + beta1 * (price / adr)))
 */

/** Fitted parameters for the logistic booking probability model. */
export interface ElasticityParams {
  /** Intercept term (higher = higher baseline booking probability). */
  beta0: number;
  /** Price sensitivity coefficient (negative = demand drops as price rises). */
  beta1: number;
  /** Reference ADR used to normalize prices before feeding into the model. */
  adr: number;
  /** Number of booking observations the model was fitted on. */
  sampleSize: number;
  /** ISO timestamp of when the model was last fitted. */
  fittedAt: string;
}

/** A single observation of a calendar day used for model fitting. */
export interface BookingObservation {
  /** Calendar date (YYYY-MM-DD). */
  date: string;
  /** Nightly price on that date. */
  price: number;
  /** Whether the date was booked (true) or remained available (false). */
  booked: boolean;
  /** Days between observation and check-in (lead time). */
  leadTimeDays: number;
  /** Whether the date falls on a weekend (Fri/Sat). */
  isWeekend: boolean;
}

/** A single point on the demand / expected-revenue curve. */
export interface CurvePoint {
  /** Price at this point. */
  price: number;
  /** Booking probability at this price (0-1). */
  pBook: number;
  /** Expected revenue = price * pBook. */
  expectedRevenue: number;
}

/** Result of the optimal price search. */
export interface OptimalPriceResult {
  /** The revenue-maximizing price within [floor, ceiling]. */
  price: number;
  /** Expected revenue at the optimal price. */
  expectedRevenue: number;
  /** Booking probability at the optimal price. */
  pBook: number;
}

/** Full response returned by the /api/elasticity/fit endpoint. */
export interface ElasticityFitResponse {
  params: ElasticityParams;
  curve: CurvePoint[];
  optimal: OptimalPriceResult;
}

/** Full response returned by the /api/elasticity/curve endpoint. */
export interface ElasticityCurveResponse {
  curve: CurvePoint[];
  optimal: OptimalPriceResult;
}
