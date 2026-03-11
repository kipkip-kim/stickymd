# Sticky Memo v1.0 — 작업 로그

---

## 1. 완료된 작업 (Phase 1–9)

### Phase 1: Electron + React + Vite 초기화
- electron-vite 5.0 + React 19 + TypeScript 수동 구성 (CLI가 interactive라 직접 셋업)
- Electron 40.8.0, Vite 7.3.1
- `app.requestSingleInstanceLock()` (B22)

### Phase 2: 멀티윈도우 기본 구조
- `json-store.ts`: writeQueue 직렬화 (B1), temp-file→rename (B25)
- `window-manager.ts`: UUID 윈도우 추적, debounce(1초) 위치 저장, 리스너 해제 (B11)
- `store.ts`: stateStore/settingsStore, 경로 폴백 (B13)
- state.json / settings.json / ~/Documents/StickyMemo/.trash 디렉토리 자동 생성

### Phase 3: 커스텀 타이틀바
- frame:false + `-webkit-app-region: drag`, 버튼 no-drag (B15)
- 닫기/핀/새메모/롤업 버튼, 더블클릭 롤업
- `setMinimumSize()` 동적 전환, isTransitioning 플래그 (B2)

### Phase 4: 시스템 트레이
- 우클릭 메뉴: 새 메모 / 관리자 창(미연결) / 설정(미연결) / 종료
- 더블클릭: state.json 기반 복원
- 폴백 아이콘 (icon.png 없을 때 노란 네이티브 이미지)

### Phase 5: 노트 색상
- 7색 프리셋 팔레트 + react-colorful 커스텀 피커
- 타이틀바 색상 도트 → 드롭다운 팔레트 → 윈도우 배경색 적용

### Phase 6: Milkdown WYSIWYG 통합
- @milkdown/kit 7.19.0 — commonmark, history, listener, clipboard 플러그인
- ProseMirror 글로벌 CSS (헤딩, 리스트, 체크박스, 인용, 코드, 링크)
- 링크 클릭 → shell.openExternal() + will-navigate 차단

### Phase 6b: 하단 편집 툴바
- 굵게(B) / 밑줄(U) / 체크박스(☑) / 글머리(•) + 투명도 슬라이더
- onMouseDown+preventDefault 포커스 유지 (B4), 슬라이더 tabIndex={-1}
- 에디터 포커스 기반 표시/숨김

### Phase 7: .md 파일 저장/로드 + 자동 저장
- gray-matter frontmatter (excerpt:false → B5)
- 2초 debounce 자동 저장, 내용 비교 스킵 (B6)
- flush-save on close (B21), 빈 메모 자동 삭제 (B20), pendingDeleteIds (B8)

### Phase 8a+8b: 슬래시 커맨드
- 12종 커맨드, 한글/영문 듀얼 매핑
- 드롭다운 UI: 최대 8개, ↑↓ Enter ESC, 텍스트 필터, 뷰포트 밖 방지
- isComposing IME 처리 (B3), compositionend 후 `/` 감지

### Phase 9: 상태 복원
- 앱 시작 시 state.json → openMemoIds 순차 복원
- 파일 존재 검증, maxOpenWindows 제한 (B14), 실패 시 새 메모 생성

### Phase 10a: 관리자 창 기본
- `manager-window.ts`: BrowserWindow 600×500, hash 기반 라우팅 (`#manager`, `#manager?tab=settings`)
- `main.tsx`: `#manager` hash 감지 → ManagerWindow 렌더링, 기본 → App 렌더링
- `ManagerWindow.tsx`: 상단 3탭 (메모 목록/휴지통/설정), 탭 전환 IPC (`manager:switch-tab`)
- 메모 목록: 색상 dot + 제목 + 상대시간(수정일), 더블클릭→메모 창 열기
- 검색: debounce 300ms + B7 IME composing 처리 (compositionstart/end)
- 정렬: 수정일/생성일/제목 × 오름차순/내림차순 토글
- 내보내기: `dialog.showSaveDialog`, frontmatter 포함/제외
- 가져오기: `dialog.showOpenDialog`, UUID 파일명 복사, 기존 frontmatter 유지
- 트레이 메뉴 연결: "관리자 창"→`openManagerWindow()`, "설정"→`openManagerWindow('settings')`
- Preload API: `openManager`, `openMemo`, `exportMemo`, `importMemo`, `onManagerSwitchTab`

