import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol, FetchSource, type Source } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';
import { fetchBin, B64 } from '../bin';

// Normally the basemap is read with HTTP range requests; hosts without range support (B64 builds) fetch it once in full.
class BasemapSource extends FetchSource { getKey() { return 'basemap'; } }
class WholeFileSource implements Source {
  url: string; buf: Promise<ArrayBuffer> | null = null;
  constructor(url: string) { this.url = url; }
  getKey() { return 'basemap'; }
  async getBytes(offset: number, length: number) {
    if (!this.buf) this.buf = fetchBin(this.url);
    const b = await this.buf;
    return { data: b.slice(offset, offset + length) };
  }
}
let registered = false;
export function registerPmtiles() {
  if (registered) return;
  const p = new Protocol();
  const url = new URL('/data/basemap.pmtiles', document.baseURI).href;
  p.add(new PMTiles(B64 ? new WholeFileSource(url) : new BasemapSource(url)));
  maplibregl.addProtocol('pmtiles', p.tile);
  // glyphs through fetchBin as well (font folders are named in lowercase with hyphens)
  maplibregl.addProtocol('glyphs', async (params: any) => {
    const m = params.url.match(/^glyphs:\/\/([^/]+)\/(.+)$/);
    const font = decodeURIComponent(m[1]).split(',')[0].trim().toLowerCase().replace(/ +/g, '-');
    const base = new URL('/', document.baseURI).href;
    return { data: await fetchBin(`${base}fonts/${font}/${m[2]}.pbf`) };
  });
  registered = true;
}

export function baseStyle(): StyleSpecification {
  const base = new URL('/', document.baseURI).href;
  const flavor = { ...namedFlavor('light') };
  return {
    version: 8,
    glyphs: 'glyphs://{fontstack}/{range}',
    sources: {
      protomaps: {
        type: 'vector', url: 'pmtiles://basemap',
        attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers('protomaps', flavor, { lang: 'en' }).filter(l => !(l as any).layout?.['icon-image']) as any,
  };
}
