# Boby's World Passkey System Documentation

## Overview

Boby's World implements a comprehensive passkey (WebAuthn) authentication system that provides enhanced security for both regular users and administrators. The system supports biometric authentication, multi-device management, and secure account recovery.

## Architecture

### Backend Components

#### API Endpoints

1. **Registration Endpoints**
   - `POST /api/auth/webauthn/register` - Get registration challenge
   - `POST /api/auth/webauthn/register/confirm` - Confirm passkey registration

2. **Management Endpoints**
   - `GET /api/auth/webauthn/manage` - List user's passkeys
   - `DELETE /api/auth/webauthn/manage/[credentialId]` - Delete specific passkey

3. **Authentication Endpoints**
   - `POST /api/auth/webauthn/authenticate` - Get authentication challenge
   - `POST /api/auth/webauthn/verify` - Verify authentication response

4. **Recovery Endpoints**
   - `POST /api/auth/recovery/initiate` - Initiate account recovery
   - `POST /api/auth/recovery/verify` - Verify recovery code
   - `DELETE /api/auth/recovery/cancel` - Cancel recovery process

#### Database Schema

Passkeys are stored as subcollections in Firestore (merged with player profiles):

```
players/{userId}/passkeys/{credentialId}
```

├── credentialId: string
├── publicKey: string
├── counter: number
├── transports: string[]
├── description: string
├── createdAt: timestamp
├── lastUsedAt: timestamp

````

#### Security Middleware

- **Admin Middleware** (`src/lib/admin-middleware.ts`): Enforces passkey requirement for admin access
- **CSRF Protection**: All passkey operations are CSRF-protected
- **Rate Limiting**: Prevents abuse of recovery and registration endpoints

### Frontend Components

#### User Interface Components

1. **PasskeyManagement** (`src/components/auth/PasskeyManagement.tsx`)
   - Comprehensive passkey management interface
   - Add/remove/list passkeys
   - Device identification and descriptions

2. **PasskeyOnboardingModal** (`src/components/auth/PasskeyOnboardingModal.tsx`)
   - User-friendly onboarding experience
   - Educational content about passkey benefits
   - Step-by-step registration process

3. **AdminPasskeyEnrollment** (`src/components/admin/AdminPasskeyEnrollment.tsx`)
   - Mandatory passkey setup for administrators
   - Compliance and security messaging

4. **AccountRecovery** (`src/components/auth/AccountRecovery.tsx`)
   - Secure account recovery interface
   - Email verification workflow

## Security Features

### Authentication Security

- **Biometric Verification**: Supports fingerprint, face ID, and PIN authentication
- **Device Binding**: Passkeys are cryptographically bound to specific devices
- **Replay Protection**: Counters prevent signature replay attacks
- **Transport Security**: Supports USB, NFC, and Bluetooth transports

### Account Protection

- **Multi-Device Support**: Users can register multiple passkeys across devices
- **Last Passkey Protection**: Prevents deletion of the final passkey
- **Admin Enforcement**: Mandatory passkey setup for administrative accounts
- **Session Security**: Secure session management with passkey validation

### Monitoring & Alerting

- **Real-time Monitoring**: Tracks all passkey-related activities
- **Automated Alerts**: Slack notifications for security events
- **Audit Logging**: Comprehensive logging of all authentication events
- **Metrics Dashboard**: Security metrics and threat detection
- **Authenticator Metadata (MDS)**: Identifies device brands (iPhone, YubiKey, etc.) using AAGUID mapping
- **Conditional UI**: Seamless passkey autofill in the login screen for a "zero-click" experience
- **Transaction Signing**: Specialized signing for high-value transactions (Step-up Auth)

## User Workflows

### Regular User Registration

1. User connects wallet and completes initial authentication
2. System prompts user to set up passkey (optional but recommended)
3. User provides device description and completes biometric registration
4. Passkey is stored and associated with user's account

### Administrator Setup

1. Administrator attempts to access admin panel
2. System detects missing passkey and redirects to setup page
3. Administrator must complete passkey registration to proceed
4. Passkey becomes mandatory for all future admin access

