import { Toaster as Sonner } from "sonner";

const Toaster = () => (
  <>
    <style>{`
      [data-sonner-toast] > [data-close-button] {
        left: auto !important;
        right: 0 !important;
        transform: translate(35%, -35%) !important;
      }
      [data-sonner-toast] [data-content] {
        padding-right: 1.25rem;
      }
    `}</style>
    <Sonner position="top-right" richColors closeButton />
  </>
);

export { Toaster };
