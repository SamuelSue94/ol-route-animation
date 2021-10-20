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
  overSpeed: number;
}

export class RouteControl {
  private olMap: Map
  private lineLayer: VectorLayer // 轨迹线的层
  private gpsInfo: GPSInfo[] // GPS数据
  private carFeature: Feature<Point> // 车
  private _playedTime = 0 // 当前播放进度(毫秒数)
  private greenLine: Feature<LineString> = new Feature(new LineString([]));
  private redLines: (Feature<LineString>|null)[] = []; // 存放红线的数组

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
    })
    this.lineLayer.getSource().addFeature(fullPath)
    this.greenLine.setStyle(RouteControl.genLineStyle(false))
    this.lineLayer.getSource().addFeature(this.greenLine)
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
    this.setLine(index,currentCoordinate)
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

  private setLine(index: number, curCoordinate: Coordinate) {
    const routePath: Coordinate[] = [];
    for (let i = 0; i <= index; i++) {
      routePath.push((this.coords[i]));
    }
    routePath.push(curCoordinate);
    this.greenLine.getGeometry()!.setCoordinates(routePath);
    // 红线部分
    if (this.redLines.length - 1 >= index) {
      // 已经画过的部分
      for (let i = index + 1; i < this.redLines.length; i++) {
        this.redLines[i] &&
        this.lineLayer
          .getSource()
          .removeFeature(this.redLines[i] as Feature<LineString>);
      }
      this.redLines = this.redLines.slice(0, index + 1);
      const redLinePath = [this.coords[index], curCoordinate];
      this.redLines[this.redLines.length - 1] &&
      (this.redLines[this.redLines.length - 1] as Feature<LineString>)
        .getGeometry()!
        .setCoordinates(redLinePath);
    } else {
      // index指向的line还没画过
      // 先补完当前线
      const n = this.redLines.length;
      const curLine = this.redLines[n - 1];
      if (curLine) {
        curLine
          .getGeometry()!
          .setCoordinates([
            this.coords[n - 1],
            this.coords[n]
          ]);
      }
      // 补后续的红线
      for (let i = n; i <= index; i++) {
        if (this.overSpeedArr[i]) {
          const redLine = new Feature<LineString>({
            geometry: new LineString([this.coords[i]])
          });
          redLine.setStyle(RouteControl.genLineStyle(true));
          this.redLines.push(redLine);
          this.lineLayer.getSource().addFeature(redLine);
          const curPath = [this.coords[i]];
          curPath.push(
            i === index ? curCoordinate : (this.coords[i + 1])
          );
          redLine.getGeometry()!.setCoordinates(curPath);
        } else {
          this.redLines.push(null);
        }
      }
    }
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
   * 根据是否超速，返回线的样式
   * @param {boolean} [isOverspeed]
   */
  private static genLineStyle(isOverspeed?: boolean) {
    return new Style({
      stroke: new Stroke({
        color: isOverspeed ? '#ff4538':'#0dc86e',
        width: 10,
        lineCap: 'round',
        lineJoin: 'round'
      }),
      zIndex: isOverspeed ? 3 : 2
    });
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
