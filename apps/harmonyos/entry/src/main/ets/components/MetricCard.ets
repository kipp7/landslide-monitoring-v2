@Component
export struct MetricCard {
  @Prop label: string;
  @Prop value: string;
  @Prop detail: string;
  @Prop accent: string;
  @Prop actionable: boolean = false;
  onTap: () => void = () => {};

  build() {
    Column({ space: 7 }) {
      Row() {
        Text(this.label)
          .fontSize(13)
          .fontColor('#6C7782')
        Blank().layoutWeight(1)
        if (this.actionable) {
          SymbolGlyph($r('sys.symbol.chevron_right'))
            .fontSize(15)
            .fontColor([this.accent])
        }
      }
      .width('100%')
      Text(this.value)
        .fontSize(25)
        .fontWeight(FontWeight.Bold)
        .fontColor('#18212B')
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Text(this.detail)
        .fontSize(11)
        .fontColor(this.accent)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .alignItems(HorizontalAlign.Start)
    .padding({ left: 14, right: 14, top: 13, bottom: 13 })
    .backgroundColor('#FFFFFF')
    .borderRadius(8)
    .height(102)
    .layoutWeight(1)
    .accessibilityText(`${this.label}，${this.value}，${this.detail}`)
    .onClick(() => this.onTap())
  }
}