### Account Recovery

1. User initiates recovery via email and wallet public key
2. System sends recovery code to provided email
3. User must wait 24 hours before verification (security cooldown)
4. Upon verification, user can register new passkey
5. Recovery process is rate-limited and monitored

## Configuration

### Environment Variables

```bash
# Admin Configuration
NEXT_PUBLIC_ADMIN_WALLET_ADDRESS=your_admin_wallet_address
ALLOWED_ADMIN_IPS=192.168.1.1,10.0.0.1

# Security Thresholds
PASSKEY_FAILED_LOGIN_THRESHOLD=10
PASSKEY_RECOVERY_ATTEMPT_THRESHOLD=5
````

### Security Monitor Configuration

```typescript
import { passkeySecurityMonitor } from "@/lib/passkey-security-monitor";

// Update alert thresholds
passkeySecurityMonitor.updateThresholds({
  failedLoginsPerHour: 15,
  recoveryAttemptsPerHour: 3,
  suspiciousActivitiesPerHour: 5,
});
```

## Testing

### Test Scenarios

1. **Passkey Registration**
   - Multiple devices
   - Different biometric methods
   - Error handling (NotAllowedError, InvalidStateError, etc.)

2. **Authentication**
   - Successful login
   - Failed attempts
   - Device mismatch

3. **Management**
   - Add/remove passkeys
   - Last passkey protection
   - Cross-device sync

4. **Recovery**
   - Valid recovery process
   - Rate limiting
   - Security cooldown

5. **Admin Enforcement**
   - Mandatory setup
   - Access control
   - Bypass handling

### Running Tests

To verify the passkey system, run the following commands:

```bash
# Unit tests for WebAuthn utilities
npx tsx scripts/webauthn-test.ts

# Integrated security suite tests
npx tsx scripts/security-suite-test.ts
```

### Security Testing

- Penetration testing for WebAuthn implementation
- Rate limiting effectiveness
- Audit log integrity
- Alert system validation
- **Passkey Protection Logic Test**: Included in `security-suite-test.ts`
- **Recovery Cooldown Test**: Included in `security-suite-test.ts`

## Deployment Checklist

- [x] Configure admin wallet addresses
- [x] Set up allowed IP ranges for admin access
- [x] Configure Slack webhooks for alerts
- [x] Test email service integration for recovery (Set `RESEND_API_KEY`)
- [ ] Verify Firebase security rules
- [ ] Set up Redis for session and recovery management
- [ ] Configure rate limiting thresholds
- [ ] Test in staging environment
- [ ] Monitor initial production deployment

## Maintenance

### Regular Tasks

- Monitor security metrics dashboard
- Review audit logs weekly
- Update alert thresholds based on usage patterns
- Rotate recovery tokens periodically
- Update device compatibility matrix

### Emergency Procedures

- Account lockout recovery process
- Compromised passkey response
- Admin access restoration
- Security incident response

## Troubleshooting

### Common Issues

1. **Passkey Registration Fails**
   - Check browser WebAuthn support
   - Verify HTTPS requirement
   - Check device biometric setup

2. **Authentication Issues**
   - Clear browser cache
   - Re-register passkey
   - Check device connectivity

3. **Admin Access Denied**
   - Verify passkey registration
   - Check IP allowlist
   - Review admin middleware logs

### Debug Commands

```bash
# Check passkey metrics
npm run passkey:metrics

# View recent audit logs
npm run audit:logs -- --filter=passkey

# Test recovery flow
npm run test:recovery
```

## Future Enhancements

- Passkey roaming support
- Hardware security module integration
- Advanced threat detection
- Multi-factor authentication combinations
- Enterprise SSO integration
- **FIDO MDS 3.0 Integration**: For even more granular device metadata

## Support

For technical support or security concerns:

- Create issue in project repository
- Contact security team for urgent matters
- Review audit logs for debugging information

---

_This documentation is maintained alongside the codebase. Please update when making changes to the passkey system._
