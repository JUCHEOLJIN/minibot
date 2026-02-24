---
name: skill-name
description: 스킬이 하는 일을 명확하게 적어두세요. Claude가 이 설명을 보고 언제 스킬을 호출할지 결정합니다.
triggers:
  - "트리거 키워드"
  - "trigger keyword"
# schedule:          # 자동 실행이 필요한 경우 주석 해제
#   cron: "0 9 * * *"
#   enabled: false
#   timezone: "Asia/Seoul"
---

## 스킬 설명

이 스킬이 하는 일을 더 자세하게 설명합니다.

### 인자

- `args[0]`: 채널 ID (봇이 자동으로 전달)

### 반환값

```json
{ "success": true, "message": "완료 메시지" }
```
