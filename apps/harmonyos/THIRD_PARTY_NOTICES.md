# Third-party notices

The first prototype keeps its UI dependency surface deliberately small and
uses native ArkUI components. The following open-source projects are approved
reference sources for later component extraction:

- Huawei HarmonyOS Cases: https://github.com/HarmonyOS-Cases/cases
  - Repository license: Mulan Permissive Software License v2.
  - Relevant examples: `handletabs`, `pulltorefreshnews`,
    `networkstatusobserver`, and `healthchart`.
- OpenHarmony MPChart: https://gitee.com/openharmony-sig/ohos-MPChart
  - Use only if the native chart implementation is replaced by the MPChart
    package; preserve the package license and version in this file.

No third-party source is copied into the prototype by default. Any future
copied component must record its source revision and retain its original
copyright and license notices.

## Runtime map dependencies

- Leaflet 1.9.4: https://leafletjs.com/
  - Copyright (c) 2010-2023 Vladimir Agafonkin and Copyright (c) 2010-2011
    CloudMade.
  - License: BSD 2-Clause, https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE
  - The published Leaflet JavaScript and CSS are bundled with the HAP under
    `entry/src/main/resources/rawfile/`, so opening the map does not depend on
    a third-party CDN. Small compatibility styles support the HarmonyOS
    WebView layout.
- TianDiTu: https://www.tianditu.gov.cn/
  - The `img_w` satellite imagery and `cia_w` Chinese annotation services are
    requested directly by the HarmonyOS WebView. Tiles are not bundled with the
    app and are not persisted by the app cache.
  - The provider and service source are recorded in this notice. Service use
    and browser-key management are subject to TianDiTu's platform terms.
