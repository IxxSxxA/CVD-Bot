tensorflow/
├── data/
│   └── candles_1m.json  # Copia locale del file, se necessario
├── models/
│   └── lstm_model/      # Modello TensorFlow salvato
├── scripts/
│   ├── data_loader.py   # Legge il JSON e prepara i dati
│   ├── indicators.py    # Calcola CVD, FVG, ATR
│   ├── model.py         # Definisce e addestra il modello TensorFlow
│   ├── strategy.py      # Implementa la strategia di trading
│   └── main.py          # Script principale per esecuzione live
├── logs/
│   └── trades.log       # Log delle operazioni
└── requirements.txt     # Dipendenze del progetto