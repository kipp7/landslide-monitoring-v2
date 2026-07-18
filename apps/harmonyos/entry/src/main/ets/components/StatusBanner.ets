@Component
export struct StatusBanner {
  @Prop text: string;
  @Prop tone: string;

  build() {
    Row({ space: 8 }) {
      Stack({ alignContent: Alignment.Center }) {
        Circle({ width: 14, height: 14 })
          .fill('#EEF1F3')
        Circle({ width: 8, height: 8 })
          .fill(this.tone)
      }
      .width(14)
      .height(14)
      Text(this.text)
        .fontSize(12)
        .fontColor('#52606D')
        .maxLines(2)
        .layoutWeight(1)
    }
    .padding({ left: 12, right: 12, top: 10, bottom: 10 })
    .backgroundColor('#FFFFFF')
    .borderRadius(8)
    .width('100%')
    .accessibilityText(this.text)
  }
}
