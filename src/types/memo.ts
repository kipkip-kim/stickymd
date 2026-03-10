/** 메모 메타데이터 (frontmatter에서 파싱) */
export interface MemoMeta {
  id: string;
  title: string;
  created: string;
  modified: string;
  pinned: boolean;
}

/** 메모 전체 데이터 */
export interface Memo {
  meta: MemoMeta;
  content: string;
  filePath: string;
}

/** 메모 목록 아이템 (사이드바용, content 미포함) */
export interface MemoListItem {
  id: string;
  title: string;
  modified: string;
  pinned: boolean;
  preview: string;
  filePath: string;
}

/** 에디터 모드 */
export type EditorMode = "wysiwyg" | "source";

/** 테마 모드 */
export type ThemeMode = "light" | "dark" | "system";

/** 메모 목록 응답 (페이지네이션) */
export interface MemoListResponse {
  items: MemoListItem[];
  total: number;
  hasMore: boolean;
}

/** 창 위치/크기 상태 */
export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 열린 스티키 윈도우 정보 (앱 종료 시 저장/복원용) */
export interface OpenStickyInfo {
  memoId: string;
  filePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 앱 설정 */
export interface AppConfig {
  currentDir: string;
  recentDirs: string[];
  defaultDir: string;
  autoSaveDelay: number;
  theme: ThemeMode;
  fontFamily: string;
  fontSize: number;
  editorWindowState: WindowState;
  openStickies: OpenStickyInfo[];
}
