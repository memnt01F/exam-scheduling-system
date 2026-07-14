import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Component } from "react";
import { Toaster } from "./components/ui/sonner.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CoursesProvider, useCourses } from "./context/CoursesContext.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import BookingPage from "./pages/BookingPage.jsx";
import PreferencesPage from "./pages/PreferencesPage.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import DepartmentHeadDashboard from "./pages/DepartmentHeadDashboard.jsx";
import NotFound from "./pages/NotFound.jsx";
import RequireRole from "./components/RequireRole.jsx";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { crashed: true, message: error?.message || "Unknown error" };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 16, padding: 24, textAlign: "center", fontFamily: "inherit",
        }}>
          <p style={{ fontSize: 18, fontWeight: 500 }}>Something went wrong</p>
          <p style={{ fontSize: 13, color: "var(--clr-muted, #6b7b8f)", maxWidth: 380, lineHeight: 1.6 }}>
            {this.state.message}
          </p>
          <button
            style={{
              padding: "8px 20px", borderRadius: 8,
              border: "1px solid var(--clr-border, #dde2ea)",
              background: "var(--clr-primary, #1a7a4c)", color: "#fff",
              fontSize: 14, cursor: "pointer",
            }}
            onClick={() => {
              this.setState({ crashed: false, message: "" });
              window.location.reload();
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppLoader = ({ children }) => {
  const { loading } = useCourses();
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
      }}>
        <div style={{
          width: 32, height: 32,
          border: "3px solid var(--clr-border, #dde2ea)",
          borderTopColor: "var(--clr-primary, #1a7a4c)",
          borderRadius: "50%",
          animation: "spin 0.75s linear infinite",
        }} />
        <p style={{ fontSize: 13, color: "var(--clr-muted, #6b7b8f)" }}>Loading…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  return children;
};

const App = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <CoursesProvider>
          <AppLoader>
            <Toaster />
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/dashboard" element={<RequireRole allow={['coordinator']}><Dashboard /></RequireRole>} />
              <Route path="/booking/:courseId" element={<RequireRole allow={['coordinator', 'admin']}><BookingPage /></RequireRole>} />
              <Route path="/preferences/:courseCode" element={<RequireRole allow={['coordinator']}><PreferencesPage /></RequireRole>} />
              <Route path="/committee" element={<RequireRole allow={['committee']}><DepartmentHeadDashboard /></RequireRole>} />
              <Route path="/admin" element={<RequireRole allow={['admin']}><AdminDashboard /></RequireRole>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLoader>
        </CoursesProvider>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
