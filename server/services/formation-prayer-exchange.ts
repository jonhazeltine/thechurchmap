/**
 * Formation Prayer Exchange Service
 * Handles all communication with The Formation App's prayer exchange API
 * 
 * Formation API endpoints:
 *   GET  /prayer-exchange                       — Fetch prayers from latest active challenge (auto-resolved)
 *   GET  /prayer-exchange?challenge_id=...       — Fetch prayers for a specific challenge
 *   GET  /prayer-exchange?action=challenges      — List all prayer challenges for discovery
 *   POST /prayer-exchange                        — Submit a prayer response to a specific request
 *   POST /prayer-exchange { action: "submit_prayer", request_text, user_name? } — Push a prayer request into the community (pending approval)
 * 
 * Auth: x-api-key header with the church's own API key (each church gets a unique key from Formation)
 * Response includes resolved_challenge_id
 */

const BASE_URL = 'https://jfxcfyskzujqrfbgcbbv.supabase.co/functions/v1/prayer-exchange';

export interface FormationPrayer {
  id: string;
  prayer_request_id: string;
  title?: string;
  body: string;
  is_anonymous: boolean;
  submitter_name?: string;
  church_name?: string;
  church_id?: string;
  created_at: string;
  answered_at?: string;
  challenge_id: string;
}

export interface FormationExchangeResponse {
  prayers: FormationPrayer[];
  partner: string;
  count: number;
  resolved_challenge_id: string;
}

export interface FormationChallenge {
  id: string;
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}

export interface FormationChallengesResponse {
  challenges: FormationChallenge[];
  count: number;
}

interface PrayerResponsePayload {
  prayer_request_id: string;
  response_text: string;
}

async function makeFormationRequest<T>(
  apiKey: string,
  method: 'GET' | 'POST',
  queryParams: Record<string, string> = {},
  body?: unknown
): Promise<T | null> {
  if (!apiKey) {
    console.error('Formation API key not provided');
    return null;
  }

  const params = new URLSearchParams(queryParams);
  const queryString = params.toString();
  const url = queryString ? `${BASE_URL}?${queryString}` : BASE_URL;
  
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
      },
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(
        `Formation API error: ${response.status} ${response.statusText}`,
        `URL: ${url}`,
        errorText ? `Body: ${errorText}` : ''
      );
      return null;
    }

    const data = await response.json() as T;
    return data;
  } catch (error) {
    console.error('Formation API request failed:', error, `URL: ${url}`);
    return null;
  }
}

/**
 * Fetches prayer requests from the latest active challenge (auto-resolved).
 */
export async function fetchFormationPrayers(apiKey: string): Promise<FormationExchangeResponse | null> {
  return makeFormationRequest<FormationExchangeResponse>(apiKey, 'GET');
}

/**
 * Fetches prayer requests for a specific challenge.
 */
export async function fetchFormationPrayersByChallenge(apiKey: string, challengeId: string): Promise<FormationExchangeResponse | null> {
  if (!challengeId) {
    console.error('fetchFormationPrayersByChallenge: Missing challenge ID');
    return null;
  }
  return makeFormationRequest<FormationExchangeResponse>(apiKey, 'GET', { challenge_id: challengeId });
}

/**
 * Lists all available prayer challenges for discovery.
 */
export async function fetchFormationChallenges(apiKey: string): Promise<FormationChallengesResponse | null> {
  return makeFormationRequest<FormationChallengesResponse>(apiKey, 'GET', { action: 'challenges' });
}

/**
 * Submits a prayer response back to Formation for a specific prayer request.
 */
export async function submitPrayerResponse(
  apiKey: string,
  prayerRequestId: string,
  responseText: string
): Promise<boolean> {
  if (!prayerRequestId || !responseText) {
    console.error('submitPrayerResponse: Missing required parameters');
    return false;
  }

  const payload: PrayerResponsePayload = {
    prayer_request_id: prayerRequestId,
    response_text: responseText,
  };

  const result = await makeFormationRequest<{ success: boolean }>(
    apiKey,
    'POST',
    {},
    payload
  );

  return result?.success ?? false;
}

/**
 * Pushes a local prayer request into the Formation community.
 * Lands as pending and requires Formation admin approval.
 * user_name is optional — omit for anonymous submissions.
 */
export async function submitPrayerToFormation(
  apiKey: string,
  requestText: string,
  userName?: string
): Promise<{ success: boolean; prayer_request_id?: string } | null> {
  if (!requestText) {
    console.error('submitPrayerToFormation: Missing request_text');
    return null;
  }

  const payload: Record<string, string> = {
    action: 'submit_prayer',
    request_text: requestText,
  };

  if (userName) {
    payload.user_name = userName;
  }

  return makeFormationRequest<{ success: boolean; prayer_request_id?: string }>(
    apiKey,
    'POST',
    {},
    payload
  );
}
