// api/market/price.js
// Databento에서 NQ 선물 최신 가격 조회 (서버 프록시)

module.exports = async (req, res) => {
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
        const now = new Date();
        // Historical API는 ~10분 지연 → 20분 전~15분 전 범위로 요청
        const end = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
        const start = new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // 1시간 전

        const url = 'https://hist.databento.com/v0/timeseries.get_range';
        
        const params = new URLSearchParams({
            dataset: 'GLBX.MDP3',
            symbols: 'NQ.c.0',
            stype_in: 'continuous',
            schema: 'ohlcv-1m',
            start: start,
            end: end,
            encoding: 'json',
            limit: '5'
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

        const text = await response.text();
        
        // Databento는 NDJSON (줄바꿈으로 구분된 JSON) 형식일 수 있음
        let records = [];
        if (text.trim()) {
            const lines = text.trim().split('\n');
            for (const line of lines) {
                try {
                    records.push(JSON.parse(line));
                } catch (e) {
                    try {
                        records = JSON.parse(text);
                    } catch (e2) {
                        console.error('Parse error:', e2);
                    }
                    break;
                }
            }
        }
        
        if (records.length > 0) {
            const latest = records[records.length - 1];
            
            // Databento 가격은 fixed-point: 1e-9 스케일
            const divisor = 1e9;
            const rawClose = latest.close || latest.price || 0;
            const price = rawClose / divisor;
            
            // 가격이 비정상적이면 divisor 없이 시도
            const finalPrice = price > 1000 ? price : rawClose;
            const useDivisor = price > 1000;
            const d = useDivisor ? divisor : 1;
            
            return res.status(200).json({
                symbol: 'NQ',
                price: finalPrice,
                open: (latest.open || 0) / d,
                high: (latest.high || 0) / d,
                low: (latest.low || 0) / d,
                close: finalPrice,
                volume: latest.volume || 0,
                timestamp: latest.ts_event || (latest.hd && latest.hd.ts_event),
                source: 'databento',
                records_count: records.length,
                raw_sample: latest
            });
        }

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
