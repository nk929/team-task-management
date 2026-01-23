// Supabase 설정
const SUPABASE_URL = 'https://pfatyrwaaproodukkwtp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AhyjgbSGfaozq3UPbIQTIw_1BVERfq4';

// API 헬퍼 함수
async function supabaseFetch(endpoint, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Supabase API Error:', errorText);
        throw new Error(`API Error: ${response.status}`);
    }
    
    // DELETE 요청은 빈 응답 반환
    if (options.method === 'DELETE') {
        return null;
    }
    
    return response.json();
}
