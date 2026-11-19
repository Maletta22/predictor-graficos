"""
Descarga velas diarias de varios activos y las guarda en la carpeta data/.

Se ejecuta a mano, desde la carpeta del proyecto:
    .venv\\Scripts\\python.exe scripts\\download_data.py

Para cada activo crea data/<ticker>.json con el formato del CLAUDE.md, y al
final crea data/index.json con la lista de activos disponibles y
data/fed_funds.json y data/ecb_rate.json con el histórico de tipos de
interés de la FED y del BCE.
"""

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
import yfinance as yf
from curl_cffi import requests as curl_requests  # viene instalado con yfinance

# Carpeta donde se guardan los datos (data/ al lado de scripts/)
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# El antivirus Avast intercepta las conexiones HTTPS y las firma con su propio
# certificado. Windows confía en él, pero Python no, y la descarga falla con
# "CERTIFICATE_VERIFY_FAILED". Si el certificado de Avast existe, lo usamos
# para verificar las conexiones; si no, se usa la verificación normal (True).
AVAST_CERT = Path(r"C:\ProgramData\Avast Software\Avast\wscert.pem")
SSL_VERIFY = str(AVAST_CERT) if AVAST_CERT.exists() else True

# Mínimo de años de datos que pedimos a cada activo (ver CLAUDE.md, apartado 6)
MIN_YEARS = 5

# Lista de activos a descargar.
#   ticker: nombre corto que usamos nosotros (y nombre del archivo .json)
#   source: de dónde se descarga ("binance" o "yahoo")
#   symbol: cómo se llama el activo en esa fuente
#   market: "crypto", "bolsa", "forex" o "materias" (materias primas)
ASSETS = [
    # --- Crypto (Binance) ---
    {"ticker": "BTCUSDT", "name": "Bitcoin / USD", "market": "crypto",
     "source": "binance", "symbol": "BTCUSDT"},
    {"ticker": "ETHUSDT", "name": "Ethereum / USD", "market": "crypto",
     "source": "binance", "symbol": "ETHUSDT"},
    {"ticker": "SOLUSDT", "name": "Solana / USD", "market": "crypto",
     "source": "binance", "symbol": "SOLUSDT"},

    # --- Bolsa: índices (Yahoo Finance) ---
    {"ticker": "SPX", "name": "S&P 500", "market": "bolsa",
     "source": "yahoo", "symbol": "^GSPC"},
    {"ticker": "NDX", "name": "Nasdaq 100", "market": "bolsa",
     "source": "yahoo", "symbol": "^NDX"},
    {"ticker": "STOXX50", "name": "Euro Stoxx 50", "market": "bolsa",
     "source": "yahoo", "symbol": "^STOXX50E"},
    {"ticker": "DAX", "name": "DAX (Alemania)", "market": "bolsa",
     "source": "yahoo", "symbol": "^GDAXI"},
    {"ticker": "IBEX", "name": "IBEX 35", "market": "bolsa",
     "source": "yahoo", "symbol": "^IBEX"},
    {"ticker": "N225", "name": "Nikkei 225 (Japón)", "market": "bolsa",
     "source": "yahoo", "symbol": "^N225"},

    # --- Bolsa: acciones ---
    {"ticker": "AAPL", "name": "Apple", "market": "bolsa",
     "source": "yahoo", "symbol": "AAPL"},
    {"ticker": "SAN", "name": "Banco Santander", "market": "bolsa",
     "source": "yahoo", "symbol": "SAN.MC"},

    # --- FOREX (Yahoo Finance) ---
    {"ticker": "EURUSD", "name": "Euro / Dólar", "market": "forex",
     "source": "yahoo", "symbol": "EURUSD=X"},
    {"ticker": "GBPUSD", "name": "Libra / Dólar", "market": "forex",
     "source": "yahoo", "symbol": "GBPUSD=X"},
    {"ticker": "USDJPY", "name": "Dólar / Yen", "market": "forex",
     "source": "yahoo", "symbol": "USDJPY=X"},
    {"ticker": "USDCHF", "name": "Dólar / Franco suizo", "market": "forex",
     "source": "yahoo", "symbol": "USDCHF=X"},
    {"ticker": "AUDUSD", "name": "Dólar australiano / Dólar", "market": "forex",
     "source": "yahoo", "symbol": "AUDUSD=X"},
    {"ticker": "EURGBP", "name": "Euro / Libra", "market": "forex",
     "source": "yahoo", "symbol": "EURGBP=X"},

    # --- Materias primas (Yahoo Finance) ---
    # Oro y plata: usamos los fondos cotizados (ETF) GLD y SLV, que compran el
    # metal físico y se mueven igual que él. Los futuros (GC=F, SI=F) tienen
    # cientos de días sin datos en Yahoo. Ojo: el precio es el de una
    # participación del fondo, no el de una onza.
    # Brent y no WTI: el WTI cotizó en negativo en abril de 2020 y un precio
    # negativo rompe la normalización (la última vela visible = 100).
    {"ticker": "GOLD", "name": "Oro (fondo GLD)", "market": "materias",
     "source": "yahoo", "symbol": "GLD"},
    {"ticker": "SILVER", "name": "Plata (fondo SLV)", "market": "materias",
     "source": "yahoo", "symbol": "SLV"},
    {"ticker": "BRENT", "name": "Petróleo Brent", "market": "materias",
     "source": "yahoo", "symbol": "BZ=F"},
]

