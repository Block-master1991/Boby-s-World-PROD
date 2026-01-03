/**
 * Business Logger - KPI and Business Logic Monitoring
 * Tracks key business metrics, user journeys, and funnel conversion
 */

import { professionalLogger } from '../index';

export type BusinessEventType =
    | 'USER_SIGNUP'
    | 'USER_LOGIN'
    | 'ORDER_PLACED'
    | 'PAYMENT_SUCCESS'
    | 'PAYMENT_FAILED'
    | 'SUBSCRIPTION_RENEWED'
    | 'SUBSCRIPTION_CANCELLED'
    | 'FEATURE_USED'
    | 'A_B_TEST_EVENT'
    | 'BASKET_ABANDONED';

export interface BusinessEvent {
    type: BusinessEventType;
    userId?: string;
    value?: number;    // Monetary value or count
    currency?: string;
    properties?: Record<string, any>;
    timestamp: number;
}

/**
 * Business Logger Class
 */
export class BusinessLogger {
    private static instance: BusinessLogger;

    private constructor() { }

    public static getInstance(): BusinessLogger {
        if (!BusinessLogger.instance) {
            BusinessLogger.instance = new BusinessLogger();
        }
        return BusinessLogger.instance;
    }

    /**
     * Log a business event (KPI)
     */
    logEvent(
        type: BusinessEventType,
        properties: Record<string, any> = {},
        value?: number,
        currency: string = 'USD'
    ): void {
        const event: BusinessEvent = {
            type,
            userId: properties.userId,
            value,
            currency: value ? currency : undefined,
            properties,
            timestamp: Date.now()
        };

        professionalLogger.info(`[BUSINESS] ${type}`, {
            business: true,
            event
        });
    }

    /**
     * Track Funnel Step
     */
    logFunnelStep(
        funnelName: string,
        stepName: string,
        stepNumber: number,
        correlationId: string,
        properties: Record<string, any> = {}
    ): void {
        professionalLogger.info(`[FUNNEL] ${funnelName} - Step ${stepNumber}: ${stepName}`, {
            business: true,
            funnel: {
                name: funnelName,
                step: stepName,
                number: stepNumber,
                correlationId,
                ...properties
            }
        });
    }

    /**
     * Log A/B Test Exposure/Conversion
     */
    logExperiment(
        experimentId: string,
        variantId: string,
        action: 'EXPOSURE' | 'CONVERSION',
        userId: string
    ): void {
        this.logEvent('A_B_TEST_EVENT', {
            experimentId,
            variantId,
            action,
            userId
        });
    }
}

export const businessLogger = BusinessLogger.getInstance();
