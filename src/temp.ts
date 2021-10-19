import HLifeCyclePlugin from '@/MobileSureillance/package/plugins/base/lifecycle.plugin';
import { HPluginOption } from '@/MobileSureillance/types';
import { isMobile } from '@/MobileSureillance/package/utils/cs';
import BaseLayer from 'ol/layer/Base';
import {
  IGPSInfo,
  IRecordInfo
} from '@/MobileSureillance/package/types/marker.platform';
import { Feature } from 'ol';
import { LineString, Point } from 'ol/geom';
import Overlay from 'ol/Overlay';
import CarMarker from '@/MobileSureillance/package/marker/platform/car.marker';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Circle, Fill, Icon } from 'ol/style';
import { Coordinate } from 'ol/coordinate';
import { formatSpeed } from '@/MobileSureillance/package/utils/map';
import Select from 'ol/interaction/Select';
import { click, pointerMove } from 'ol/events/condition';
import { fromLonLat } from 'ol/proj';
import * as olExtent from 'ol/extent';
import TileLayer from 'ol/layer/Tile';
import { HLayers } from '@/MobileSureillance/package/enum/layer.enum';
import OverlayPositioning from 'ol/OverlayPositioning';
import { EventTypeMap } from '@/MobileSureillance/package/types/recordtype';
import _ from 'lodash';
import DragPan from 'ol/interaction/DragPan';

export type PlaybackData = {
  data: {
    GPSinfo: IGPSInfo[];
    RecordInfo: IRecordInfo[];
  };
};

// export const INTERVAL = 10 * 1000; // 时间间隔
let INTERVAL: number[]; // 时间间隔数组，处理非等间隔的时间格式. 间隔单位ms
let prev = Date.now(); // 限定帧率的动画，需要判断两帧之间的Interval, 尝试解决移动端帧率未知原因的增高

export class PlaybackPlugin extends HLifeCyclePlugin {
  static pluginName: string = 'PlaybackPlugin';
  private hideLayers: BaseLayer[] = [];
  private car: CarMarker;
  private isPlaying = false;
  private fullPathLayer: VectorLayer; // 全量路径的图层
  private animationLayer: VectorLayer; // 线的动画图层
  private overspeed: boolean[]; // 每一段轨迹的超速情况
  private speedThreshold = 80; // 超速阈值
  private gpsInfo: IGPSInfo[];
  private trackCar = true; // 汽车跟踪 居中显示
  private fullTime; // 全程的动画时长 ms
  private startTime = 0; // 开始时长
  private step = 16.7; // RAF时间间隔
  private speed = 1.0; // 倍速
  private redLines: (Feature<LineString> | null)[] = []; // 所有的红线
  private greenLine: Feature<LineString>; // 唯一的一条绿色线
  private lineCoords: Coordinate[]; // 线的坐标
  private records: { type: number; coord: Coordinate }[]; // 事件
  private speedOverLay: Overlay;
  private carOverlay: Overlay;
  private hoverOverlay: Overlay;
  private _select: Select;
  private _hoverSelect: Select;
  private deferFuncs: (() => void)[];

  get pluginName() {
    return PlaybackPlugin.pluginName;
  }

  constructor(options: Omit<HPluginOption, 'data'> & PlaybackData) {
    super(options);
    try {
      this.gpsInfo = options.data.GPSinfo;
      this.lineCoords = this.gpsInfo.map(item => {
        const { Longitude, Latitude } = item;
        return [+Longitude, +Latitude];
      });
      this.speedThreshold = this.gpsInfo?.[0]?.SpeedLimit || Infinity;
      this.overspeed = this.gpsInfo.map(item => {
        const { RawSpeed: Speed } = item;
        return Speed > this.speedThreshold;
      });
      this.records =
        options.data.RecordInfo?.map(rec => {
          return {
            type: rec.RecordType,
            coord: [+rec.Longitude, +rec.Latitude]
          };
        }) || [];
    } catch (e) {
      // window.console.error('Reverse Not Match!!', e.message);
    }
  }

  /*  protected onInstall() {
      super.onInstall();
      this.start();
    }*/
  private onMapZoomend(): () => void {
    let callback = () => {
      if (this.trackCar) {
        const view = this.map.olMap.getView();
        view.setCenter(this.car.feature.getGeometry().getCoordinates());
      }
    };
    this.map.olMap.on('moveend', callback);
    return () => {
      this.map.olMap.un('moveend', callback);
      callback = null;
    };
  }

