const STATE_COLOR_TEXT: string = '#18212B';
const STATE_COLOR_MUTED: string = '#52606D';
const STATE_COLOR_SURFACE: string = '#FFFFFF';
const STATE_COLOR_LINE: string = '#E2E8E5';

@Component
export struct OperationalStatePanel {
  @Prop icon: Resource;
  @Prop title: string;
  @Prop detail: string;
  @Prop tone: string;
  @Prop loading: boolean = false;
  @Prop actionLabel: string = '';
  onAction: () => void = () => {};
  @State private revealed: boolean = false;

  build() {
    Column({ space: 10 }) {
      Stack({ alignContent: Alignment.Center }) {
        Circle({ width: 46, height: 46 })
          .fill('#F1F4F3')
        if (this.loading) {
          LoadingProgress()
            .width(24)
            .height(24)
            .color(this.tone)
        } else {
          SymbolGlyph(this.icon)
            .fontSize(22)
            .fontColor([this.tone])
        }
      }
      .width(46)
      .height(46)

      Text(this.title)
        .fontSize(16)
        .fontWeight(FontWeight.Medium)
        .fontColor(STATE_COLOR_TEXT)
        .textAlign(TextAlign.Center)

      Text(this.detail)
        .fontSize(13)
        .lineHeight(20)
        .fontColor(STATE_COLOR_MUTED)
        .textAlign(TextAlign.Center)
        .constraintSize({ maxWidth: 280 })

      if (this.actionLabel.length > 0) {
        Button(this.actionLabel)
          .height(44)
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(STATE_COLOR_SURFACE)
          .backgroundColor(STATE_COLOR_TEXT)
          .borderRadius(8)
          .margin({ top: 4 })
          .onClick(() => this.onAction())
      }
    }
    .width('100%')
    .padding({ left: 20, right: 20, top: 28, bottom: 28 })
    .backgroundColor(STATE_COLOR_SURFACE)
    .border({ width: 1, color: STATE_COLOR_LINE })
    .borderRadius(8)
    .opacity(this.revealed ? 1 : 0.72)
    .translate({ y: this.revealed ? 0 : 8 })
    .onAppear(() => {
      this.getUIContext().animateTo({ duration: 180, curve: Curve.EaseOut }, () => this.revealed = true);
    })
    .accessibilityText(`${this.title}，${this.detail}`)
  }
}
