project/
├── data/                   # Cartella per CSV JSON 
│   └── candles_XXm.json    # Dati candele aggregate // Un file per ogni TF -> candles_1m candles_5m ecc ..
├── indicators/             # Cartella indicatori
│   ├── atr.js              # indicatore atr
│   ├── cvd.js              # indicatore cvd
│   └── fvg.js              # indicatore fvg
├── src/
│   ├── exchanges/          # Logiche connessione agli exchanges multipli // Ok logica prende gli exchange che trova nella cartella
│   │   ├── bybit.js        # Ok costruito
│   │   ├── binance.js      # Da fare
│   │   ├── coinbase.js     # Da fare
│   │   └── okex.js         # Da Fare
│   ├── bot.js              # Coordinatore principale
│   ├── config.js           # parametri configurazione del bot
│   ├── cvdStrategy.js      # strategia CVD
│   └── dataAggregator.js   # Aggrega candele per chart e per strategia // TF multipli possibili + Aggrega tutti gli exchanges
├── charts/                 # Da Fare Tutto
│   ├── index.html          # Pagina web per il grafico  // Da fare
│   ├── index.js            # Logica del grafico live // Da fare
│   └── vite.config.js      # Configurazione Vite // Da fare
├── .env                    # Chiavi connessione exchanges per trading
├── package.json
└── README.md               # questo file