  protected onStart() {
    super.onStart();
    this.hideOtherLayers();
    if (this.gpsInfo.length) {
      this.initLayers();
      !isMobile() && this.initSelect();
      this.initMarker();
      this.initRecordMarker();
      this.initPath();
      this.initAnimationLine();
      this.fitView();
      this.deferFuncs = [this.onMapZoomend()];
      // 接收信号开始播放
      // this.isPlaying = true;
    }
  }

  protected onStop() {
    super.onStop();
    if (this.gpsInfo.length) {
      this.stopAnimation();
      this.removeLayers();
      !isMobile() && this.removeSelect();
    }
    this.showHiddenLayers();
    this.setMapDragControl(true);
    if (Array.isArray(this.deferFuncs)) {
      this.deferFuncs.forEach(fn => fn());
      this.deferFuncs.length = 0;
    }
  }

  protected onUnInstall() {
    super.onUnInstall();
    this.stop();
  }

  private hideOtherLayers() {
    this.hideLayers = this.map.olMap
      .getLayers()
      .getArray()
      .filter(layer => !(layer instanceof TileLayer) && ![HLayers.FENCE, HLayers.DEVIATION].includes(layer.get('name')))
    this.hideLayers.forEach(layer => {
      layer.setVisible(false);
    });
  }