### 기술부채 정리 + 버그 수정 (Phase 9→10a 사이)
- **공유 타입 통일**: `src/shared/types.ts` 생성 (MemoFrontmatter, AlarmData, MemoData). preload `Promise<unknown>` → 정확한 타입. App.tsx 로컬 MemoData 제거
- **비동기 에러 처리**: App.tsx 4개소 + Titlebar.tsx 5개소 + EditorToolbar 1개소 try/catch 래핑
- **자동 저장 설정 반영**: `settings:get-auto-save-ms` IPC 추가, 하드코딩 2000ms → 설정값
- **밑줄 마크 구현**: `plugins/underline-plugin.ts` — ProseMirror 커스텀 마크 + remark `<u>` 라운드트립 + Ctrl+U 키맵
- **체크박스 토글 구현**: EditorToolbar에서 ProseMirror API로 list_item checked 토글
- **정적 import 전환**: window-manager.ts의 `import('electron').then()` → 정적 import (`shell`, `dialog`)
- **크리티컬 버그 4건 수정**:
  - BUG-1: `handleColorChange`가 `pendingContentRef.current || ''`로 빈 문자열 저장 → 메모 내용 삭제. `currentContentRef` 도입으로 해결
  - BUG-2: `onFlushSave` 리스너가 마운트 시점 `flushSave`만 캡처 → 창 닫기 시 stale color/opacity. ref 기반으로 전환
  - BUG-3: debounce setTimeout이 생성 시점 color/opacity 캡처 → 색상 변경 덮어씌움. ref 기반으로 전환
  - BUG-4: `setOpacity` IPC `.catch()` 누락
- **커밋**: `36ddebc fix: resolve tech debt and critical bugs before Phase 10a`

---

## 2. 앞으로 할 작업

| Phase | 내용 | 핵심 포인트 |
|-------|------|-------------|
| ~~10a~~ | ~~관리자 창~~ | ~~BrowserWindow 600×500, 탭 UI(목록/휴지통/설정), 검색, 정렬, 내보내기/가져오기~~ → **완료** |
| 10b | 휴지통 + IPC 동기화 | .trash/ 이동/복원, 삭제 팝업, 30일 자동 비우기, 양방향 IPC 전파 |
| 11 | 설정 탭 + 백업/복원 | 폰트, 자동저장 주기, 휴지통 기간, 저장경로, 자동시작, 백업 zip |
| 12 | 다크 모드 | CSS 변수, nativeTheme, 노트 색상 다크 2세트, Milkdown 다크 스타일 |
| 13 | 부가 기능 | 글로벌 핫키(Ctrl+Shift+N), 클립보드 복사(MD/텍스트), Ctrl+스크롤 텍스트 크기 |
| 13b | 알람 | 타이틀바 시계 아이콘, 모달 설정 UI, setInterval(60초) 스케줄, 토스트 알림 |
| 14 | Squirrel 인스톨러 | electron-builder, AppData 설치, 자동 업데이트 |
| 15 | 최종 테스트 + 안정화 | Vitest 유닛, Playwright E2E, 500개 스트레스, 수동 체크리스트 |

---

## 3. 현존 기술부채

### 높음 (기능 미동작)

| # | 파일 | 내용 | 상태 |
|---|------|------|------|
| ~~D1~~ | ~~`App.tsx` handleToggleUnderline~~ | ~~빈 함수~~ | **해결됨** — ProseMirror 커스텀 마크 + remark 플러그인 구현 |
| ~~D2~~ | ~~`App.tsx` handleToggleCheckbox~~ | ~~빈 함수~~ | **해결됨** — list_item checked 토글 구현 |
| ~~D3~~ | ~~`tray.ts` 관리자 창 메뉴~~ | ~~클릭해도 아무 일 없음~~ | **해결됨** — `openManagerWindow()` 연결 |
| ~~D4~~ | ~~`tray.ts` 설정 메뉴~~ | ~~클릭해도 아무 일 없음~~ | **해결됨** — `openManagerWindow('settings')` 연결 |

### 중간 (타입 안전성 / 에러 처리)

