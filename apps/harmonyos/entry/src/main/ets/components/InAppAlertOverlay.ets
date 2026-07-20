import { AlertStreamEvent, numberValue, severityLabel, shortTime } from '../data/Types';

const COLOR_TEXT: string = '#18212B';
const COLOR_MUTED: string = '#66717C';
const COLOR_DANGER: string = '#B44832';
const COLOR_DANGER_DARK: string = '#7E2E21';
const COLOR_DANGER_SOFT: string = '#F9ECE8';
const COLOR_WARNING: string = '#C56A24';
const COLOR_INFO: string = '#477B96';

@Component
export struct InAppAlertOverlay {
  @Prop event: AlertStreamEvent;
  @Prop muted: boolean;
  @Prop queuedCount: number;
  @Prop sourceLabel: string;
  onToggleMute: () => void = () => {};
  onOpenMap: () => void = () => {};
  onDismiss: () => void = () => {};

  private accentColor(): string {
    const severity = this.event.severity.toLowerCase();
    if (severity === 'critical' || severity === 'high') return COLOR_DANGER;
    if (severity === 'medium') return COLOR_WARNING;
    return COLOR_INFO;
  }

  private alertTitle(): string {
    const title = this.event.title.trim();
    return title.length > 0 ? title : '监测告警';
  }

  private alertMessage(): string {
    const message = this.event.message.trim();
    return message.length > 0 ? message : '监测数据达到预警条件，请及时查看。';
  }