  private initLayers() {
    this.fullPathLayer = new VectorLayer({
      source: new VectorSource()
    });
    this.animationLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 10
    });
    this.map.olMap.addLayer(this.fullPathLayer);
    this.map.olMap.addLayer(this.animationLayer);
  }

  private initSelect() {
    this._select = new Select({
      condition(mapBrowserEvent) {
        return click(mapBrowserEvent);
      },
      layers: [this.animationLayer],
      style: null
    });
    this._select.on('select', e => {
      const n = e.target.getFeatures().getLength();
      if (n) {
        const [feature] = e.target.getFeatures().getArray();
        // 你点的是个小车车
        if (feature.get('instance')) {
          if (!this.carOverlay) {
            this.carOverlay = this.car.onClick(false);
          }
          this.map.olMap.addOverlay(this.carOverlay);
          this.carOverlay.setPosition(fromLonLat(this.car.coordinate));
          this.hideOverLay();
        }
      }
    });
    this._hoverSelect = new Select({
      layers: [this.animationLayer],
      condition(mapBrowserEvent) {
        return pointerMove(mapBrowserEvent);
      },
      style: null
    });
    this._hoverSelect.on('select', e => {
      const n = e.target.getFeatures().getLength();
      if (n) {
        const [feature] = e.target.getFeatures().getArray();
        // 你hover的是一个事件
        if (feature.get('recordType')) {
          if (this.hoverOverlay)
            this.map.olMap.removeOverlay(this.hoverOverlay);
          this.hoverOverlay = this.createOverLay(
            EventTypeMap[feature.get('recordType')]
          );
          this.hoverOverlay.setPosition(e.mapBrowserEvent.coordinate);
          this.map.olMap.addOverlay(this.hoverOverlay);
        }
      } else {
        this.map.olMap.removeOverlay(this.hoverOverlay);
        this.hoverOverlay = null;
      }
    });
    this.map.olMap.addInteraction(this._select);
    this.map.olMap.addInteraction(this._hoverSelect);
    this.map.olMap.on('click', this.mapClick);
  }

  private mapClick = () => {
    this.hideOverLay(HLayers.CAR_OVERLAY);
    this.speedOverLay && this.map.olMap.addOverlay(this.speedOverLay);
    this._select.getFeatures().clear();
  };

  private hideOverLay(type?: HLayers.CAR_OVERLAY) {
    if (!type) {
      this.speedOverLay && this.map.olMap.removeOverlay(this.speedOverLay);
    } else {
      this.carOverlay && this.map.olMap.removeOverlay(this.carOverlay);
    }
  }

  private removeSelect() {
    this.map.olMap.removeInteraction(this._select);
    this.map.olMap.removeInteraction(this._hoverSelect);
    this._select = null;
    this._hoverSelect = null;
    this.map.olMap.un('click', this.mapClick);
    if (this.hoverOverlay) this.map.olMap.removeOverlay(this.hoverOverlay);
    this.map.olMap.removeOverlay(this.carOverlay);
    this.map.olMap.removeOverlay(this.speedOverLay);
    this.carOverlay = null;
    this.speedOverLay = null;
  }

  private initMarker() {
    this.car = new CarMarker({
      GpsInfo: {
        ...this.gpsInfo[0]
      }
    });
    const startMarker = new Feature(new Point(fromLonLat(this.lineCoords[0])));
    startMarker.setStyle(
      new Style({
        image: new Circle({
          radius: 7,
          fill: new Fill({
            color: '#2ba9f3'
          }),
          stroke: new Stroke({
            width: 1.5,
            color: '#fff'
          })
        }),
        zIndex: 3
      })
    );
    // 终点的marker
    const endMarker = new Feature(
      new Point(fromLonLat(this.lineCoords[this.lineCoords.length - 1]))
    );
    endMarker.setStyle(
      new Style({
        image: new Icon({
          src: require('../../../../assets/images/map_route_end.svg'),
          imgSize: [20, 55]
        }),
        zIndex: 3
      })
    );
    this.animationLayer.getSource().addFeature(this.car.feature);
    this.animationLayer.getSource().addFeature(startMarker);
    this.animationLayer.getSource().addFeature(endMarker);
    if (!isMobile()) {
      this.speedOverLay = this.createOverLay();
      this.map.olMap.addOverlay(this.speedOverLay);
    }
  }

  private calcInterval = () => {
    const n = this.gpsInfo.length;
    INTERVAL = new Array(n - 1);
    for (let i = 1; i < n; i++) {
      const start = new Date(this.gpsInfo[i - 1].OccurTime).getTime();
      const end = new Date(this.gpsInfo[i].OccurTime).getTime();
      INTERVAL[i - 1] = end - start;
    }
  };

  private initPath() {
    this.calcInterval();
    this.fullTime = INTERVAL.reduce(
      (previousValue, currentValue) => currentValue + previousValue,
      0
    );
    // this.fullTime = (this.lineCoords.length - 1) * INTERVAL;
    // let prevState = this.overspeed[0];
    const fastLine = new Feature<LineString>({
      geometry: new LineString([this.lineCoords[0]]).transform(
        'EPSG:4326',
        'EPSG:3857'
      )
    });
    fastLine.setStyle(PlaybackPlugin.genLineStyle(false, true));
    this.fullPathLayer.getSource().addFeature(fastLine);

    /* for (let i = 0; i < this.overspeed.length; i++) {
       const coordinates = fastLine.getGeometry().getCoordinates();
       coordinates.push(fromLonLat(this.lineCoords[i]));
       fastLine.getGeometry().setCoordinates(coordinates);
       // 如果超速状态改变
       if (prevState !== this.overspeed[i]) {
         fastLine = new Feature<LineString>({
           geometry: new LineString([this.lineCoords[i]]).transform(
             'EPSG:4326',
             'EPSG:3857'
           )
         });
         fastLine.setStyle(PlaybackPlugin.genLineStyle(this.overspeed[i], true));
         this.fullPathLayer.getSource().addFeature(fastLine);
       }
       prevState = this.overspeed[i];
     }*/
    const coordinates = fastLine.getGeometry().getCoordinates();
    for (let i = 0, n = this.lineCoords.length; i < n; i++) {
      coordinates.push(fromLonLat(this.lineCoords[i]));
    }
    fastLine.getGeometry().setCoordinates(coordinates);
  }

  private initAnimationLine = () => {
    this.greenLine = new Feature<LineString>({
      geometry: new LineString([fromLonLat(this.lineCoords[0])])
    });
    this.greenLine.setStyle(PlaybackPlugin.genLineStyle(false, false));
    this.animationLayer.getSource().addFeature(this.greenLine);
  };

  // 渲染所有事件的Marker
  private initRecordMarker() {
    for (const record of this.records) {
      const recordMarker = new Feature(new Point(fromLonLat(record.coord)));
      recordMarker.setStyle(
        new Style({
          image: new Icon({
            src: require('../../../../assets/images/map_event_point.png'),
            imgSize: [24, 50]
          }),
          zIndex: 5
        })
      );
      recordMarker.set('recordType', record.type);
      this.animationLayer.getSource().addFeature(recordMarker);
    }
  }

  private createOverLay(text?: string) {
    const container = document.createElement('div');
    container.setAttribute('id', 'popup');
    container.className = 'ol-popup';
    const content = document.createElement('div');
    content.setAttribute('id', 'popup-content');
    content.innerText = text
      ? text
      : formatSpeed(this.gpsInfo[0].RawSpeed, this.gpsInfo[0].SpeedUnit);
    container.appendChild(content);
    !isMobile()
      ? document.querySelector('#ms-map-monitor').appendChild(container)
      : document.querySelector('#mobile-map').appendChild(container);
    return new Overlay({
      element: container,
      positioning: OverlayPositioning.BOTTOM_CENTER,
      offset: [0, -15],
      stopEvent: false
    });
  }

  private setSpeedThreshold = (newVal: number) => {
    this.speedThreshold = newVal;
    this.overspeed = this.gpsInfo.map(item => {
      const { RawSpeed: Speed } = item;
      return Speed > this.speedThreshold;
    });
    this.fullPathLayer.getSource().clear();
    this.initPath();
    this.clearRedLines();
    this.calcCoordinate(0);
    this.calcCoordinate(this.startTime);
  };

  private clearRedLines = () => {
    this.redLines.filter(Boolean).forEach(line => {
      this.animationLayer.getSource().removeFeature(line);
    });
    this.redLines.length = 0;
  };

  private fitView() {
    const view = this.map.olMap.getView();
    view.setZoom(17);
  }

  private fitViewOnCar() {
    if (!this.car) return;
    const view = this.map.olMap.getView();
    // view.setCenter(this.car.feature.getGeometry().getCoordinates());
    view.animate({
      center: this.car.feature.getGeometry().getCoordinates(),
      duration: 0
    });
  }

  public static genLineStyle(overspeed: boolean, isFullPath: boolean) {
    const playPath: Record<string, string> = {
      0: '#0dc86e', // 正常路径
      1: '#ff4538' // 超速路径
    };
    const fullPath: Record<string, string> = {
      0: '#9fe9c5', // 正常路径
      1: '#ffb5b0' // 超速路径
    };
    const index = +overspeed + '';
    return new Style({
      stroke: new Stroke({
        color: isFullPath ? fullPath[index] : playPath[index],
        width: 10,
        lineCap: 'round',
        lineJoin: 'round'
      }),
      zIndex: overspeed ? 2 : 1
    });
  }

  private showHiddenLayers() {
    this.hideLayers.forEach(layer => {
      layer.setVisible(true);
    });
  }

  private setTimeDirectly = (newVal: number) => {
    this.startTime = newVal;
    this.calcCoordinate(this.startTime);
  };
  private _startAnimation = () => {
    // if (isMobile()) {
    //   mobileClientAPI.onVehicleTrackProgress({
    //     CurTime: this.startTime,
    //     ID: this.car.id,
    //     FullTime: this.fullTime
    //   });
    // }
    if (!isMobile()) {
      this.calcCoordinate(this.startTime);
      this.startTime += this.step * this.speed;
    } else {
      const now = Date.now();
      const delta = now - prev;
      if (delta > this.step) {
        this.calcCoordinate(this.startTime);
        this.startTime += this.step * this.speed;
        prev = now;
      }
    }
    if (this.startTime <= this.fullTime && this.isPlaying) {
      requestAnimationFrame(this._startAnimation);
    }
    /*const timer = setInterval(() => {
      this.calcCoordinate(this.startTime);
      this.trackCar && this.fitViewOnCar();
      this.frame++;
      this.startTime += this.step * this.speed;
      if (!(this.startTime <= this.fullTime && this.isPlaying)) {
        clearInterval(timer);
      }
    }, 16);*/
  };

  public startAnimation = () => {
    if (!this.lineCoords?.length) return;
    this.isPlaying = true;
    this._startAnimation();
  };

  public stopAnimation() {
    this.isPlaying = false;
  }

  private calcIndex = (time: number) => {
    let i = 0;
    let sum = 0;
    const n = INTERVAL.length;
    while (i < n && sum < time) {
      if (sum + INTERVAL[i] > time) break;
      sum += INTERVAL[i++];
    }
    return [i, sum] as const;
  };

  private calcCoordinate(time: number) {
    // const index = Math.floor(time / INTERVAL);
    const [index, playedTime] = this.calcIndex(time);
    if (index < this.lineCoords.length - 1) {
      if (this.car.speed !== this.gpsInfo[index].RawSpeed) {
        this.car.speed = this.gpsInfo[index].RawSpeed;
        if (this.speedOverLay) {
          this.speedOverLay
            .getElement()
            .querySelector('#popup-content').innerHTML = formatSpeed(
            this.car.speed,
            this.gpsInfo[index].SpeedUnit || 0
          );
        }
      }
      this.car.setAttr(this.gpsInfo[index]);
      const startCoordinate = this.lineCoords[index];
      const targetCoordinate = this.lineCoords[index + 1];
      const deltaTime = time - playedTime; // 这一段轨迹的目前进行到的时长
      // const deltaTime = time - index * INTERVAL; // 这一段轨迹的目前进行到的时长
      const curX =
        startCoordinate[0] +
        ((targetCoordinate[0] - startCoordinate[0]) * deltaTime) /
        INTERVAL[index]; // 目前时长对应的位置
      const curY =
        startCoordinate[1] +
        ((targetCoordinate[1] - startCoordinate[1]) * deltaTime) /
        INTERVAL[index];
      const newCoordinate = fromLonLat([curX, curY]);
      this.car.setCoordinate([curX, curY]);
      this.trackCar && this.fitViewOnCar();
      this.car.direction = this.gpsInfo[index].Direction;
      this.speedOverLay && this.speedOverLay.setPosition(newCoordinate);
      this.carOverlay && this.carOverlay.setPosition(newCoordinate);
      this.setLine(index, newCoordinate);
    }
  }

  private setLine(index: number, curCoordinate: Coordinate) {
    const routePath: Coordinate[] = [];
    for (let i = 0; i <= index; i++) {
      routePath.push(fromLonLat(this.lineCoords[i]));
    }
    routePath.push(curCoordinate);
    this.greenLine.getGeometry().setCoordinates(routePath);
    // 红线逻辑
    if (this.redLines.length - 1 >= index) {
      // 已经画过的部分
      for (let i = index + 1; i < this.redLines.length; i++) {
        this.redLines[i] &&
        this.animationLayer
          .getSource()
          .removeFeature(this.redLines[i] as Feature<LineString>);
      }
      this.redLines = this.redLines.slice(0, index + 1);
      const redLinePath = [fromLonLat(this.lineCoords[index]), curCoordinate];
      this.redLines[this.redLines.length - 1] &&
      (this.redLines[this.redLines.length - 1] as Feature<LineString>)
        .getGeometry()
        .setCoordinates(redLinePath);
    } else {
      // index指向的line还没画过
      // 先补完当前线
      const n = this.redLines.length;
      const curLine = this.redLines[n - 1];
      if (curLine) {
        curLine
          .getGeometry()
          .setCoordinates([
            fromLonLat(this.lineCoords[n - 1]),
            fromLonLat(this.lineCoords[n])
          ]);
      }
      // 补后续的红线
      for (let i = n; i <= index; i++) {
        if (this.overspeed[i]) {
          const redLine = new Feature<LineString>({
            geometry: new LineString([fromLonLat(this.lineCoords[i])])
          });
          redLine.setStyle(PlaybackPlugin.genLineStyle(true, false));
          this.redLines.push(redLine);
          this.animationLayer.getSource().addFeature(redLine);
          const curPath = [fromLonLat(this.lineCoords[i])];
          curPath.push(
            i === index ? curCoordinate : fromLonLat(this.lineCoords[i + 1])
          );
          redLine.getGeometry().setCoordinates(curPath);
        } else {
          this.redLines.push(null);
        }
      }
    }
  }

  private removeLayers() {
    this.map.olMap.removeLayer(this.fullPathLayer);
    this.map.olMap.removeLayer(this.animationLayer);
    this.fullPathLayer = null;
    this.animationLayer = null;
  }

  private setSpeed = (newVal: number) => {
    this.speed = newVal;
  };

  private setTrackCar = (newVal: boolean) => {
    this.trackCar = newVal;
    this.setMapDragControl(!this.trackCar);
    if (this.trackCar) {
      setTimeout(() => this.fitViewOnCar(), 100);
    }
  };

  private setMapDragControl(flag: boolean) {
    const [drag] = this.map.olMap
      .getInteractions()
      .getArray()
      .filter(interaction => interaction instanceof DragPan);
    if (drag) {
      (drag as DragPan).setActive(flag);
    }
  }

  /**
   * 时间跳转 , newVal是时间轴的日期时间 毫秒数
   * @param newVal
   */
  private setTime = (newVal: number) => {
    let res = newVal - new Date(this.gpsInfo[0].OccurTime).getTime();
    res = Math.min(res, this.fullTime);
    res = Math.max(res, 0);
    this.startTime = res;
    this.calcCoordinate(this.startTime);
  };
  private getTime = () => {
    return this.startTime;
  };
  private getCar = () => {
    return this.car;
  };
  private getGPS = () => {
    return this.gpsInfo;
  };
  private getFullTime = () => {
    return this.fullTime;
  };

  protected getPublicApi() {
    return {
      start: this.onStart.bind(this),
      startAnimation: this.startAnimation,
      stopAnimation: this.stopAnimation.bind(this),
      setSpeed: this.setSpeed,
      setSpeedThreshold: this.setSpeedThreshold,
      setTrackCar: this.setTrackCar,
      setCurrentTime: this.setTime,
      getCurrentTime: this.getTime,
      getFullTime: this.getFullTime,
      getCar: this.getCar,
      setTimeDirectly: this.setTimeDirectly,
      getGPS: this.getGPS
    };
  }
}
