// client/src/main.js
const LightweightCharts = await import('lightweight-charts');

console.log('LightweightCharts:', LightweightCharts);

// Inizializza la chart
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  width: window.innerWidth,
  height: window.innerHeight,
  layout: {
    background: { color: '#222' },
    textColor: '#DDD',
  },
  grid: {
    vertLines: { color: '#444' },
    horzLines: { color: '#444' },
  },
  timeScale: {
    timeVisible: true,
    secondsVisible: false,
  },
});

console.log('chart:', chart);

const candleSeries = chart.addCandlestickSeries({
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderVisible: false,
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
});

// Carica il timeFrame da config.json
async function getTimeFrame() {
  try {
    const response = await fetch('/data/config.json');
    const config = await response.json();
    return config.timeFrame;
  } catch (error) {
    console.error('Errore caricamento config.json:', error);
    return '3m'; // Fallback a 3m se c'è un errore
  }
}

// Carica le candele storiche
async function loadHistoricalCandles(timeFrame) {
  try {
    const response = await fetch(`/data/candles_${timeFrame}.json`);
    const candles = await response.json();
    const formattedCandles = candles.map(candle => ({
      time: candle.timestamp / 1000,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    candleSeries.setData(formattedCandles);
  } catch (error) {
    console.error('Errore caricamento candele storiche:', error);
  }
}

// Aggiorna la candela corrente
async function updateCurrentCandle(timeFrame) {
  try {
    const response = await fetch(`/data/candle_current_${timeFrame}.json`);
    const candle = await response.json();
    if (candle) {
      candleSeries.update({
        time: candle.timestamp / 1000,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });
    }
  } catch (error) {
    console.error('Errore aggiornamento candela corrente:', error);
  }
}

// Carica tutto in modo dinamico
async function initializeChart() {
  const timeFrame = await getTimeFrame();
  await loadHistoricalCandles(timeFrame);
  setInterval(() => updateCurrentCandle(timeFrame), 5000);
}

// Avvia la chart
initializeChart();

// Ridimensiona la chart se la finestra cambia dimensione
window.addEventListener('resize', () => {
  chart.resize(window.innerWidth, window.innerHeight);
});