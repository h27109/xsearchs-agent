import ChatLayout from "./components/ChatLayout";
import LoginPage from "./components/LoginPage";
import SetPasswordPage from "./components/SetPasswordPage";
import { useState, useEffect } from "react";
import { getAuth, clearAuth, verifyToken, setAuth, AuthState } from "./api/auth";

type PageState =
  | { stage: "loading" }
  | { stage: "login" }
  | { stage: "set_password"; userId: string }
  | { stage: "chat"; auth: AuthState };

function App() {
  const [page, setPage] = useState<PageState>({ stage: "loading" });

  useEffect(() => {
    const saved = getAuth();
    if (saved) {
      verifyAuth().then((info) => {
        if (info?.valid) {
          const updated = { ...saved, is_admin: info.is_admin };
          setAuth(updated);
          setPage({ stage: "chat", auth: updated });
        } else {
          clearAuth();
          setPage({ stage: "login" });
        }
      });
    } else {
      setPage({ stage: "login" });
    }
  }, []);

  if (page.stage === "loading") return null;
  if (page.stage === "login")
    return (
      <LoginPage
        onLogin={(auth) => setPage({ stage: "chat", auth })}
        onNeedSetPassword={(userId) =>
          setPage({ stage: "set_password", userId })
        }
      />
    );
  if (page.stage === "set_password")
    return (
      <SetPasswordPage
        userId={page.userId}
        onSuccess={(auth) => setPage({ stage: "chat", auth })}
      />
    );
  return (
    <ChatLayout
      auth={page.auth}
      onLogout={() => {
        clearAuth();
        setPage({ stage: "login" });
      }}
    />
  );
}

export default App;
