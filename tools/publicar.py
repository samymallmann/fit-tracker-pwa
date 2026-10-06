"""Publica o app no Firebase Hosting.

1. aumenta a versão (VERSAO_APP em app.js e CACHE em sw.js, juntas)
2. publica site + regras do Firestore
3. confere se o site está servindo a versão nova e se nada indevido vazou

Uso (na pasta do projeto):  python tools/publicar.py
Depois, no app: Perfil → Conta → Painel do admin → "Atualizar todos os aparelhos".
"""
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

# o terminal do Windows não mostra acentos/setas sem isso
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import json
# id do projeto: argumento (python tools/publicar.py meu-projeto) ou o "default" do .firebaserc
_rc = Path(__file__).resolve().parent.parent / '.firebaserc'
PROJETO = sys.argv[1] if len(sys.argv) > 1 else (json.loads(_rc.read_text())['projects']['default'] if _rc.exists() else sys.exit('Informe o id do projeto: python tools/publicar.py SEU-PROJETO'))
SITE = f'https://{PROJETO}.web.app'
raiz = Path(__file__).resolve().parent.parent

app, sw = raiz / 'app.js', raiz / 'sw.js'
txt_app, txt_sw = app.read_text(encoding='utf-8'), sw.read_text(encoding='utf-8')
atual = int(re.search(r"const CACHE = '[a-z]+-v(\d+)';", txt_sw).group(1))
nova = atual + 1
txt_sw = re.sub(r"(const CACHE = '[a-z]+-v)\d+(';)", rf"\g<1>{nova}\g<2>", txt_sw)
txt_app, n = re.subn(r"const VERSAO_APP = \d+;", f"const VERSAO_APP = {nova};", txt_app)
if n != 1:
    sys.exit('Não achei VERSAO_APP em app.js')
sw.write_text(txt_sw, encoding='utf-8')
app.write_text(txt_app, encoding='utf-8')
print(f'versão {atual} -> {nova}')

r = subprocess.run(f'npx --yes firebase-tools deploy --only hosting,firestore:rules --project {PROJETO}',
                   shell=True, cwd=raiz)
if r.returncode:
    sys.exit('Falhou ao publicar (a versão já foi aumentada nos arquivos; rode de novo).')


def status(caminho):
    try:
        with urllib.request.urlopen(urllib.request.Request(f'{SITE}/{caminho}', headers={'Cache-Control': 'no-cache'})) as resp:
            return resp.status, resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, ''


cod, corpo = status('sw.js')
servida = re.search(r"-v(\d+)'", corpo)
print('site servindo versão', servida.group(1) if servida else '?')
for proibido in ['.git/HEAD', '.firebaserc', 'tools/publicar.py', 'README.md']:
    cod, _ = status(proibido)
    print(f'  {proibido}: {cod}', '(ok)' if cod == 404 else '<<< ATENÇÃO: está público!')
print('\nPronto. No app: Perfil → Conta → Painel do admin → "Atualizar todos os aparelhos".')
