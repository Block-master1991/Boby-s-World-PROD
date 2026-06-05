export type BusinessEventType =
  | "USER_SIGNUP"
  | "USER_LOGIN"
  | "ORDER_PLACED"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "SUBSCRIPTION_RENEWED"
  | "SUBSCRIPTION_CANCELLED"
  | "FEATURE_USED"
  | "A_B_TEST_EVENT"
  | "BASKET_ABANDONED";

export interface BusinessEventMetadata {
  userId?: string | undefined;
  [key: string]: unknown;
}

export interface BusinessEvent {
  type: BusinessEventType;
  userId?: string | undefined;
  value?: number | undefined; // Monetary value or count
  currency?: string | undefined;
  properties?: BusinessEventMetadata | undefined;
  timestamp: number;
}

export interface LogBusinessEventParams {
  type: BusinessEventType;
  properties?: BusinessEventMetadata | undefined;
  value?: number | undefined;
  currency?: string | undefined;
}

export interface LogFunnelParams {
  funnelName: string;
  stepName: string;
  stepNumber: number;
  correlationId: string;
  properties?: BusinessEventMetadata | undefined;
}
