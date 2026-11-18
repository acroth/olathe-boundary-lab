import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = f"{ROOT}/raw"
DATA = f"{ROOT}/data"
WORK = f"{ROOT}/work"
OUT = os.path.join(os.path.dirname(ROOT), 'app', 'public', 'data')
CRS = 3419  # Kansas North state plane, US feet
os.makedirs(WORK, exist_ok=True); os.makedirs(OUT, exist_ok=True)
