# Phase 14: Windows Installer Planning Document

> **Summary**: electron-builder를 사용한 Windows 설치 프로그램(.exe) 빌드
>
> **Project**: Sticky Memo
> **Version**: 1.0.0
> **Date**: 2026-03-12
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 현재 개발 환경(npm run dev)에서만 실행 가능. 일반 사용자가 설치할 수 없음 |
| **Solution** | electron-builder로 NSIS 설치 프로그램 생성, 자동 업데이트 기반 구조 포함 |
| **Function/UX Effect** | 더블클릭 설치 → 바탕화면/시작메뉴 바로가기 → 즉시 사용 가능 |
| **Core Value** | 개발 완료된 앱을 실제 사용자에게 배포 가능한 형태로 변환 |

---

## 1. Overview

### 1.1 Purpose

개발 완료된 Sticky Memo 앱을 Windows 사용자가 설치할 수 있는 `.exe` 설치 파일로 패키징.

### 1.2 Background

- Phase 1~15까지 기능 개발 및 안정화 완료
- `electron-builder` v26이 이미 devDependency에 포함되어 있음
- `package.json`에 `build:win` 스크립트가 이미 존재: `npm run build && electron-builder --win`
- 리소스 폴더에 `icon.png` 존재 (Windows는 `.ico` 필요)

---

## 2. Scope

### 2.1 In Scope

- [ ] electron-builder 설정 (`electron-builder.yml` 또는 `package.json` build 섹션)
- [ ] 앱 아이콘 `.ico` 변환 및 설정
- [ ] NSIS 설치 프로그램 생성 (설치/제거 지원)
- [ ] 앱 메타데이터 (이름, 버전, 설명, 저작권)
- [ ] 시작 메뉴 + 바탕화면 바로가기
- [ ] 제거 프로그램 (프로그램 추가/제거에 등록)
- [ ] 설치 프로그램 빌드 테스트
- [ ] 사용자 데이터 경로 (`~/Documents/StickyMemo/`) 보존

### 2.2 Out of Scope

- 자동 업데이트 (electron-updater) — v2.0에서 검토
- 코드 서명 (Code Signing Certificate) — 비용 발생, 추후 별도 진행
- Mac/Linux 빌드 — Windows 전용 우선
- Microsoft Store 등록
- CI/CD 파이프라인 (GitHub Actions 자동 빌드)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | NSIS 설치 프로그램(.exe) 생성 | High | Pending |
| FR-02 | 설치 시 바탕화면/시작메뉴 바로가기 생성 | High | Pending |
| FR-03 | 제거 프로그램 등록 (프로그램 추가/제거) | High | Pending |
| FR-04 | 설치 경로 선택 가능 (기본: Program Files) | Medium | Pending |
| FR-05 | 기존 버전 위 덮어쓰기 설치 지원 | Medium | Pending |
| FR-06 | 설치 완료 후 앱 자동 실행 옵션 | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 설치파일 크기 | < 100MB | 빌드 결과 확인 |
| 설치 시간 | < 30초 (SSD 기준) | 수동 테스트 |
| 제거 후 잔여 | 사용자 데이터(Documents/StickyMemo)는 보존 | 수동 테스트 |
| 경로 호환 | 한글 사용자명/경로 정상 동작 | 수동 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] `npm run build:win` 실행 시 `.exe` 설치파일 생성
- [ ] 설치 → 실행 → 메모 작성 → 종료 → 재실행 → 복원 정상 동작
- [ ] 제거 시 프로그램 파일 삭제, 사용자 데이터 보존
- [ ] 시스템 트레이 아이콘 정상 표시
- [ ] 자동 시작(시작 프로그램 등록) 정상 동작

### 4.2 Quality Criteria

- [ ] tsc 에러 0
- [ ] 빌드 성공
- [ ] 설치파일 실행 시 Windows Defender 경고 외 오류 없음

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 코드 서명 없어 SmartScreen 경고 | Medium | High | 사용자 안내 문구 (예상된 동작) |
| 한글 경로에서 설치 실패 | High | Low | NSIS unicode 설정 활성화 |
| asar 패키징 시 native module 문제 | High | Low | `asarUnpack` 설정으로 해결 |
| 앱 아이콘 안 보임 | Low | Medium | .ico 파일 올바른 크기(256x256)로 변환 |
| 기존 사용자 데이터 경로 충돌 | High | Low | AppData/Documents 경로는 installer가 건드리지 않음 |

---

## 6. Implementation Plan

### 6.1 electron-builder 설정

`electron-builder.yml` 파일 생성:

```yaml
appId: com.stickymemo.app
productName: Sticky Memo
directories:
  output: dist
  buildResources: resources
files:
  - out/**/*
  - "!node_modules/**/*"
win:
  target: nsis
  icon: resources/icon.ico
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Sticky Memo
  runAfterFinish: true
  unicode: true
  deleteAppDataOnUninstall: false
```

### 6.2 아이콘 준비

- `resources/icon.png` → `resources/icon.ico` 변환 필요
- Windows .ico는 최소 256x256 포함 권장
- 방법: `png-to-ico` npm 패키지 또는 온라인 변환기

### 6.3 package.json 메타데이터

```json
{
  "author": "StickyMemo",
  "description": "경량 마크다운 스티키 메모 앱",
  "homepage": "",
  "license": "MIT"
}
```

### 6.4 빌드 순서

1. 아이콘 `.ico` 준비
2. `electron-builder.yml` 생성
3. `package.json` 메타데이터 보완
4. `npm run build:win` 실행
5. 생성된 `.exe` 설치 테스트
6. 설치 → 실행 → 기능 테스트 → 제거 테스트

---

## 7. File Changes

| File | Change |
|------|--------|
| `electron-builder.yml` | 신규 — 빌드 설정 |
| `resources/icon.ico` | 신규 — Windows 앱 아이콘 |
| `package.json` | 수정 — author, description 메타데이터 보완 |

---

## 8. Next Steps

1. [ ] Write design document (`phase14-installer.design.md`)
2. [ ] Start implementation
3. [ ] Build and test installer

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-12 | Initial draft | AI |
