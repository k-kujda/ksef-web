import { useState } from 'react';
import { loadSettings, saveSettings, AppSettings } from '../lib/settings';
import { KSeFEnvironment } from '../lib/ksef/constants';

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Ustawienia</h1>
      
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Środowisko KSeF
          </label>
          <select
            value={settings.environment}
            onChange={(e) => setSettings({ ...settings, environment: e.target.value as KSeFEnvironment })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={KSeFEnvironment.TEST}>Test</option>
            <option value={KSeFEnvironment.DEMO}>Demo</option>
            <option value={KSeFEnvironment.PROD}>Produkcja</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            NIP
          </label>
          <input
            type="text"
            value={settings.nip}
            onChange={(e) => setSettings({ ...settings, nip: e.target.value })}
            placeholder="1234567890"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Token KSeF
          </label>
          <input
            type="password"
            value={settings.ksefToken}
            onChange={(e) => setSettings({ ...settings, ksefToken: e.target.value })}
            placeholder="••••••••••••••••"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-sm text-gray-500">
            Token używany do uwierzytelniania w systemie KSeF
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            CORS Proxy URL (opcjonalnie)
          </label>
          <input
            type="text"
            value={settings.corsProxyUrl || ''}
            onChange={(e) => setSettings({ ...settings, corsProxyUrl: e.target.value })}
            placeholder="https://cors-proxy.example.com/"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-sm text-gray-500">
            Wymagane jeśli API KSeF nie obsługuje CORS dla przeglądarek
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Zapisz ustawienia
          </button>
          {saved && (
            <span className="text-green-600 text-sm font-medium">
              ✓ Zapisano
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
