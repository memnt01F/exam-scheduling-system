import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "./components/ui/sonner.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CoursesProvider } from "./context/CoursesContext.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import BookingPage from "./pages/BookingPage.jsx";
import CommitteeDashboard from "./pages/CommitteeDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import NotFound from "./pages/NotFound.jsx";

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <CoursesProvider>
        <Toaster />
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/booking/:courseId" element={<BookingPage />} />
          <Route path="/committee" element={<CommitteeDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </CoursesProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
