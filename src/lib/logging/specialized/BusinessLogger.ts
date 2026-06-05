/**
 * Business Logger - KPI and Business Logic Monitoring
 * Tracks key business metrics, user journeys, and funnel conversion
 */

import { professionalLogger } from "../index";
import type {
  BusinessEvent,
  LogBusinessEventParams,
  LogFunnelParams,
} from "../types/BusinessTypes";

/**
 * Business Logger Class
 */
export class BusinessLogger {
  private static instance: BusinessLogger;

  private constructor() {}

  public static getInstance(): BusinessLogger {
    if (!BusinessLogger.instance) {
      BusinessLogger.instance = new BusinessLogger();
    }
    return BusinessLogger.instance;
  }

  /**
   * Log a business event (KPI)
   */
  logEvent(params: LogBusinessEventParams): void {
    const { type, properties = {}, value, currency = "USD" } = params;

    const event: BusinessEvent = {
      type,
      userId: properties.userId,
      value,
      currency: value ? currency : undefined,
      properties,
      timestamp: Date.now(),
    };

    professionalLogger.info(`[BUSINESS] ${type}`, {
      business: true,
      event,
    });
  }

  /**
   * Track Funnel Step
   */
  logFunnelStep(params: LogFunnelParams): void {
    const { funnelName, stepName, stepNumber, correlationId, properties = {} } = params;

    professionalLogger.info(`[FUNNEL] ${funnelName} - Step ${stepNumber}: ${stepName}`, {
      business: true,
      funnel: {
        name: funnelName,
        step: stepName,
        number: stepNumber,
        correlationId,
        ...properties,
      },
    });
  }

  /**
   * Log A/B Test Exposure/Conversion
   */
  logExperiment(
    experimentId: string,
    variantId: string,
    action: "EXPOSURE" | "CONVERSION",
    userId: string
  ): void {
    this.logEvent({
      type: "A_B_TEST_EVENT",
      properties: {
        experimentId,
        variantId,
        action,
        userId,
      },
    });
  }
}

export const businessLogger = BusinessLogger.getInstance();