# Si un activo sube o baja más que esto en un solo día, el script avisa:
# podría ser un error en los datos (p. ej. un "split" de acciones sin ajustar).
SUSPICIOUS_DAILY_MOVE = 0.30  # 30 %


# ---------------------------------------------------------------------------
# Descarga desde Binance (crypto)
# ---------------------------------------------------------------------------

BINANCE_URL = "https://data-api.binance.vision/api/v3/klines"


def download_binance(symbol):
    """Descarga todas las velas diarias de Binance para un símbolo.

    Binance devuelve como máximo 1000 velas por petición, así que pedimos
    bloques de 1000 hasta llegar a hoy.
    """
    candles = []
    start_ms = 0  # empezar desde el principio de la historia del activo
    now_ms = int(time.time() * 1000)

    while True:
        params = {"symbol": symbol, "interval": "1d",
                  "startTime": start_ms, "limit": 1000}
        response = requests.get(BINANCE_URL, params=params, timeout=30,
                                verify=SSL_VERIFY)
        response.raise_for_status()  # si hay un error HTTP, parar aquí
        rows = response.json()
        if not rows:
            break

        for row in rows:
            # Cada fila es: [hora apertura, open, high, low, close, volumen,
            #                hora cierre, ...]. Los precios vienen como texto.
            open_time_ms, o, h, l, c = row[0], row[1], row[2], row[3], row[4]
            close_time_ms = row[6]
            # Saltamos la vela de hoy: todavía no ha cerrado.
            if close_time_ms > now_ms:
                continue
            date = datetime.fromtimestamp(open_time_ms / 1000, tz=timezone.utc)
            candles.append({
                "t": date.strftime("%Y-%m-%d"),
                "o": float(o), "h": float(h), "l": float(l), "c": float(c),
            })

        if len(rows) < 1000:
            break  # era el último bloque
        start_ms = rows[-1][0] + 1  # siguiente bloque, justo después del último
        time.sleep(0.2)  # una pausa corta para no saturar la API

    return candles


# ---------------------------------------------------------------------------
# Descarga desde Yahoo Finance (bolsa y FOREX)
# ---------------------------------------------------------------------------

