/**
 * Session Risk and Location Utilities
 */

import type { DeviceInfo, GeoLocation } from './types';

/**
 * Calculate risk level based on device info
 */
export function calculateRiskScore(deviceInfo: DeviceInfo): number {
    let riskScore = 0;

    if (deviceInfo.userAgent.includes('bot') || deviceInfo.userAgent.includes('crawler')) {
        riskScore += 30;
    }

    const resolutionParts = deviceInfo.screenResolution.split('x');
    const width = resolutionParts[0] ? Number(resolutionParts[0]) : undefined;
    const height = resolutionParts[1] ? Number(resolutionParts[1]) : undefined;

    // Match original behavior: if resolution is missing/unparseable, no penalty added
    if (width !== undefined && height !== undefined) {
        if (width < 800 || height < 600) {
            riskScore += 10;
        }
    }

    if (deviceInfo.hardwareConcurrency < 2) {
        riskScore += 5;
    }

    if (deviceInfo.deviceMemory && deviceInfo.deviceMemory < 2) {
        riskScore += 5;
    }

    if (deviceInfo.plugins.length === 0) {
        riskScore += 10;
    }

    return Math.min(riskScore, 100);
}

/**
 * Calculate distance between two geographic locations (Haversine formula)
 */
export function calculateDistance(loc1: GeoLocation, loc2: GeoLocation): number {
    const R = 6371; // Earth's radius in km
    const dLat = toRadians(loc2.lat - loc1.lat);
    const dLon = toRadians(loc2.lng - loc1.lng);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(loc1.lat)) * Math.cos(toRadians(loc2.lat)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}
