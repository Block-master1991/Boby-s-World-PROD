
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { RECAPTCHA_SECRET_KEY } from '@/lib/constants';

export async function POST(request: NextRequest) {
  console.log('[CAPTCHA VERIFY] Received CAPTCHA verification request');

  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ success: false, error: 'Missing CAPTCHA token' }, { status: 400 });
    }

    const secretKey = RECAPTCHA_SECRET_KEY;

    if (!secretKey) {
      console.error('RECAPTCHA_SECRET_KEY is not set in environment variables. This is a critical configuration error.');
      return NextResponse.json({ success: false, error: 'Server configuration error for CAPTCHA. Secret key is missing.' }, { status: 500 });
    }

    const params = new URLSearchParams();
    params.append('secret', secretKey);
    params.append('response', token);
    const response = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params
    });

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('Failed to parse reCAPTCHA verification response as JSON:', jsonError);
      return NextResponse.json({ success: false, error: 'Invalid response from reCAPTCHA server' }, { status: 502 });
    }

    if (data.success) {
      // Add score checking for v3 if needed, or other business logic
      // e.g., if (data.score < 0.5) { return NextResponse.json({ success: false, error: 'Low CAPTCHA score' }); }
      return NextResponse.json({ success: true });
    } else {
      console.error('reCAPTCHA verification failed:', data['error-codes']);
      return NextResponse.json({ success: false, error: 'CAPTCHA verification failed', details: data['error-codes'] }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in CAPTCHA verification API:', error);
    return NextResponse.json({ success: false, error: 'Internal server error during CAPTCHA verification' }, { status: 500 });
  }
}
