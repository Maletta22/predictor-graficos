"""
Servidor web local para probar el juego en tu ordenador.

Uso, desde la carpeta del proyecto:
    .venv\\Scripts\\python.exe scripts\\serve.py
y abre http://127.0.0.1:8000 en el navegador.

¿Por qué no usar directamente "python -m http.server"? En este ordenador, ese
servidor envía cada archivo de golpe (hasta 1 MB por escritura) y la conexión
se atasca a menudo a mitad de la descarga. Este servidor es el mismo, pero
envía los archivos en trozos de 64 KB, y así funciona siempre.
"""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"  # solo accesible desde este ordenador
PORT = 8000
CHUNK_SIZE = 64 * 1024  # 64 KB por escritura

# La carpeta del proyecto (la que está por encima de scripts/)
PROJECT_DIR = Path(__file__).resolve().parent.parent


class ChunkedHandler(SimpleHTTPRequestHandler):
    """Igual que el servidor normal de Python, pero envía en trozos pequeños."""

    def copyfile(self, source, outputfile):
        while True:
            chunk = source.read(CHUNK_SIZE)
            if not chunk:
                break
            outputfile.write(chunk)


def main():
    handler = partial(ChunkedHandler, directory=str(PROJECT_DIR))
    server = ThreadingHTTPServer((HOST, PORT), handler)
    print(f"Sirviendo {PROJECT_DIR} en http://{HOST}:{PORT}  (Ctrl+C para parar)")
    server.serve_forever()


if __name__ == "__main__":
    main()
