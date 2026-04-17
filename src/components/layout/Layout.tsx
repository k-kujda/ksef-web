import { Outlet, Link, useLocation } from 'react-router-dom';
import { FileText, Download, FileImage, FileSpreadsheet, ShieldCheck, Users, Settings as SettingsIcon } from 'lucide-react';
import GitInfo from '../GitInfo';

export default function Layout() {
  const location = useLocation();

  const navItems = [
    { path: '/generate', label: 'Generuj fakturę', icon: FileText },
    { path: '/download', label: 'Pobierz z KSeF', icon: Download },
    { path: '/convert', label: 'Konwertuj do PDF', icon: FileImage },
    { path: '/xlsx-to-xml', label: 'XLSX do XML', icon: FileSpreadsheet },
    { path: '/validate', label: 'Walidacja XML', icon: ShieldCheck },
    { path: '/contacts', label: 'Kontakty', icon: Users },
    { path: '/settings', label: 'Ustawienia', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <aside className="w-64 bg-white shadow-lg min-h-screen">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-800">KSeF Web</h1>
            <p className="text-sm text-gray-500 mt-1">System e-Faktur</p>
          </div>
          <nav className="mt-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
      <GitInfo />
    </div>
  );
}
