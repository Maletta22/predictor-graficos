"""
Descarga velas diarias de varios activos y las guarda en la carpeta data/.

Se ejecuta a mano, desde la carpeta del proyecto:
    .venv\\Scripts\\python.exe scripts\\download_data.py

Para cada activo crea data/<ticker>.json con el formato del CLAUDE.md, y al
final crea data/index.json con la lista de activos disponibles y
data/fed_funds.json con el histórico de tipos de interés de la FED.
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
# Fase 1: solo 3 activos de prueba, uno de cada mercado.
ASSETS = [
    {"ticker": "BTCUSDT", "name": "Bitcoin / USD", "market": "crypto",
     "source": "binance", "symbol": "BTCUSDT"},
    {"ticker": "SPX", "name": "S&P 500", "market": "bolsa",
     "source": "yahoo", "symbol": "^GSPC"},
    {"ticker": "EURUSD", "name": "Euro / Dólar", "market": "forex",
     "source": "yahoo", "symbol": "EURUSD=X"},
]


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

# FEDFUNDS = tipo de interés efectivo de los fondos federales, media mensual.
# Es público y no necesita cuenta. Formato CSV: "observation_date,FEDFUNDS".
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS"


def download_fed_funds():
    """Descarga el histórico mensual de tipos de la FED y lo guarda en data/."""
    print("Descargando tipos de la FED (FRED, FEDFUNDS)...")
    response = requests.get(FRED_URL, timeout=30, verify=SSL_VERIFY)
    response.raise_for_status()

    values = []
    lines = response.text.strip().splitlines()
    for line in lines[1:]:  # la primera línea es la cabecera
        date, rate = line.split(",")
        if rate == ".":  # FRED usa "." para los meses sin dato
            continue
        values.append({"t": date, "v": float(rate)})

    output = {
        "series": "FEDFUNDS",
        "name": "Tipo de interés efectivo de la FED (media mensual, %)",
        "source": "https://fred.stlouisfed.org/series/FEDFUNDS",
        "values": values,
    }
    path = DATA_DIR / "fed_funds.json"
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
        if not candles:
            print("  ¡No se ha descargado ninguna vela! Se salta este activo.")
            continue

        first, last = candles[0]["t"], candles[-1]["t"]
        years = (datetime.fromisoformat(last) - datetime.fromisoformat(first)).days / 365.25
        print(f"  {len(candles)} velas, de {first} a {last} ({years:.1f} años)."
              f" Velas eliminadas en la limpieza: {removed}")
        if years < MIN_YEARS:
            print(f"  AVISO: menos de {MIN_YEARS} años de datos.")

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
    download_fed_funds()


if __name__ == "__main__":
    main()
