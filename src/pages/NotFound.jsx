import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="page-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">404</h1>
        <p className="text-sm text-muted mt-2">Page not found</p>
        <a href="/" className="btn btn-outline mt-4" style={{ display: 'inline-flex' }}>
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;

