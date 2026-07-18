import webview from '@ohos.web.webview';
import { AlertMapLocation } from '../data/Types';
import { TIAN_DI_TU_BROWSER_KEY } from '../data/MapConfig';

const MAP_COLOR_MUTED: string = '#5B6670';
const MAP_BROWSER_USER_AGENT: string =
  'Mozilla/5.0 (Linux; HarmonyOS 5.0; Mobile) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/114.0 Mobile Safari/537.36';

@Component
export struct AlertMapView {
  @Prop @Watch('onLocationChanged') location: AlertMapLocation;
  onRelocate: () => void = () => {};
  @State private pageReady: boolean = false;
  @State private mapError: string = '';
  private controller: webview.WebviewController = new webview.WebviewController();
  private webReady: boolean = false;

  private focusScript(): string {
    const zoom = this.location.source === 'demo' ? 12 : 14;
    return `window.focusAlert(${this.location.latitude}, ${this.location.longitude}, ${zoom});`;
  }

  private initialiseScript(): string {
    return `window.configureTianDiTu('${TIAN_DI_TU_BROWSER_KEY}');${this.focusScript()}`;
  }

  private refreshScript(): string {
    const zoom = this.location.source === 'demo' ? 12 : 14;
    return `window.refreshAlertMap(${this.location.latitude}, ${this.location.longitude}, ${zoom});`;
  }

  private initialiseMap(): void {
    this.controller.runJavaScript(this.initialiseScript())
      .then(() => {
        this.mapError = '';
      })
      .catch(() => {
        this.mapError = '地图资源暂时不可用';
      });
  }

  private runMapScript(script: string): void {
    if (!this.webReady) return;
    this.controller.runJavaScript(script)
      .then(() => {
        this.mapError = '';
      })
      .catch(() => {
        this.mapError = '地图资源暂时不可用';
      });
  }

  private focusAlert(): void {
    this.runMapScript(this.focusScript());
  }

  private refreshAlert(): void {
    this.runMapScript(this.refreshScript());
  }

  private onLocationChanged(): void {
    this.focusAlert();
  }

  build() {
    Stack({ alignContent: Alignment.TopEnd }) {
      Web({
        src: $rawfile('alert_map.html'),
        controller: this.controller
      })
        .width('100%')
        .height('100%')
        .userAgent(MAP_BROWSER_USER_AGENT)
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .onlineImageAccess(true)
        .onTitleReceive((event) => {
          if (event.title === 'map-ready' || event.title === 'map-status') {
            this.pageReady = true;
            this.mapError = '';
          }
        })
        .onPageEnd(() => {
          this.webReady = true;
          this.initialiseMap();
        })

      if (!this.pageReady && this.mapError.length === 0) {
        Column({ space: 10 }) {
          LoadingProgress()
            .width(28)
            .height(28)
            .color('#E46D35')
          Text('正在加载地图')
            .fontSize(12)
            .fontColor(MAP_COLOR_MUTED)
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#EEF2F0')
      }

      if (this.mapError.length > 0) {
        Column({ space: 8 }) {
          SymbolGlyph($r('sys.symbol.dot_radiowaves_left_and_right'))
            .fontSize(26)
            .fontColor(['#B44832'])
          Text(this.mapError)
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor('#18212B')
          Text('经纬度信息仍可正常查看')
            .fontSize(11)
            .fontColor(MAP_COLOR_MUTED)
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#EEF2F0')
      }

      Button({ type: ButtonType.Circle }) {
        SymbolGlyph($r('sys.symbol.dot_radiowaves_left_and_right'))
          .fontSize(20)
          .fontColor(['#18212B'])
      }
      .width(44)
      .height(44)
      .margin({ top: 14, right: 14 })
      .backgroundColor('#FFFFFF')
      .shadow({ radius: 10, color: '#22000000', offsetY: 3 })
      .accessibilityText('刷新并重新定位告警位置')
      .onClick(() => {
        this.refreshAlert();
        this.onRelocate();
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#EEF2F0')
  }
}
