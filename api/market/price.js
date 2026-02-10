// api/market/price.js
// Databento에서 NQ 선물 최신 가격 조회 (서버 프록시)
// 클라이언트에서 직접 Databento를 호출하면 CORS 에러 → 서버에서 대신 호출

module.exports = async (req, res) => {
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const DATABENTO_API_KEY = process.env.DATABENTO_API_KEY;
    
    if (!DATABENTO_API_KEY) {
        return res.status(500).json({ error: 'DATABENTO_API_KEY not configured' });
    }

    try {
        // NQ 연속 계약(front month)의 최신 1분봉 데이터
        const now = new Date();
        const end = now.toISOString();
        const start = new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // 5분 전

        const url = `https://hist.databento.com/v0/timeseries.get_range`;
        
        const params = new URLSearchParams({
            dataset: 'GLBX.MDP3',
            symbols: 'NQ.c.0',          // NQ 연속 계약 (front month)
            stype_in: 'continuous',
            schema: 'ohlcv-1m',          // 1분봉 OHLCV
            start: start,
            end: end,
            encoding: 'json',
            limit: '1'                    // 최신 1개만
        });

        const response = await fetch(`${url}?${params.toString()}`, {
            headers: {
                'Authorization': `Basic ${Buffer.from(DATABENTO_API_KEY + ':').toString('base64')}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Databento error:', response.status, errorText);
            return res.status(response.status).json({ 
                error: 'Databento API error', 
                status: response.status,
                detail: errorText 
            });
        }

        const data = await response.json();
        
        // 최신 가격 추출
        if (data && data.length > 0) {
            const latest = data[data.length - 1];
            return res.status(200).json({
                symbol: 'NQ',
                price: latest.close / 1e9,  // Databento는 fixed-point (1e-9)로 가격 반환
                open: latest.open / 1e9,
                high: latest.high / 1e9,
                low: latest.low / 1e9,
                close: latest.close / 1e9,
                volume: latest.volume,
                timestamp: latest.ts_event,
                source: 'databento'
            });
        }

        // 장 마감 등으로 데이터 없으면
        return res.status(200).json({
            symbol: 'NQ',
            price: null,
            message: 'No recent data (market may be closed)',
            source: 'databento'
        });

    } catch (error) {
        console.error('Price fetch error:', error);
        return res.status(500).json({ error: error.message });
    }
};