  private alertTime(): string {
    const date = new Date(this.event.createdAt);
    if (Number.isNaN(date.getTime())) return '时间待确认';
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${shortTime(this.event.createdAt)}`;
  }

  private maxDeviationLabel(): string {
    const value = numberValue(this.event.evidence?.['maxDeviationDeg']);
    return value === null ? '--' : `${value.toFixed(2)}°`;
  }

  private maxAxisLabel(): string {
    const value = this.event.evidence?.['maxAxis'];
    return typeof value === 'string' && value.length > 0 ? value.toUpperCase() : '--';
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column() {
        Row()
          .width('100%')
          .height(6)
          .backgroundColor(this.accentColor())

        Column({ space: 18 }) {
          Row({ space: 12 }) {
            Stack({ alignContent: Alignment.Center }) {
              Circle()
                .width(48)
                .height(48)
                .fill(COLOR_DANGER_SOFT)
              SymbolGlyph($r('sys.symbol.bell'))
                .fontSize(24)
                .fontColor([this.accentColor()])
            }
            .width(48)
            .height(48)

            Column({ space: 3 }) {
              Row({ space: 8 }) {
                Text(severityLabel(this.event.severity))
                  .fontSize(12)
                  .fontWeight(FontWeight.Bold)
                  .fontColor('#FFFFFF')
                  .padding({ left: 9, right: 9, top: 4, bottom: 4 })
                  .backgroundColor(this.accentColor())
                  .borderRadius(4)
                Text('新告警')
                  .fontSize(12)
                  .fontColor(COLOR_MUTED)
              }
              Text(this.alertTitle())
                .fontSize(20)
                .fontWeight(FontWeight.Bold)
                .fontColor(COLOR_TEXT)
                .maxLines(2)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
            }
            .alignItems(HorizontalAlign.Start)
            .layoutWeight(1)
          }
          .width('100%')
          .alignItems(VerticalAlign.Center)

          Text(this.alertMessage())
            .width('100%')
            .fontSize(15)
            .lineHeight(23)
            .fontColor(COLOR_DANGER_DARK)
            .padding(14)
            .backgroundColor(COLOR_DANGER_SOFT)
            .borderRadius(6)
            .maxLines(4)
            .textOverflow({ overflow: TextOverflow.Ellipsis })

          Row() {
            Column({ space: 3 }) {
              Text('最大相对偏移')
                .fontSize(11)
                .fontColor(COLOR_MUTED)
              Text(this.maxDeviationLabel())
                .fontSize(17)
                .fontWeight(FontWeight.Bold)
                .fontColor(COLOR_DANGER_DARK)
            }
            .alignItems(HorizontalAlign.Start)
            .layoutWeight(1)

            Column({ space: 3 }) {
              Text('主变化轴')
                .fontSize(11)
                .fontColor(COLOR_MUTED)
              Text(this.maxAxisLabel())
                .fontSize(17)
                .fontWeight(FontWeight.Bold)
                .fontColor(COLOR_DANGER_DARK)
            }
            .alignItems(HorizontalAlign.Start)
            .layoutWeight(1)
          }
          .width('100%')
          .padding({ left: 14, right: 14, top: 10, bottom: 10 })
          .backgroundColor('#F6F7F8')
          .borderRadius(6)

          Column({ space: 10 }) {
            Row({ space: 10 }) {
              SymbolGlyph($r('sys.symbol.dot_radiowaves_left_and_right'))
                .fontSize(17)
                .fontColor([COLOR_MUTED])
              Text(this.sourceLabel)
                .fontSize(14)
                .fontColor(COLOR_TEXT)
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .layoutWeight(1)
            }
            .width('100%')

            Row({ space: 10 }) {
              SymbolGlyph($r('sys.symbol.bell'))
                .fontSize(17)
                .fontColor([this.muted ? COLOR_MUTED : this.accentColor()])
              Text(`${this.alertTime()} · ${this.muted ? '警报声已静音' : '警报声已开启'}`)
                .fontSize(13)
                .fontColor(COLOR_MUTED)
                .maxLines(2)
                .layoutWeight(1)
            }
            .width('100%')
          }
          .width('100%')

          if (this.queuedCount > 0) {
            Text(`另有 ${this.queuedCount} 条新告警待查看`)
              .width('100%')
              .fontSize(13)
              .fontWeight(FontWeight.Medium)
              .fontColor(COLOR_DANGER_DARK)
          }

          Row({ space: 10 }) {
            Button() {
              Row({ space: 7 }) {
                SymbolGlyph($r('sys.symbol.bell'))
                  .fontSize(17)
                  .fontColor([this.muted ? COLOR_DANGER_DARK : COLOR_TEXT])
                Text(this.muted ? '恢复警报' : '暂时静音')
                  .fontSize(14)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(this.muted ? COLOR_DANGER_DARK : COLOR_TEXT)
              }
              .justifyContent(FlexAlign.Center)
            }
            .height(48)
            .layoutWeight(1)
            .backgroundColor('#EEF1F2')
            .borderRadius(6)
            .accessibilityText(this.muted ? '恢复告警声音' : '暂时静音告警声音')
            .onClick(() => this.onToggleMute())

            Button() {
              Row({ space: 7 }) {
                SymbolGlyph($r('sys.symbol.dot_radiowaves_left_and_right'))
                  .fontSize(17)
                  .fontColor(['#FFFFFF'])
                Text('查看定位')
                  .fontSize(14)
                  .fontWeight(FontWeight.Bold)
                  .fontColor('#FFFFFF')
              }
              .justifyContent(FlexAlign.Center)
            }
            .height(48)
            .layoutWeight(1)
            .backgroundColor(this.accentColor())
            .borderRadius(6)
            .accessibilityText('查看告警地图定位')
            .onClick(() => this.onOpenMap())
          }
          .width('100%')

          Button('收起提醒')
            .height(40)
            .fontSize(14)
            .fontColor(COLOR_MUTED)
            .backgroundColor(Color.Transparent)
            .accessibilityText('收起当前告警提醒')
            .onClick(() => this.onDismiss())
        }
        .width('100%')
        .padding({ left: 20, right: 20, top: 18, bottom: 14 })
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
      .constraintSize({ maxWidth: 420 })
      .backgroundColor('#FFFFFF')
      .borderRadius(8)
      .clip(true)
      .shadow({ radius: 28, color: '#52000000', offsetX: 0, offsetY: 12 })
    }
    .width('100%')
    .height('100%')
    .padding({ left: 18, right: 18, top: 28, bottom: 28 })
    .backgroundColor('#730E151B')
    .zIndex(100)
  }
}

@Component
export struct ActiveAlertBanner {
  @Prop event: AlertStreamEvent;
  @Prop muted: boolean;
  onOpen: () => void = () => {};

  private title(): string {
    const title = this.event.title.trim();
    return title.length > 0 ? title : '监测告警';
  }

  build() {
    Button({ type: ButtonType.Normal }) {
      Row({ space: 12 }) {
        SymbolGlyph($r('sys.symbol.bell'))
          .fontSize(21)
          .fontColor(['#FFFFFF'])
        Column({ space: 2 }) {
          Text(`${severityLabel(this.event.severity)} · ${this.title()}`)
            .width('100%')
            .fontSize(14)
            .fontWeight(FontWeight.Bold)
            .fontColor('#FFFFFF')
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(this.muted ? '告警未解除 · 警报声已静音' : '告警未解除 · 警报持续中')
            .width('100%')
            .fontSize(11)
            .fontColor('#FADDD5')
            .maxLines(1)
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        SymbolGlyph($r('sys.symbol.chevron_right'))
          .fontSize(18)
          .fontColor(['#FFFFFF'])
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .height(62)
    .padding({ left: 18, right: 18 })
    .backgroundColor(COLOR_DANGER_DARK)
    .borderRadius(0)
    .accessibilityText('打开当前告警提醒')
    .onClick(() => this.onOpen())
  }
}