def download_yahoo(symbol):
    """Descarga todas las velas diarias disponibles en Yahoo Finance."""
    # yfinance usa su propia conexión (curl_cffi); le pasamos la misma
    # configuración de certificados que a Binance.
    session = curl_requests.Session(impersonate="chrome", verify=SSL_VERIFY)
    # auto_adjust=False: queremos los precios tal como cotizaron.
    table = yf.Ticker(symbol, session=session).history(
        period="max", interval="1d", auto_adjust=False)
    candles = []
    for date, row in table.iterrows():
        candles.append({
            "t": date.strftime("%Y-%m-%d"),
            "o": float(row["Open"]), "h": float(row["High"]),
            "l": float(row["Low"]), "c": float(row["Close"]),
        })
    return candles


# ---------------------------------------------------------------------------
# Tipos de interés de la FED (FRED, Reserva Federal de San Luis)
# ---------------------------------------------------------------------------

# Series de FRED (Reserva Federal de San Luis): públicas, sin cuenta.
# Formato CSV: "observation_date,SERIE" y una fila por fecha.
#   FEDFUNDS: tipo efectivo de la FED, ya viene con un dato por mes (media).
#   ECBDFR: tipo de la facilidad de depósito del BCE (su tipo de referencia),
#           viene con un dato por DÍA; nos quedamos con el último de cada mes.
FRED_SERIES = [
    {"series": "FEDFUNDS", "file": "fed_funds.json",
     "name": "Tipo de interés efectivo de la FED (media mensual, %)"},
    {"series": "ECBDFR", "file": "ecb_rate.json",
     "name": "Tipo de la facilidad de depósito del BCE (fin de mes, %)"},
]


def download_fred_series(series, file, name):
    """Descarga una serie de tipos de interés de FRED y la guarda en data/
    con un valor por mes, con fechas "AAAA-MM-01"."""
    print(f"Descargando {name} (FRED, {series})...")
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}"
    response = requests.get(url, timeout=30, verify=SSL_VERIFY)
    response.raise_for_status()

    # Diccionario mes → valor. Si hay varios datos en un mes (serie diaria),
    # cada uno sobrescribe al anterior y queda el último del mes.
    by_month = {}
    lines = response.text.strip().splitlines()
    for line in lines[1:]:  # la primera línea es la cabecera
        date, rate = line.split(",")
        if rate == ".":  # FRED usa "." para las fechas sin dato
            continue
        by_month[f"{date[:7]}-01"] = float(rate)  # "1999-01-15" → "1999-01-01"

    values = [{"t": month, "v": by_month[month]} for month in sorted(by_month)]
    output = {
        "series": series,
        "name": name,
        "source": f"https://fred.stlouisfed.org/series/{series}",
        "values": values,
    }
    path = DATA_DIR / file
    path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    print(f"  {len(values)} meses, de {values[0]['t']} a {values[-1]['t']}")


# ---------------------------------------------------------------------------
# Limpieza de datos
# ---------------------------------------------------------------------------

def clean_candles(candles):
    """Quita velas vacías, erróneas o incompletas, duplicados, y ordena por fecha."""
    # Fecha de hoy en formato "AAAA-MM-DD". Como las fechas tienen ese formato,
    # se pueden comparar como texto: "2026-11-18" < "2026-11-19".
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    by_date = {}
    for candle in candles:
        prices = [candle["o"], candle["h"], candle["l"], candle["c"]]
        # Quitar velas con valores nulos (NaN) o precios <= 0.
        # Truco: NaN no es igual a sí mismo, así que "p != p" detecta un NaN.
        if any(p != p or p <= 0 for p in prices):
            continue
        # Quitar la vela de hoy (o posteriores): el día aún no ha cerrado.
        if candle["t"] >= today:
            continue
        # Quitar velas "planas" (apertura = máximo = mínimo = cierre).
        # Son días en que solo se conoce el cierre (p. ej. el S&P 500 antes de
        # 1983) o festivos sin cotización. En el gráfico no aportan nada.
        if min(prices) == max(prices):
            continue
        # A veces el máximo/mínimo viene mal (p. ej. FOREX en Yahoo).
        # El máximo debe ser el precio más alto de la vela y el mínimo el más bajo.
        candle["h"] = max(prices)
        candle["l"] = min(prices)
        # Redondear para que los archivos no sean enormes
        for key in ("o", "h", "l", "c"):
            candle[key] = round(candle[key], 6)
        # Si una fecha aparece dos veces, nos quedamos con la última
        by_date[candle["t"]] = candle

    cleaned = [by_date[date] for date in sorted(by_date)]
    removed = len(candles) - len(cleaned)  # erróneas + duplicadas
    return cleaned, removed