| # | 파일 | 내용 | 상태 |
|---|------|------|------|
| ~~D5~~ | ~~`preload/index.ts` readMemo/listMemos~~ | ~~`Promise<unknown>`~~ | **해결됨** — `src/shared/types.ts` 공유 타입 사용 |
| ~~D6~~ | ~~`preload/index.ts` saveMemo~~ | ~~`Record<string, unknown>`~~ | **해결됨** — `Partial<MemoFrontmatter>` |
| ~~D7~~ | ~~`App.tsx` 비동기 저장~~ | ~~try/catch 없음~~ | **해결됨** — 전체 래핑 |
| ~~D8~~ | ~~`Titlebar.tsx` 비동기 IPC~~ | ~~try/catch 없음~~ | **해결됨** — 전체 래핑 |
| ~~D9~~ | ~~`App.tsx` MemoData~~ | ~~`[key: string]: unknown`~~ | **해결됨** — 공유 타입 사용 |
| ~~D10~~ | ~~`memo-file.ts` existingFm 캐스트~~ | ~~검증 없음~~ | **해결됨** — 이미 기본값 폴백 적용 중 |

### 낮음 (하드코딩 / 코드 품질)

| # | 파일 | 내용 | 상태 |
|---|------|------|------|
| ~~D11~~ | ~~`App.tsx` AUTO_SAVE_MS~~ | ~~하드코딩~~ | **해결됨** — `settings:get-auto-save-ms` IPC 추가 |
| ~~D12~~ | ~~`window-manager.ts` will-navigate~~ | ~~.catch() 없음~~ | **해결됨** — 정적 import + .catch() |
| D13 | `useSlashCommand.ts` view.dispatch 몽키패칭 | Milkdown 플러그인 API 대신 직접 dispatch 교체. 취약 패턴 |
| D14 | `useSlashCommand.ts` setTimeout handleSelect | 에디터 파괴 후 실행 가능성 (타이밍 이슈) |
| D15 | `ColorPalette.tsx` setTimeout 리스너 | 즉시 언마운트 시 고아 리스너 가능성 |

### 잔존 기술부채 요약
- **D3, D4**: Phase 10a에서 자연 해결 (관리자 창 연결)
- **D13**: Phase 15 안정화 시 플러그인 패턴 교체 검토 (현재 동작 중)
- **D14, D15**: Phase 15 안정화 시 타이밍 이슈 전수 조사

---

## 4. 기술부채 해결 이력

### Phase 9→10a 사이 (기술부채 정리)
- **D5, D6, D9**: `src/shared/types.ts` 생성. MemoFrontmatter/AlarmData/MemoData 공유 타입으로 main/preload/renderer 통일. tsconfig 양쪽에 `src/shared/**/*` 추가
- **D7, D8**: App.tsx 4개소 + Titlebar.tsx 5개소 비동기 IPC에 try/catch 래핑
- **D11**: `settings:get-auto-save-ms` IPC 핸들러 추가. App.tsx에서 시작 시 설정값 fetch, `autoSaveMsRef`로 동적 적용
- **D1**: ProseMirror underline 커스텀 마크 구현 (`plugins/underline-plugin.ts`). `$markSchema` + `$command` + `$useKeymap` (Ctrl+U) + `$remark` remark 플러그인으로 `<u>text</u>` 마크다운 라운드트립 지원. **라운드트립 검증 필요**
- **D2**: EditorToolbar에서 직접 ProseMirror API로 list_item checked 속성 토글. 커서가 리스트 내부면 토글, 외부면 새 체크리스트 생성
- **D10**: 이미 기본값 폴백 적용 중 (`fm.title || extractTitle(...)` 등). 추가 검증 불필요
- **D12**: `import('electron').then(...)` → 정적 import (`shell`, `dialog`) + `.catch()` 추가

---

## 5. 하지 말아야 할 실수

### 아키텍처
- **Milkdown을 React controlled 패턴으로 쓰지 말 것.** `useState`로 에디터 내용 관리 시도 금지. 반드시 명령형 API만 (getMarkdown/replaceAll)
- **preload에서 `unknown` 타입으로 퉁치지 말 것.** main↔renderer 간 타입 불일치는 런타임 버그로 직결됨. 공유 타입 파일 하나로 통일
- **IPC 채널 이름 중복 주의.** `memo:` / `window:` / `shell:` 네임스페이스 규칙 유지

