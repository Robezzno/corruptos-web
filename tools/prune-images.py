#!/usr/bin/env python3
"""Elimina de images/ las imagenes que ningun contenido del sitio referencia.

El publicador reescribe un mismo caso bajo slugs distintos y descarga una imagen
nueva en cada intento sin borrar la anterior, de modo que images/ crece sin limite
hasta llenar el disco del servidor. Este script recalcula que imagenes estan en uso
y retira el resto.

Nunca parte de una lista fija: vuelve a escanear el sitio en cada ejecucion, asi que
las imagenes de articulos nuevos quedan protegidas automaticamente.

Uso:
    python3 tools/prune-images.py            # muestra lo que haria, no borra
    python3 tools/prune-images.py --apply    # borra de verdad
"""
import argparse, json, os, re, sys

EXT = ('.jpg', '.jpeg', '.png', '.webp')
TEXTO = ('.json', '.html', '.js', '.xml', '.css', '.txt', '.md')
REF = re.compile(r'([\w\-.%]+\.(?:jpg|jpeg|png|webp))', re.I)


def referenciadas(raiz):
    """Todo nombre de imagen mencionado en cualquier fichero de texto del sitio."""
    vistas = set()
    for base, dirs, files in os.walk(raiz):
        dirs[:] = [d for d in dirs if d not in ('.git', 'images', 'node_modules')]
        for f in files:
            if not f.endswith(TEXTO):
                continue
            try:
                txt = open(os.path.join(base, f), encoding='utf-8', errors='ignore').read()
            except OSError:
                continue
            vistas |= {m.lower() for m in REF.findall(txt)}
    return vistas


def corruptas(dir_img):
    """Imagenes de 0 bytes o JPEG sin marcador final: escrituras cortadas por disco lleno."""
    malas = set()
    for f in os.listdir(dir_img):
        p = os.path.join(dir_img, f)
        try:
            if os.path.getsize(p) == 0:
                malas.add(f)
                continue
            with open(p, 'rb') as fh:
                cab = fh.read(3)
                fh.seek(-2, 2)
                if cab == b'\xff\xd8\xff' and fh.read(2) != b'\xff\xd9':
                    malas.add(f)
        except OSError:
            continue
    return malas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='borrar de verdad')
    ap.add_argument('--raiz', default='.', help='raiz del sitio')
    args = ap.parse_args()

    raiz = os.path.abspath(args.raiz)
    dir_img = os.path.join(raiz, 'images')
    indice = os.path.join(raiz, 'articles', 'index.json')

    if not os.path.isdir(dir_img) or not os.path.isfile(indice):
        sys.exit(f'error: {raiz} no parece la raiz del sitio (falta images/ o articles/index.json)')

    idx = json.load(open(indice, encoding='utf-8'))
    en_uso = referenciadas(raiz)
    todas = [f for f in os.listdir(dir_img) if f.lower().endswith(EXT)]
    sobran = sorted(f for f in todas if f.lower() not in en_uso)
    rotas = corruptas(dir_img)

    # SALVAGUARDA: ninguna imagen que un articulo del indice pida puede acabar en la lista.
    pedidas = {(a.get('image_url') or '').split('/')[-1].lower() for a in idx if a.get('image_url')}
    conflicto = {f for f in sobran if f.lower() in pedidas}
    if conflicto:
        sys.exit(f'ABORTADO: {len(conflicto)} imagenes estan en uso y aun asi salieron como sobrantes. '
                 f'Ejemplos: {sorted(conflicto)[:3]}')

    libera = sum(os.path.getsize(os.path.join(dir_img, f)) for f in sobran)
    print(f'articulos en el indice : {len(idx)}')
    print(f'imagenes en disco      : {len(todas)}')
    print(f'imagenes en uso        : {len(todas) - len(sobran)}')
    print(f'imagenes sin usar      : {len(sobran)}  ({libera / 1048576:.1f} MB)')
    print(f'  de ellas corruptas   : {len(rotas & set(sobran))}')

    # Una imagen corrupta que SI se usa no se puede podar: hay que regenerarla.
    rotas_en_uso = sorted(rotas & pedidas_files(dir_img, pedidas))
    if rotas_en_uso:
        print(f'\nAVISO: {len(rotas_en_uso)} imagenes EN USO estan corruptas y hay que regenerarlas:')
        for f in rotas_en_uso[:10]:
            print(f'   {f}')

    if not sobran:
        print('\nnada que podar.')
        return

    if not args.apply:
        print('\nsimulacion: no se ha borrado nada. Repite con --apply para aplicarlo.')
        return

    for f in sobran:
        os.remove(os.path.join(dir_img, f))
    print(f'\nborradas {len(sobran)} imagenes, {libera / 1048576:.1f} MB liberados.')
    print(f'quedan {len(os.listdir(dir_img))} imagenes.')


def pedidas_files(dir_img, pedidas):
    """Nombres reales en disco que corresponden a imagenes pedidas por el indice."""
    return {f for f in os.listdir(dir_img) if f.lower() in pedidas}


if __name__ == '__main__':
    main()
