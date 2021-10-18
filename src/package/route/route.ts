import { Feature } from 'ol';
import { Coordinate } from 'ol/coordinate';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import Map from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import Icon from 'ol/style/Icon';


// 静态资源导入
import carImg from "../../assets/car.png";

/**
 * coordinate: 坐标点
 * time: 记录时间点
 * overspeed: 1|0 是否超速
 */
type GPSInfo = {
  coordinate: Coordinate;
  time: number;
  overSpeed: Boolean;
}

export class RouteControl {
  private olMap: Map
  private lineLayer: VectorLayer // 轨迹线的层
  private gpsInfo: GPSInfo[] // GPS数据
  private carFeature: Feature<Point> // 车
  private _isPlaying = false  // 是否正在播放
  private _playedTime = 0 // 当前播放进度(毫秒数)

  // 所有的轨迹信息
  private get coords() {
    return this.gpsInfo.map(item => fromLonLat(item.coordinate))
  }

  // 总时长(毫秒)
  private get totalTime() {
    return this.gpsInfo[this.gpsInfo.length - 1].time * 1000
  }

  // 每一段是否超速组成的数组
  private get overSpeedArr() {
    return this.gpsInfo.map(item => !!item.overSpeed)
  }

  constructor(olMap: Map, gpsInfo: GPSInfo[]) {
    this.olMap = olMap
    this.gpsInfo = gpsInfo
    this.lineLayer = this.initLayer()
    this.initFullPath()
    this.carFeature = this.initCar()
  }
  /**
   * 初始化图层
   */
  private initLayer() {
    const lineLayer = new VectorLayer({
      source: new VectorSource<LineString>()
    })
    this.olMap.addLayer(lineLayer)
    return lineLayer
  }
  /**
   * 全量的路径图
   */
  private initFullPath() {
    const fullPath = new Feature(new LineString(this.coords));
    fullPath.setStyle(new Style({
      stroke: new Stroke({
        color: 'rgba(88, 207, 126,.5)',
        width: 8,
      }),
      zIndex: 0
    }))
    this.lineLayer.getSource().addFeature(fullPath)
  }
  /**
   * 初始化车
   */
  private initCar() {
    const car = new Feature(new Point(this.coords[0]));
    car.setStyle(new Style({
      image: new Icon({
        src: carImg,
        rotateWithView: true
      }),
      zIndex: 5
    }))
    this.lineLayer.getSource().addFeature(car)
    return car
  }
}