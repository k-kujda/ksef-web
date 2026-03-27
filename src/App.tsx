import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import GenerateInvoice from './pages/GenerateInvoice';
import DownloadInvoices from './pages/DownloadInvoices';
import ConvertToPDF from './pages/ConvertToPDF';
import Contacts from './pages/Contacts';
import Settings from './pages/Settings';

function App() {
  return (
    <BrowserRouter basename="/ksef-web">
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/generate" replace />} />
          <Route path="generate" element={<GenerateInvoice />} />
          <Route path="download" element={<DownloadInvoices />} />
          <Route path="convert" element={<ConvertToPDF />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