### React + 비동기
- **비동기 콜백에서 React state를 클로저로 캡처하지 말 것.** `useCallback([color, opacity])` 안의 setTimeout/IPC는 생성 시점 값을 캡처. 반드시 **ref** (`colorRef.current`)로 최신 값 읽기. BUG-1~3의 근본 원인
- **`pendingContentRef`와 `currentContentRef`를 구분할 것.** pending은 "아직 안 저장된 변경", current는 "현재 에디터 내용". 색상 변경 등 content 필요 시 current 사용

### 에디터
- **한글 IME 조합 중 이벤트 처리 빼먹지 말 것.** compositionstart/compositionend 플래그 없이 keydown/input 처리하면 한글 입력 깨짐
- **ProseMirror DOM을 직접 조작하지 말 것.** 반드시 Transaction/Command를 통해 상태 변경
- **view.dispatch 몽키패칭을 남용하지 말 것.** 가능한 Milkdown 플러그인 API 활용

### 파일 I/O
- **비동기 저장 호출에 try/catch 반드시 적용.** 디스크 오류, 권한 문제, 파일 잠금 등 Windows 환경에서 빈번
- **gray-matter의 `---` 구분자 혼동 주의.** 메모 본문에 `---`가 포함된 경우 반드시 테스트 (excerpt: false 필수)
- **파일명에 UUID만 사용.** 사용자 입력(제목 등)을 파일명에 쓰면 특수문자 문제 발생

### 윈도우 관리
- **BrowserWindow 이벤트 리스너를 해제하지 않으면 메모리 릭.** `closed` 이벤트에서 `removeAllListeners()` + Map 삭제 필수
- **롤업 상태에서 getBounds().height를 저장하면 32px이 영속됨.** 반드시 prevHeight를 별도 추적
- **setMinimumSize()를 롤업 전후로 동적 전환하지 않으면 크래시.** minHeight:150과 height:32가 충돌

### 개발 환경 프로세스 관리
- **`npm run dev` 실행 후 반드시 정상 종료할 것.** 트레이 "종료"로 닫거나, `cmd.exe /c "taskkill /F /IM electron.exe"`로 확실히 죽여야 함. bash에서 `taskkill /F`는 `/F`가 경로로 파싱되어 안 먹힘
- **background로 `electron-vite dev`를 여러 번 실행하지 말 것.** 첫 Electron이 Windows mutex(single instance lock)를 잡고, 이후 실행은 전부 `gotTheLock: false`로 즉시 종료됨
- **좀비 Electron 프로세스가 남으면 앱이 실행 불가.** `requestSingleInstanceLock()`이 false 반환하여 즉시 quit. 반드시 `cmd.exe /c "taskkill /F /IM electron.exe"`로 정리 후 재실행
- **디버깅 시 console 출력이 안 보이는 환경이면** 파일 로깅(`appendFileSync`)으로 우회. 하지만 디버그 코드는 반드시 커밋 전 제거

### 빌드/배포
- **`npm run build` 전에 반드시 `npm run typecheck` 통과 확인.** vite 빌드는 타입 에러를 무시할 수 있음
- **electron-builder의 postinstall이 native deps를 리빌드함.** 패키지 추가 후 에러 나면 `npm run postinstall` 재실행

### 프로세스
- **Phase별 5라운드 검증을 건너뛰지 말 것.** 특히 Round 3(회귀 테스트)를 빼먹으면 이전 기능이 조용히 깨짐
- **기술부채를 다음 Phase로 이월하지 말 것.** D1~D4처럼 해당 Phase에서 불가피한 것만 예외
- **한 번에 너무 많은 Phase를 합치지 말 것.** 8a+8b는 본질적으로 하나여서 합쳤지만, 독립 Phase는 분리 유지

---

## 6. 적용된 버그 방지 패턴

