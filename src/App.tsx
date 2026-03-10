import { TitleBar } from "./components/TitleBar/TitleBar";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { EditorArea } from "./components/EditorArea/EditorArea";
import { useAppInit } from "./hooks/useAppInit";

function App() {
  const { isLoading, loadError } = useAppInit();

  return (
    <div className="flex flex-col h-screen">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        {isLoading ? (
          <div
            className="flex-1 flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            <p style={{ color: "var(--text-muted)" }}>로딩 중...</p>
          </div>
        ) : loadError ? (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-2"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            <p style={{ color: "var(--accent-danger)" }}>로드 실패</p>
            <p
              className="text-xs max-w-md text-center"
              style={{ color: "var(--text-muted)" }}
            >
              {loadError}
            </p>
          </div>
        ) : (
          <EditorArea />
        )}
      </div>
    </div>
  );
}

export default App;