def rebuild_forex_closes(candles):
    """Corrige las velas de divisas de Yahoo Finance.

    Problema: en los datos de divisas de Yahoo, el "cierre" de cada día es en
    realidad el precio al EMPEZAR el día (desde ~2021, apertura y cierre son
    idénticos en más del 80 % de los días). Las velas salen sin cuerpo.

    Solución: el mercado de divisas funciona 24 horas, así que el precio al
    terminar un día es prácticamente el de la apertura del día siguiente.
    Usamos eso como cierre. La última vela se descarta (no tiene día siguiente).
    """
    rebuilt = []
    for candle, next_candle in zip(candles, candles[1:]):
        fixed = dict(candle)
        fixed["c"] = next_candle["o"]
        # El máximo y el mínimo deben abarcar también el nuevo cierre
        fixed["h"] = max(fixed["h"], fixed["o"], fixed["c"])
        fixed["l"] = min(fixed["l"], fixed["o"], fixed["c"])
        rebuilt.append(fixed)
    return rebuilt


# ---------------------------------------------------------------------------
# Programa principal
# ---------------------------------------------------------------------------

def main():
    DATA_DIR.mkdir(exist_ok=True)
    index = []

    for asset in ASSETS:
        print(f"Descargando {asset['name']} ({asset['symbol']})...")

        if asset["source"] == "binance":
            raw = download_binance(asset["symbol"])
        else:
            raw = download_yahoo(asset["symbol"])

        candles, removed = clean_candles(raw)
        if asset["market"] == "forex":
            candles = rebuild_forex_closes(candles)
        if not candles:
            print("  ¡No se ha descargado ninguna vela! Se salta este activo.")
            continue

        first, last = candles[0]["t"], candles[-1]["t"]
        years = (datetime.fromisoformat(last) - datetime.fromisoformat(first)).days / 365.25
        print(f"  {len(candles)} velas, de {first} a {last} ({years:.1f} años)."
              f" Velas eliminadas en la limpieza: {removed}")
        if years < MIN_YEARS:
            print(f"  AVISO: menos de {MIN_YEARS} años de datos.")

        # Control de calidad: movimientos diarios sospechosamente grandes
        for previous, candle in zip(candles, candles[1:]):
            move = candle["c"] / previous["c"] - 1
            if abs(move) > SUSPICIOUS_DAILY_MOVE:
                print(f"  AVISO: {move:+.0%} el {candle['t']} (¿error en los datos?)")

        # Guardar el archivo del activo con el formato del CLAUDE.md
        output = {
            "ticker": asset["ticker"],
            "name": asset["name"],
            "market": asset["market"],
            "interval": "1d",
            "candles": candles,
        }
        path = DATA_DIR / f"{asset['ticker']}.json"
        # separators sin espacios = archivo más pequeño
        path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")

        index.append({
            "ticker": asset["ticker"],
            "name": asset["name"],
            "market": asset["market"],
            "file": path.name,
            "count": len(candles),
            "first": first,
            "last": last,
        })

    # Lista de activos disponibles, para que la web sepa qué archivos cargar
    index_path = DATA_DIR / "index.json"
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2),
                          encoding="utf-8")
    print(f"Listo. {len(index)} activos guardados en {DATA_DIR}")

    # Contexto macroeconómico que se muestra tras cada ronda
    for fred in FRED_SERIES:
        download_fred_series(fred["series"], fred["file"], fred["name"])


if __name__ == "__main__":
    main()
