# v2 妯″潡鍖栧苟琛屾帹杩涳紙Workstreams锛?
鐩殑锛氭妸鈥滄棫椤圭洰锛堝弬鑰冨尯 `E:\瀛︽牎\06 宸ヤ綔鍖篭2\openharmony\landslide-monitor`锛夐噷宸叉湁鐨勫墠绔?鍚庣鑳藉姏鈥濇寜妯″潡鎷嗗垎锛屽湪 v2 浠撳簱 `E:\瀛︽牎\02 椤圭洰\99 灞变綋婊戝潯浼樺寲瀹屽杽\landslide-monitoring-v2` 涓?*骞跺彂鎺ㄨ繘**锛屾渶缁堝仛鍒?*鍔熻兘涓嶇己澶?*锛屼笖绗﹀悎 v2 鐨勫绾?鏋舵瀯/闂ㄧ/鍚堝苟瑙勮寖銆?
## 0) 鎬荤害鏉燂紙蹇呴』閬靛畧锛?
- **鍙敼 v2 宸ヤ綔鍖?*锛氭墍鏈夊彉鏇村彧鍏佽鍙戠敓鍦?`landslide-monitoring-v2`锛沗openharmony/landslide-monitor` 浠呯敤浜庡鐓т笌鎻愬彇闇€姹傦紝涓嶅湪鍏朵笂鍋氫换浣曚慨鏀广€?- **PR-only**锛氱姝㈢洿鎺?push `main`锛涙瘡涓ā鍧楃嫭绔嬪垎鏀?+ PR锛涘悎骞惰蛋 Rulesets锛圫quash merge锛夈€?- **璐ㄩ噺闂ㄧ蹇呰繃**锛堟瘡涓?PR 閮藉繀椤诲湪鏈湴璺戦€氬啀鎺ㄩ€侊級锛?  - `python docs/tools/run-quality-gates.py`
  - `npm run lint`
  - `npm run build`
- **濂戠害浼樺厛**锛氬澶栨帴鍙ｏ紙API/MQTT/Kafka/Storage锛夊敮涓€鏉冨▉鍦?`docs/integrations/`锛涙敼濂戠害蹇呴』鍚屾鏇存柊鏂囨。涓?stamp锛堝 OpenAPI锛夈€?- **涓嶆敼 UI锛堥櫎闈炲繀瑕侊級**锛氫紭鍏堚€滄仮澶嶅姛鑳?瀵规帴鏁版嵁/娑堥櫎纭紪鐮佲€濓紝UI 灏介噺淇濇寔鐜版湁 v2 椋庢牸涓庡竷灞€涓€鑷淬€?
## 1) 骞跺彂鍗忎綔鏂瑰紡锛堢粰骞跺彂 AI/寮€鍙戣€咃級

### 1.1 鍒嗘敮鍛藉悕

- `feat/<module>/<short-desc>` 鎴?`fix/<module>/<short-desc>` 鎴?`docs/<module>/<short-desc>`

### 1.2 PR 鍐呭瑕佹眰锛堝繀椤诲寘鍚級

- **What**锛氬仛浜嗗摢浜涘姛鑳界偣锛堝搴旀湰鏂囦欢鐨?WS/瀛愰」锛?- **How**锛氬叧閿疄鐜拌矾寰勶紙API/DB/worker/web 鐨勮竟鐣岋級
- **Verification**锛氬垪鍑轰笁澶ч棬绂佸懡浠?+ 蹇呰鐨勬湰鍦伴獙璇佹楠わ紙濡傛秹鍙?smoke/e2e锛屽繀椤荤粰 evidence 璺緞锛?- **Docs**锛氳嫢鍔ㄥ绾?杩愮淮/鍏抽敭鍐崇瓥锛屾寚鍑哄凡鏇存柊鐨勬枃妗ｈ矾寰?
### 1.3 骞惰鍐茬獊澶勭悊锛堝己鍒讹級

- 鍚屼竴璧勬簮锛堝悓涓€寮犺〃/鍚屼竴 API 璺敱/鍚屼竴椤甸潰锛夐伩鍏嶅 PR 骞惰鏀瑰姩銆?- 鑻ュ繀椤诲苟琛岋細鍏堝悎骞朵竴涓€滄娊璞?楠ㄦ灦 PR鈥濓紙璺敱/琛?DTO/闂ㄧ锛夛紝鍏朵綑 PR 鍩轰簬瀹冪户缁媶鍒嗐€?
## 2) 妯″潡鎬昏锛圵orkstreams锛?
璇存槑锛氫笅闈㈡瘡涓ā鍧楅兘瑕佹眰缁欏嚭銆屽弬鑰冨尯瀵圭収鐐广€嶄笌銆寁2 钀藉湴鐩爣銆嶃€傚苟鍙?AI 鍙互鍚勮嚜棰嗗彇妯″潡锛岀嫭绔?PR 鎺ㄨ繘銆?
### WS-A锛氳璇佷笌鏉冮檺锛圵eb 鐧诲綍/閴存潈/RBAC锛?
- 鍙傝€冨尯锛歚frontend/app/login`锛堟敞鎰忥細鍙傝€冨尯鐧诲綍閫昏緫涓昏鏄€滆烦杞€濓紝涓嶆槸瀹夊叏閴存潈锛?- v2 鐩爣锛歐eb 鐧诲綍/鍒锋柊 token/鐧诲嚭/杩囨湡澶勭悊銆丄dmin/Ops 鎸夋潈闄愬彲瑙併€丄PI 绔?JWT/RBAC 涓庡绾︿竴鑷?
### WS-B锛氳澶囦笌绔欑偣浣撶郴锛圧egions/Networks/Stations/Devices锛?
- 鍙傝€冨尯锛歚frontend/app/api/hierarchy/*`銆乣frontend/app/api/monitoring-stations*`
- v2 鐩爣锛氱珯鐐?璁惧 CRUD + 缁戝畾鍏崇郴 + 瀛楀吀娓叉煋鏇夸唬纭紪鐮侊紙鍚嶇О/绫诲瀷/鐘舵€?浼犳劅鍣ㄥ垪琛級

### WS-C锛氶仴娴嬫暟鎹紙瀹炴椂/鍘嗗彶/鑱氬悎/瀵煎嚭锛?
- 鍙傝€冨尯锛歚frontend/app/analysis`銆乣frontend/app/api/data-aggregation`銆佸悇绫诲浘琛ㄧ粍浠?- v2 鐩爣锛欳lickHouse 鏉冨▉銆乣/data/state`銆乣/data/series`銆佺粺璁?鑱氬悎/瀵煎嚭鎺ュ彛涓庢煡璇㈣寖鍥撮檺鍒讹紝鍓嶇鍒嗘瀽椤靛彲鐢?
### WS-D锛欸PS 鐩戞祴 / 褰㈠彉鍒嗘瀽 / 鍩哄噯鐐癸紙Baseline锛?
- 鍙傝€冨尯锛歚frontend/app/gps-monitoring`銆乣frontend/app/gps-deformation`銆乣frontend/app/baseline-management`銆乣frontend/app/api/baselines/*`銆乣backend/iot-service/baseline-management-api.js`
- v2 鐩爣锛氬熀鍑嗙偣 CRUD銆佽川閲忚瘎浼般€佸舰鍙樿绠椾笌瓒嬪娍锛涚姝?Supabase 鐩磋繛锛屾暟鎹繘鍏?v2 瀛樺偍鍚庣敱 v2 API 鎻愪緵

### WS-E锛氬憡璀︿笌瑙勫垯寮曟搸锛圧ules/Alerts/閫氱煡锛?
- 鍙傝€冨尯锛歚frontend/app/api/anomaly-assessment`銆乣ai-prediction` 绛夆€滃紓甯?椋庨櫓鈥濇蹇典笌椤甸潰
- v2 鐩爣锛歚alert_rules` 鐗堟湰鍖?DSL銆佸洖鏀?鍥炴祴銆乣alert_events` 鍙煡璇紱鍏抽敭鎿嶄綔鍙璁★紙`operation_logs`/`api_logs`锛?
### WS-F锛欼oT 鎺ュ叆锛堣澶囦笂鎶?鍛戒护涓嬪彂/瀹炴椂閫氶亾锛?
- 鍙傝€冨尯鍚庣锛歚backend/iot-service/iot-server.js`锛圗xpress + Socket.IO + `/iot/huawei`锛?- v2 鐩爣锛氫富閾捐矾浠?MQTT 鈫?Kafka 鈫?ClickHouse/Postgres 涓哄噯锛涜嫢闇€鍏煎鍗庝负浜?IoT HTTP 鎺ㄩ€侊紝浠ラ€傞厤鍣ㄦ柟寮忔帴鍏ワ紱鍛戒护/鍥炴墽闂幆锛堝惈瀹¤锛?
### WS-G锛氱郴缁熺洃鎺т笌杩愮淮宸ュ叿锛圤ps锛?
- 鍙傝€冨尯锛歚frontend/app/system-monitor`銆乣frontend/app/debug-api`銆乣db-admin/inspect-*`
- v2 鐩爣锛氱粺涓€鍦?v2 `/ops/*`锛涜皟璇曞伐鍏蜂繚鐣欎絾蹇呴』鏉冮檺 + 瀹¤锛涚姝㈢‖缂栫爜瀵嗛挜/鐩磋繛鏁版嵁搴?
### WS-H锛欰I 棰勬祴涓庝笓瀹剁郴缁燂紙鍙彃鎷旓級

- 鍙傝€冨尯锛歚frontend/app/api/ai-prediction`銆乣device-health-expert`锛屼互鍙?`backend/services/expertDeviceHealthService.js`
- v2 鐩爣锛氫綔涓哄紓姝?worker/鎻掍欢锛涢娴嬬粨鏋滃叆搴?+ 鍙洖鏀撅紙涓嶅彲鍙湪鍓嶇/鍐呭瓨璁＄畻锛?
## 3) 妯″潡浜や粯娓呭崟妯℃澘锛堟瘡涓?WS 鐨?PR 閮芥寜姝ゅ啓锛?
1) **鎺ュ彛涓庡绾?*
   - [ ] OpenAPI/鎺ュ彛璺緞/DTO 宸茶ˉ榻愶紙濡傛秹鍙婏級
   - [ ] 鍙樻洿宸插悓姝ュ埌 `docs/integrations/*`锛堝娑夊強锛?2) **鏁版嵁涓庤縼绉?*
   - [ ] Postgres/ClickHouse 琛ㄤ笌杩佺Щ鑴氭湰榻愬叏锛堝娑夊強锛?   - [ ] 绉嶅瓙鏁版嵁/榛樿鏉冮檺/瀛楀吀琛ㄥ鐞嗗埌浣嶏紙濡傛秹鍙婏級
3) **瀹夊叏涓庢潈闄?*
   - [ ] 閴存潈瑕佹眰鏄庣‘锛堝尶鍚?鐧诲綍/绠＄悊鍛?token锛?   - [ ] 鍏抽敭鎿嶄綔鍐欏叆 `operation_logs`锛堝娑夊強锛?4) **鍓嶇鍔熻兘**
   - [ ] 椤甸潰鍙敤銆佹棤纭紪鐮侀槇鍊?鏄犲皠锛堝簲浠?API/瀛楀吀璇诲彇锛?   - [ ] 鍑洪敊鎻愮ず/绌烘€?鍔犺浇鎬侀綈鍏紙涓嶇牬鍧?UI锛?5) **楠岃瘉**
   - [ ] `python docs/tools/run-quality-gates.py`
   - [ ] `npm run lint`
   - [ ] `npm run build`
   - [ ] 濡傛秹鍙婂崟鏈鸿仈璋冿細琛ュ厖 smoke/e2e 鐨勬楠や笌 evidence 璺緞

## 4) 骞跺彂棰嗗彇涓庣櫥璁帮紙鍞竴鍏ュ彛锛?
鎵€鏈夊苟鍙?AI/寮€鍙戣€呭繀椤诲厛鍦ㄨ繖閲岀櫥璁帮紝鍐嶅紑鍒嗘敮/鎻?PR锛岄伩鍏嶉噸澶嶅缓璁句笌浜掔浉瑕嗙洊銆?
### 4.1 鐘舵€佹灇涓撅紙缁熶竴锛?
- `backlog`锛氬皻鏈紑濮?- `claimed`锛氬凡棰嗗彇锛屾湭寮€ PR
- `in_progress`锛氬紑鍙戜腑锛堝彲鍙嶅鎺ㄩ€侊級
- `in_review`锛氬凡寮€ PR锛岀瓑寰?review/CI
- `blocked`锛氳渚濊禆/鐜/濂戠害闃诲锛堝繀椤诲啓鏄庨樆濉炵偣锛?- `done`锛氬凡鍚堝苟鍒?`main`

### 4.2 棰嗗彇瑙勫垯锛堝己鍒讹級

- 涓€涓?PR 灏介噺鍙仛涓€涓?WS锛堟垨 WS 鐨勪竴涓瓙椤癸級锛涗笉瑕佹妸澶氫釜涓嶇浉鍏虫ā鍧楁崋缁戝埌鍚屼竴 PR銆?- 娑夊強鈥滃绾?鏁版嵁妯″瀷鈥濈殑鏀瑰姩蹇呴』鍏堣惤鍦帮紙WS-Contract/WS-DB 绫?PR 鍙互鍏堣锛夛紝椤甸潰 PR 浠ュ叾涓轰緷璧栥€?- 鑻ヨ鏀瑰姩涓庡埆浜烘鍦ㄦ敼鍔ㄧ殑鍚屼竴鏂囦欢/鍚屼竴璺敱/鍚屼竴寮犺〃锛屽繀椤诲厛鍦ㄧ櫥璁拌〃閲屾爣娉ㄤ緷璧?鍐茬獊骞舵矡閫氭媶鍒嗐€?
### 4.3 棰嗗彇涓庣櫥璁拌〃锛堣鍦ㄦ缁存姢锛?
璇存槑锛氭瘡涓鍙栭」寤鸿鎷嗗埌鈥滃彲鍦?1~3 澶╁畬鎴愨€濈殑绮掑害锛涘鏋滄煇涓?WS 澶ぇ锛屽彲浠ュ湪 鈥淪cope鈥?涓拷鍔犲瓙缂栧彿锛堝 `WS-D.1`銆乣WS-D.2`锛夈€?
| Scope | Owner | Branch | PR | Status | Dependencies | Notes |
|---|---|---|---|---|---|---|
| WS-A | codex | `docs/ws-a/claim` |  | claimed |  | Local dev: CORS + Web 鐧诲綍鑱旇皟锛堝敖閲忎笉鏀?UI锛?|
| WS-B |  |  |  | backlog |  |  |
| WS-C | codex | `feat/ws-c/data-statistics-ui` |  | in_progress |  | Web: `/data` 澧炲姞缁熻鑱氬悎锛堝鎺?`/api/v1/data/statistics`锛?|
| WS-D.1 | codex | `feat/ws-d/baselines-contract` | https://github.com/kipp7/landslide-monitoring-v2/pull/77 | done |  | 鍩哄噯鐐癸紙Baseline锛夊绾?鏁版嵁妯″瀷/API 楠ㄦ灦 |
| WS-D.2 | codex | `feat/ws-d/deformation-trends` |  | claimed | WS-D.1 | 浠呭仛鈥淎PI + 鏌ヨ鈥濋棴鐜細鏂板 `/api/v1/gps/deformations/*`锛堝懡鍚嶅緟纭锛夛紝浼樺厛 ClickHouse 璇伙紱閬垮厤鏀瑰姩鐜版湁 Web UI锛屽悗缁啀鍗曠嫭瀵规帴椤甸潰 |
| WS-E | codex | `docs/ws-e/claim` | https://github.com/kipp7/landslide-monitoring-v2/pull/86 | in_review |  | Web: alert rules management UI (`/alerts/rules`) |
| WS-F |  |  |  | backlog |  |  |
| WS-G | codex | `feat/ws-g/ops-system-monitor` | https://github.com/kipp7/landslide-monitoring-v2/pull/79 | done |  | Web: `/ops/system-monitor` + `/ops/debug-api` + legacy redirects + Windows distDir workaround (`.next_v2`) |
| WS-H | codex | `feat/ws-h/ai-prediction-worker` | https://github.com/kipp7/landslide-monitoring-v2/pull/84 | done |  | AI predictions plugin/worker |

### 4.4 瀵归綈涓庨獙鏀讹紙鎬婚泦鎴愪汉鍋氾級

褰撴墍鏈?WS 閮藉埌 `done`锛屾€婚泦鎴愪汉闇€瑕佸仛涓€娆♀€滅己鍙ｅ鐓ч獙鏀垛€濓細

1) 鎸夊弬鑰冨尯椤甸潰/鍔熻兘鐐规媺娓呭崟锛堝寘鍚細GPS 鐩戞祴銆佸舰鍙樸€佸熀鍑嗙偣銆佹暟鎹仛鍚堛€佸紓甯?鍛婅銆両oT 鎺ュ叆銆佺郴缁熺洃鎺х瓑锛夈€?2) 閫愰」鏍囨敞鍏跺湪 v2 鐨勮惤鍦扮偣锛圓PI 璺敱/琛?worker/web 椤甸潰锛夛紝骞惰ˉ榻愮己椤广€?3) 姹囨€讳竴涓敹灏?PR锛氬彧鍋氣€滃鎺?杩為€?缂哄彛琛ラ綈/鏂囨。鏇存柊鈥濓紝涓嶅仛澶ч噸鏋勩€?
---

鍙傝€冭鑼冿細

- `docs/guides/roadmap/project-status.md`
- `docs/guides/standards/pull-request-howto.md`
- `docs/guides/standards/definition-of-done.md`
- `docs/guides/standards/api-contract-rules.md`
- `docs/guides/standards/api-contract-rules.md`
- `docs/guides/standards/backend-rules.md`