| ID | 내용 | 적용 위치 |
|----|------|-----------|
| B1 | writeQueue 동시 쓰기 방지 | json-store.ts |
| B2 | isTransitioning 롤업 빠른 토글 방지 | window-manager.ts |
| B3 | isComposing IME 조합 중 무시 | useSlashCommand.ts |
| B4 | onMouseDown+preventDefault 포커스 유지 | EditorToolbar.tsx |
| B5 | gray-matter excerpt:false | memo-file.ts |
| B6 | 저장 전 내용 비교 | memo-file.ts |
| B8 | pendingDeleteIds auto-save 스킵 | memo-file.ts |
| B11 | removeAllListeners + map 삭제 | window-manager.ts |
| B13 | 저장 경로 폴백 | store.ts |
| B14 | maxOpenWindows 복원 제한 | index.ts |
| B15 | -webkit-app-region: no-drag | Titlebar.module.css |
| B20 | 빈 메모 파일 삭제 | memo-file.ts |
| B21 | 창 닫기 시 flush-save | window-manager.ts, App.tsx |
| B22 | requestSingleInstanceLock | index.ts |
| B25 | rename 재시도 3회 | json-store.ts, memo-file.ts |

### 미적용 (해당 Phase 미도달)

| ID | 내용 | 적용 Phase |
|----|------|------------|
| ~~B7~~ | ~~검색 input IME 처리~~ | ~~10a~~ → **적용됨** |
| B9 | 알람 HH:mm 비교 + lastTriggeredDate | 13b |
| B10 | 시스템 절전 후 밀린 알람 | 13b |
| B12 | frontmatter YAML 특수문자 라운드트립 | 7 (테스트 미실행) |
| B16 | 색상 피커 창 경계 잘림 | 5 (발생 시 대응) |
| B17 | 장문 10,000자 + 작은 창 스크롤 | 6 (테스트 미실행) |
| B18 | 다크 모드 전환 멀티윈도우 깜빡임 | 12 |
| B19 | z-index 체계 | 8a+ (현재 부분 적용) |
| B23 | 삭제된 메모 알람 미해제 | 10b, 13b |
| B24 | 백업 복원 시 열린 메모 충돌 | 11 |
| B26 | Squirrel 첫 실행 이벤트 | 14 |
| B27 | 설정 onChange 즉시 저장 | 11 |
| B28 | Ctrl+스크롤 빠른 반복 throttle | 13 |
| B29 | 백업 중 파일 스냅샷 | 11 |
| B30 | 외부 에디터 수정 덮어씀 | v1.0 제외 |

---

## 7. 파일 구조 (기술부채 정리 완료 시점)

```
C:\Projects\Memo\
├── package.json
├── electron.vite.config.ts
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── resources/icon.png          (placeholder)
└── src/
    ├── shared/
    │   └── types.ts                 # 공유 타입 (MemoFrontmatter, AlarmData, MemoData)
    ├── main/
    │   ├── index.ts                 # 앱 진입점, 상태 복원
    │   └── lib/
    │       ├── constants.ts         # 경로/크기 상수
    │       ├── types.ts             # 윈도우/앱 상태 타입 + 기본값
    │       ├── json-store.ts        # JSON 파일 저장소 (writeQueue)
    │       ├── store.ts             # state/settings 스토어
    │       ├── window-manager.ts    # 멀티윈도우 관리 + IPC
    │       ├── tray.ts              # 시스템 트레이
    │       ├── manager-window.ts   # 관리자 창 생성 + IPC
    │       └── memo-file.ts         # .md 파일 CRUD + frontmatter + 내보내기/가져오기
    ├── preload/
    │   ├── index.ts                 # contextBridge API (공유 타입 사용)
    │   └── index.d.ts               # 타입 선언
    └── renderer/
        ├── index.html
        └── src/
            ├── main.tsx
            ├── App.tsx              # 루트 (상태 관리, 자동 저장)
            ├── env.d.ts
            ├── constants/
            │   ├── colors.ts        # 7색 프리셋
            │   └── slash-commands.ts # 12종 슬래시 커맨드
            ├── plugins/
            │   └── underline-plugin.ts  # ProseMirror 밑줄 마크 + remark 플러그인
            ├── components/
            │   ├── Titlebar.tsx / .module.css
            │   ├── ColorPalette.tsx / .module.css
            │   ├── MemoEditor.tsx / .css
            │   ├── EditorToolbar.tsx / .module.css
            │   ├── SlashDropdown.tsx / .module.css
            │   └── ManagerWindow.tsx / .module.css
            └── hooks/
                ├── useSlashCommand.ts
                └── useSlashExecute.ts
```
