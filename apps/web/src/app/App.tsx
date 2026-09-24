import { RouterProvider } from 'react-router-dom';
import { appRouter } from '../routes/AppRoutes';

export default function App() {
  return <RouterProvider router={appRouter} />;
}
