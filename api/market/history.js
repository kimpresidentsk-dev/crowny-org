// api/market/history.js
// Databento에서 NQ 선물 과거 OHLCV 데이터 조회 (차트용)

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
        // 쿼리 파라미터
        const { 
            timeframe = '5m',      // 1m, 5m, 1h, 1d
            hours = '24'           // 몇 시간 전 데이터부터
        } = req.query;

        // 스키마 매핑
        const schemaMap = {
            '1m': 'ohlcv-1m',
            '5m': 'ohlcv-1m',    // 5분봉은 1분봉을 클라이언트에서 집계
            '1h': 'ohlcv-1h',
            '1d': 'ohlcv-1d'
        };
        const schema = schemaMap[timeframe] || 'ohlcv-1m';

        const now = new Date();
        const hoursNum = parseInt(hours) || 24;
        const start = new Date(now.getTime() - hoursNum * 60 * 60 * 1000).toISOString();
        const end = new Date(now.getTime() - 15 * 60 * 1000).toISOString(); // 15분 전까지

        const url = `https://hist.databento.com/v0/timeseries.get_range`;
        
        const params = new URLSearchParams({
            dataset: 'GLBX.MDP3',
            symbols: 'NQ.c.0',
            stype_in: 'continuous',
            schema: schema,
            start: start,
            end: end,
            encoding: 'json'
        });

        const response = await fetch(`${url}?${params.toString()}`, {
            headers: {
                'Authorization': `Basic ${Buffer.from(DATABENTO_API_KEY + ':').toString('base64')}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Databento history error:', response.status, errorText);
            return res.status(response.status).json({ 
                error: 'Databento API error',
                detail: errorText 
            });
        }

        const text = await response.text();
        
        // Databento NDJSON 파싱
        let data = [];
        if (text.trim()) {
            const lines = text.trim().split('\n');
            for (const line of lines) {
                try {
                    data.push(JSON.parse(line));
                } catch (e) {
                    try {
                        data = JSON.parse(text);
                    } catch (e2) {
                        console.error('Parse error:', e2);
                    }
                    break;
                }
            }
        }
        
        if (!data || data.length === 0) {
            return res.status(200).json({ candles: [], volume: [] });
        }

        // 가격 스케일 자동 감지 (Databento는 1e-9 fixed-point)
        const firstClose = data[0].close || 0;
        const divisor = (firstClose / 1e9) > 1000 ? 1e9 : 1;

        // Databento 데이터를 Lightweight Charts 형식으로 변환
        const candles = data.map(r => ({
            time: Math.floor((r.ts_event || r.hd?.ts_event || 0) / 1e9),
            open: (r.open || 0) / divisor,
            high: (r.high || 0) / divisor,
            low: (r.low || 0) / divisor,
            close: (r.close || 0) / divisor
        }));

        const volume = data.map(r => ({
            time: Math.floor((r.ts_event || r.hd?.ts_event || 0) / 1e9),
            value: r.volume || 0,
            color: ((r.close || 0) / divisor) > ((r.open || 0) / divisor) ? '#26a69a' : '#ef5350'
        }));

        // 5분봉 집계 (1분봉 데이터를 5분 단위로 합치기)
        if (timeframe === '5m' && candles.length > 0) {
            const aggregated = aggregate5Min(candles, volume);
            return res.status(200).json(aggregated);
        }

        return res.status(200).json({ candles, volume });

    } catch (error) {
        console.error('History fetch error:', error);
        return res.status(500).json({ error: error.message });
    }
};

// 1분봉 → 5분봉 집계
function aggregate5Min(candles, volumes) {
    const result = { candles: [], volume: [] };
    
    for (let i = 0; i < candles.length; i += 5) {
        const chunk = candles.slice(i, i + 5);
        const volChunk = volumes.slice(i, i + 5);
        
        if (chunk.length === 0) break;
        
        result.candles.push({
            time: chunk[0].time,
            open: chunk[0].open,
            high: Math.max(...chunk.map(c => c.high)),
            low: Math.min(...chunk.map(c => c.low)),
            close: chunk[chunk.length - 1].close
        });

        result.volume.push({
            time: chunk[0].time,
            value: volChunk.reduce((sum, v) => sum + v.value, 0),
            color: chunk[chunk.length - 1].close > chunk[0].open ? '#26a69a' : '#ef5350'
        });
    }
    
    return result;
}
