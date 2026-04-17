import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import GenerateInvoice from './pages/GenerateInvoice';
import DownloadInvoices from './pages/DownloadInvoices';
import ConvertToPDF from './pages/ConvertToPDF';
import XlsxToXml from './pages/XlsxToXml';
import Contacts from './pages/Contacts';
import Settings from './pages/Settings';
import ValidateXml from './pages/ValidateXml';

function App() {
  return (
    <BrowserRouter basename="/ksef-web">
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/generate" replace />} />
          <Route path="generate" element={<GenerateInvoice />} />
          <Route path="download" element={<DownloadInvoices />} />
          <Route path="convert" element={<ConvertToPDF />} />
          <Route path="xlsx-to-xml" element={<XlsxToXml />} />
          <Route path="validate" element={<ValidateXml />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
