import 'ol/ol.css';
import Map from 'ol/Map';
import TileLayer from 'ol/layer/Tile';
import View from 'ol/View';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';


export const createMap = (mapSelector: string) => {
  const map = new Map({
    layers: [
      new TileLayer({
        source: new OSM()
      })
    ],
    target: mapSelector,
    view: new View({
      center: fromLonLat([114.56, 30.66]),
      zoom: 13
    })
  })
  return map;
}