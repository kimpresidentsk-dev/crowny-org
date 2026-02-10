# api/market/live.py
# Databento Live API를 통한 NQ 실시간 가격 조회
# Vercel Python Serverless Function

import os
import json
import time
from http.server import BaseHTTPRequestHandler

# Databento 라이브러리 임포트
try:
    import databento as db
except ImportError:
    db = None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        api_key = os.environ.get('DATABENTO_API_KEY')

        if not api_key:
            self.wfile.write(json.dumps({
                'error': 'DATABENTO_API_KEY not configured'
            }).encode())
            return

        if db is None:
            self.wfile.write(json.dumps({
                'error': 'databento package not installed'
            }).encode())
            return

        try:
            # Live 클라이언트로 NQ 최신 가격 가져오기
            client = db.Live(key=api_key)

            # NQ 연속 계약 구독 (mbp-1 = top of book, 가장 가벼운 스키마)
            client.subscribe(
                dataset='GLBX.MDP3',
                schema='mbp-1',
                symbols=['NQ.c.0'],
                stype_in='continuous',
            )

            # 첫 번째 레코드 받기 (최대 5초 대기)
            latest_price = None
            latest_bid = None
            latest_ask = None
            record_count = 0
            start_time = time.time()

            for record in client:
                record_count += 1
                elapsed = time.time() - start_time

                # mbp-1 레코드에서 가격 추출
                if hasattr(record, 'price'):
                    price = record.price / 1e9  # fixed-point → float
                    if price > 1000:  # NQ는 20000대
                        latest_price = price

                # bid/ask 추출
                if hasattr(record, 'levels') and len(record.levels) > 0:
                    level = record.levels[0]
                    bid = level.bid_px / 1e9
                    ask = level.ask_px / 1e9
                    if bid > 1000:
                        latest_bid = bid
                    if ask > 1000:
                        latest_ask = ask
                    # bid/ask 중간값으로 가격 설정
                    if latest_bid and latest_ask:
                        latest_price = (latest_bid + latest_ask) / 2

                # 가격을 얻었으면 즉시 종료
                if latest_price and latest_price > 1000:
                    break

                # 최대 5초 대기
                if elapsed > 5:
                    break

                # 최대 10개 레코드만
                if record_count >= 10:
                    break

            # 연결 종료
            try:
                client.close()
            except:
                pass

            if latest_price and latest_price > 1000:
                result = {
                    'symbol': 'NQ',
                    'price': round(latest_price, 2),
                    'bid': round(latest_bid, 2) if latest_bid else None,
                    'ask': round(latest_ask, 2) if latest_ask else None,
                    'timestamp': int(time.time() * 1000),
                    'source': 'databento-live',
                    'records_received': record_count
                }
            else:
                result = {
                    'symbol': 'NQ',
                    'price': None,
                    'message': 'No price data received (market may be closed)',
                    'source': 'databento-live',
                    'records_received': record_count
                }

            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            self.wfile.write(json.dumps({
                'error': str(e),
                'type': type(e).__name__
            }).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.end_headers()
