import { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';

function App() {
  const [candles, setCandles] = useState([]);

  useEffect(() => {
    const fetchCandles = async () => {
      try {
        const response = await fetch('/data/candles_1m.json');
        const data = await response.json();
        setCandles(data.slice(-50));
      } catch (err) {
        console.error('Errore lettura candele:', err);
      }
    };
    fetchCandles();
    const interval = setInterval(fetchCandles, 1000);
    return () => clearInterval(interval);
  }, []);

  const timestamps = candles.map(c => new Date(c.timestamp).toLocaleTimeString());
  const opens = candles.map(c => c.open);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  return (
    <div>
      <h1>Terence Trading Dashboard</h1>
      <Plot
        data={[
          {
            type: 'candlestick',
            x: timestamps,
            open: opens,
            high: highs,
            low: lows,
            close: closes,
            increasing: { line: { color: 'green' } },
            decreasing: { line: { color: 'red' } }
          }
        ]}
        layout={{
          title: 'BTCUSDT 1m',
          xaxis: { title: 'Tempo' },
          yaxis: { title: 'Prezzo (USDT)' },
          height: 600
        }}
        config={{ responsive: true }}
      />
    </div>
  );
}

export default App;