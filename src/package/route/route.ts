import { INTERVAL } from './../../config/index';
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
  private _playedTime = 0 // 当前播放进度(毫秒数)

  // 所有的轨迹信息
  private get coords() {
    return this.gpsInfo.map(item => fromLonLat(item.coordinate))
  }

  // 总时长(毫秒)
  private get totalTime() {
    return this.gpsInfo[this.gpsInfo.length - 1].time * 1000
  }

  public get playedTime() {
    return this._playedTime
  }
  public set playedTime(newVal) {
    this._playedTime = newVal
    this.calcCoordinate(this._playedTime)
  }

  // 每一段是否超速组成的数组
  private get overSpeedArr() {
    return this.gpsInfo.map(item => !!item.overSpeed)
  }

  constructor(olMap: Map, gpsInfo: GPSInfo[]) {
    this.olMap = olMap
    this.gpsInfo = gpsInfo.map(info => ({ ...info, time: info.time * 1000 }))
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
    const line = new LineString(this.coords);
    const fullPath = new Feature(line);
    fullPath.setStyle(new Style({
      stroke: new Stroke({
        color: 'rgba(88, 207, 126,.5)',
        width: 8,
      }),
      zIndex: 0
    }))
    this.olMap.getView().fit(line.getExtent(),{
      padding: [50,50,50,50]
    });
    this.lineLayer.getSource().addFeature(fullPath)
  }
  /**
   * 初始化车
   */
  private initCar() {
    const car = new Feature(new Point(this.coords[0]));
    car.setStyle(RouteControl.genCarStyle())
    this.lineLayer.getSource().addFeature(car)
    return car
  }

  /**
   *
   * 以播放时间为参数，计算小车的坐标
   * @param {number} playTime
   */
  private calcCoordinate(playTime: number) {
    const [index, playedTime] = this.calcIndex(playTime)
    const sourceCoordinate = this.coords[index]
    const destCoordinate = this.coords[index + 1]
    const interval = this.gpsInfo[index + 1].time - this.gpsInfo[index].time
    const deltaTime = playTime - playedTime
    const currentCoordinate = RouteControl.calcCoordinateBetween(sourceCoordinate, destCoordinate, interval, deltaTime)
    this.carFeature.getGeometry()?.setCoordinates(currentCoordinate)
    const deg = RouteControl.calcDeg(sourceCoordinate, destCoordinate)
    this.carFeature.setStyle(RouteControl.genCarStyle(deg))
  }
  /**
   * 根据播放时间(毫秒)来计算所处的第几段轨迹
   */
  private calcIndex(playTime: number) {
    let index = 0
    while (index < this.gpsInfo.length && this.gpsInfo[index + 1].time < playTime) {
      index++
    }
    return [index, this.gpsInfo[index].time] as const
  }

  /**
   *
   * @param sourceCoordinate 起点坐标
   * @param destCoordinate 终点坐标
   * @param interval 总时长(两点时间差)
   * @param playedTime 当前时间点
   */
  private static calcCoordinateBetween(
    sourceCoordinate: Coordinate,
    destCoordinate: Coordinate,
    interval: number,
    playedTime: number) {
    const lon = sourceCoordinate[0] + (destCoordinate[0] - sourceCoordinate[0]) * playedTime / interval
    const lat = sourceCoordinate[1] + (destCoordinate[1] - sourceCoordinate[1]) * playedTime / interval
    return [lon, lat] as Coordinate
  }

  /**
   *
   * 生成小车的样式对象
   * @param {number} [deg]
   */
  private static genCarStyle(deg?: number) {
    return new Style({
      image: new Icon({
        src: carImg,
        rotateWithView: true,
        rotation: deg
      }),
      zIndex: 5
    })
  }

  /**
   *
   * 计算旋转角度
   * @param {Coordinate} coord1
   * @param {Coordinate} coord2
   * @return {*}
   */
  private static calcDeg(coord1: Coordinate, coord2: Coordinate) {
    const dy = coord2[1] - coord1[1]
    const dx = coord2[0] - coord1[0]
    let radAngle = Math.atan(dy / dx)
    if (dy <= 0 && dx >= 0) {//第二象限
      console.log('第二象限');
      radAngle = -radAngle;
    } else if (dx >= 0 && dy >= 0) {//第一象限
      radAngle = -radAngle;
      console.log('第一象限');
    } else if (dx <= 0 && dy >= 0) {//第四象限
      radAngle = Math.PI - radAngle;
      console.log('第四象限');
    } else if (dx <= 0 && dy <= 0) {//第三象限
      radAngle = Math.PI - radAngle;
      console.log('第三象限');
    }
    return radAngle;
  }
}